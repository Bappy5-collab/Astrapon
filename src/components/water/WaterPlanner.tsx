"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { More, Section } from "@/components/farm/ui";
import { SceneShell } from "@/components/field3d/FieldViewport";
import { SceneErrorBoundary } from "@/components/scene/SceneErrorBoundary";
import { SceneMessage } from "@/components/scene/SceneMessage";
import { detectGraphicsCapability, type GraphicsCapability } from "@/components/scene/webgl";
import type { BoundaryGeometry, Position } from "@/domain/geo/boundary";
import { OUTCOME_TEXT, depthBelowGround, type RankedStation } from "@/domain/water/groundwater";
import { ATTAINABLE_APPLICATION_EFFICIENCY, METHOD_LABELS, type IrrigationMethod, type RunDemand } from "@/domain/water/demand";
import { computeWaterEnergy, type InputBasis, type PlannerInput, type PlannerResult } from "@/domain/water/plan";
import { WaterInputError } from "@/domain/water/pump";
import { CATEGORY_LABEL, distanceMeaning, type MappedSource } from "@/domain/water/surface";
import { useReducedMotion } from "@/lib/preferences";
import type { GroundwaterLookup, SolarOutcome, SurfaceLookup } from "@/domain/water/lookup-types";
import { color, radius, tokens } from "@/theme/tokens";

import { ClassChip, monthLabel, num, ResultsView } from "./ResultsView";
import type { WaterPart } from "./WaterScene";

const WaterMapGL = dynamic(() => import("./WaterMapGL"), { ssr: false, loading: () => <SceneMessage title="Loading the map…" busy /> });
const WaterScene = dynamic(() => import("./WaterScene"), { ssr: false, loading: () => <SceneMessage title="Loading the 3D schematic…" busy /> });

type ActionErr = { ok: false; message: string; auth?: boolean };
export type PlannerActions = {
  surface: (radiusM: number) => Promise<SurfaceLookup | ActionErr>;
  groundwater: (radiusM: number) => Promise<GroundwaterLookup | ActionErr>;
  solar: () => Promise<SolarOutcome | ActionErr>;
  save: (raw: unknown) => Promise<{ ok: true; id: string; version: number; message: string } | ActionErr>;
};
export type RunChoice = { runId: string; resultSha256: string; scenarioName: string; finishedAt: string | null; demand: RunDemand };

type Load<T> = { state: "idle" | "loading" | "done" | "error"; data?: T; error?: string; at?: number };
const isErr = (v: unknown): v is ActionErr => typeof v === "object" && v != null && (v as { ok?: unknown }).ok === false && "message" in (v as object) && !("reason" in (v as object));

/** A numeric text field kept as text; parsed with `parse`. */
const parse = (s: string): number | null => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

function Num({ label, value, onChange, unit, helper, width = 170, id }: { label: string; value: string; onChange: (v: string) => void; unit?: string; helper?: string; width?: number; id?: string }) {
  const bad = value.trim() !== "" && parse(value) == null;
  return (
    <TextField
      id={id}
      label={unit ? `${label} (${unit})` : label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size="small"
      inputMode="decimal"
      error={bad}
      helperText={bad ? "Enter a number" : helper}
      sx={{ width: { xs: "100%", sm: width } }}
    />
  );
}

const RADII_SURFACE = [1000, 3000, 5000, 10000];
const RADII_GW = [5000, 10000, 25000];
const PIPE_MATERIALS = [
  { id: "pvc", label: "PVC / PE plastic (ε 0.0015 mm)", eps: 0.0015 },
  { id: "steel", label: "Commercial steel (ε 0.045 mm)", eps: 0.045 },
  { id: "galv", label: "Galvanised iron (ε 0.15 mm)", eps: 0.15 },
  { id: "cast", label: "Cast iron (ε 0.26 mm)", eps: 0.26 },
];

let cachedCap: GraphicsCapability | undefined;
const noSubscribe = () => () => {};
const getCap = () => (cachedCap ??= detectGraphicsCapability());

const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${num(m / 1000, 1)} km`);

export function WaterPlanner({ fieldId, fieldName, boundary, areaHa, runs, initialRunId, actions }: { fieldId: string; fieldName: string; boundary: BoundaryGeometry; areaHa: number; runs: RunChoice[]; initialRunId: string | null; actions: PlannerActions }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  // MapLibre needs WebGL2; without it the lists below are the full, usable view.
  const capability = useSyncExternalStore<GraphicsCapability | null>(noSubscribe, getCap, () => null);
  const mapUnavailable = <SceneMessage title="Map unavailable on this device" body="This browser did not provide WebGL, so the map cannot be drawn. Every source and well, with its distance and dates, is listed on the right, and the results do not depend on the map." />;

  // ------------------------------------------------------------- lookups ---
  const [surfaceRadius, setSurfaceRadius] = useState(3000);
  const [gwRadius, setGwRadius] = useState(10000);
  const [surface, setSurface] = useState<Load<Extract<SurfaceLookup, { ok: true }>>>({ state: "loading" });
  const [gw, setGw] = useState<Load<Extract<GroundwaterLookup, { ok: true }>>>({ state: "loading" });
  const [solar, setSolar] = useState<Load<Extract<SolarOutcome, { ok: true }>>>({ state: "loading" });
  const seq = useRef({ surface: 0, gw: 0, solar: 0 });
  const [authLost, setAuthLost] = useState(false);

  const runLookup = useCallback(
    async <T,>(kind: "surface" | "gw" | "solar", call: () => Promise<T | ActionErr>, set: (l: Load<never> | Load<T>) => void, okOf: (v: T) => { ok: true; value: T } | { ok: false; message: string }, markLoading = true) => {
      const id = ++seq.current[kind];
      if (markLoading) set({ state: "loading" });
      try {
        const res = await call();
        if (id !== seq.current[kind]) return; // a newer request (other radius/field) superseded this one
        if (isErr(res)) {
          if (res.auth) setAuthLost(true);
          set({ state: "error", error: res.message });
          return;
        }
        const r = okOf(res as T);
        set(r.ok ? { state: "done", data: r.value, at: Date.now() } : { state: "error", error: r.message });
      } catch {
        if (id === seq.current[kind]) set({ state: "error", error: "The request did not complete. Check your connection and try again." });
      }
    },
    [],
  );

  const loadSurface = useCallback((r: number, markLoading = true) => runLookup("surface", () => actions.surface(r), setSurface as never, (v: SurfaceLookup) => (v.ok ? { ok: true, value: v } : { ok: false, message: v.message }), markLoading), [actions, runLookup]);
  const loadGw = useCallback((r: number, markLoading = true) => runLookup("gw", () => actions.groundwater(r), setGw as never, (v: GroundwaterLookup) => (v.ok ? { ok: true, value: v } : { ok: false, message: v.message }), markLoading), [actions, runLookup]);
  const loadSolar = useCallback((markLoading = true) => runLookup("solar", () => actions.solar(), setSolar as never, (v: SolarOutcome) => (v.ok ? { ok: true, value: v } : { ok: false, message: v.error }), markLoading), [actions, runLookup]);

  // A new field (or boundary) starts a clean planner and new lookups; selections from another field are dropped.
  const fieldKey = useMemo(() => `${fieldId}:${JSON.stringify(boundary).length}:${JSON.stringify(boundary).slice(0, 80)}`, [fieldId, boundary]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedWell, setSelectedWell] = useState<string | null>(null);
  // The page remounts this component per field (key), so selections never carry over between fields.
  useEffect(() => {
    // Lookups run automatically for the field's location; slow providers never block the rest of the page.
    // Initial state is already "loading"; results arrive asynchronously.
    // Deferred one tick so a development double-mount sends each request once.
    const t = setTimeout(() => {
      void loadGw(10000, false);
      void loadSolar(false);
      void loadSurface(3000, false);
    }, 0);
    return () => clearTimeout(t);
  }, [fieldKey, loadGw, loadSolar, loadSurface]);

  // ------------------------------------------------------------- inputs ---
  const [sourceKind, setSourceKind] = useState<"surface" | "well">("surface");
  const [farmerSource, setFarmerSource] = useState<{ on: boolean; label: string; distance: string }>({ on: false, label: "", distance: "" });
  const [depthMode, setDepthMode] = useState<"measured" | "proxy" | "hypothetical" | "unknown">("unknown");
  const [levelKind, setLevelKind] = useState<"pumping" | "static_plus_drawdown">("pumping");
  const [depthLow, setDepthLow] = useState("");
  const [depthHigh, setDepthHigh] = useState("");
  const [ddLow, setDdLow] = useState("");
  const [ddHigh, setDdHigh] = useState("");
  const [deliveryAboveGround, setDeliveryAboveGround] = useState("");
  const [aboveWaterLow, setAboveWaterLow] = useState("");
  const [aboveWaterHigh, setAboveWaterHigh] = useState("");
  const [pressure, setPressure] = useState("0");
  const [pipeLow, setPipeLow] = useState("");
  const [pipeHigh, setPipeHigh] = useState("");
  const [pipeBasis, setPipeBasis] = useState<InputBasis>("farmer_report");
  const [diameter, setDiameter] = useState("");
  const [material, setMaterial] = useState("pvc");
  const [kLow, setKLow] = useState("");
  const [kHigh, setKHigh] = useState("");
  const [eta, setEta] = useState("");
  const [runtime, setRuntime] = useState("");
  const [pr, setPr] = useState("");
  const [ctrl, setCtrl] = useState("");
  const [startingValues, setStartingValues] = useState(false);
  const [solarMode, setSolarMode] = useState<"size" | "evaluate">("size");
  const [existingKwp, setExistingKwp] = useState("");
  const [capacity, setCapacity] = useState("");
  const [budget, setBudget] = useState("");
  const [tank, setTank] = useState("");

  const [demandMode, setDemandMode] = useState<"run" | "manual">(runs.length ? "run" : "manual");
  const [runId, setRunId] = useState<string | null>(initialRunId && runs.some((r) => r.runId === initialRunId) ? initialRunId : runs[0]?.runId ?? null);
  const [manualDaily, setManualDaily] = useState("");
  const [manualMonths, setManualMonths] = useState<number[]>([]);
  const [manualBasis, setManualBasis] = useState<"farmer_report" | "hypothetical_input">("farmer_report");
  const [method, setMethod] = useState<IrrigationMethod | "own">("furrow");
  const [ownEff, setOwnEff] = useState("");
  const [conveyance, setConveyance] = useState("100");
  const [part, setPart] = useState<WaterPart | null>(null);
  const [view, setView] = useState<"map" | "3d">("map");
  const [basemap, setBasemap] = useState<"satellite" | "streets">("satellite");

  const applyStarting = () => {
    // Visible, labelled starting values the farmer can replace; never applied silently.
    if (!diameter) setDiameter("50");
    if (!kLow) setKLow("2");
    if (!kHigh) setKHigh("6");
    if (!eta) setEta("45");
    if (!runtime) setRuntime("6");
    if (!pr) setPr("75");
    if (!ctrl) setCtrl("95");
    if (!deliveryAboveGround) setDeliveryAboveGround("1");
    setStartingValues(true);
  };

  const surfaceData = surface.data;
  const chosenSource: MappedSource | null = surfaceData?.sources.find((s) => s.id === selectedSource) ?? null;
  const stations = gw.data?.stations ?? [];
  const chosenWell: RankedStation | null = stations.find((s) => `${s.provider}:${s.stationId}` === selectedWell) ?? null;
  const run = runs.find((r) => r.runId === runId) ?? null;

  // Proxy: the selected station's depth below ground over the returned observations (min–max), derived only when compatible.
  const proxy = useMemo(() => {
    if (!chosenWell) return null;
    const depths = chosenWell.measurements.map((m) => ({ m, d: depthBelowGround(m, chosenWell) })).filter((x) => x.d != null);
    if (!depths.length) return { ok: false as const, why: chosenWell.measurements.length ? "Its records are levels that cannot be turned into depth below ground here (reference point or datum unknown)." : "It has no water-level observations in the searched period." };
    const recent = depths.slice(0, 20);
    const vals = recent.map((x) => x.d!.depthM);
    const derived = recent.find((x) => x.d!.derived)?.d;
    return { ok: true as const, low: Math.min(...vals), high: Math.max(...vals), latest: recent[0]!, count: recent.length, derivation: derived && "method" in derived ? derived.method : null };
  }, [chosenWell]);

  /** Selecting a mapped source pre-fills the route length with the straight-line distance as a labelled minimum, unless the farmer typed a route. */
  const chooseSource = (id: string) => {
    setSourceKind("surface");
    setSelectedSource(id);
    setFarmerSource((f) => ({ ...f, on: false }));
    const s = surface.data?.sources.find((x) => x.id === id);
    if (s && (pipeBasis !== "farmer_report" || (!pipeLow && !pipeHigh))) {
      const d = String(Math.max(1, Math.round(s.distanceM)));
      setPipeLow(d);
      setPipeHigh(d);
      setPipeBasis("mapped_feature");
    }
  };

  // ------------------------------------------------------------ planner input ---
  const built = useMemo((): { input: PlannerInput | null; missing: string[] } => {
    const missing: string[] = [];
    const n = parse;
    const range = (lo: string, hi: string, name: string) => {
      const a = n(lo), b = n(hi === "" ? lo : hi);
      if (a == null || b == null) { missing.push(name); return null; }
      return { low: Math.min(a, b), high: Math.max(a, b) };
    };
    // demand
    let demand: PlannerInput["demand"] | null = null;
    if (demandMode === "run") {
      if (!run) missing.push("a finished comparison for water demand (or enter your own demand)");
      else demand = { mode: "run", runId: run.runId, resultSha256: run.resultSha256, runKind: "historical_replay", options: run.demand.options.slice(0, 5) };
    } else {
      const d = n(manualDaily);
      if (d == null || !manualMonths.length) missing.push("your daily water volume and irrigation months");
      else demand = { mode: "manual", basis: manualBasis, dailyGrossM3: d, months: [...manualMonths].sort((a, b) => a - b), year: 2024 };
    }
    const app = method === "own" ? n(ownEff) : ATTAINABLE_APPLICATION_EFFICIENCY[method][0] * 100;
    if (app == null) missing.push("application efficiency");
    const conv = n(conveyance);
    if (conv == null) missing.push("conveyance efficiency");
    // lift
    let lift: PlannerInput["lift"] | null = null;
    if (sourceKind === "surface") {
      const r = range(aboveWaterLow, aboveWaterHigh, "height of the delivery point above the water surface");
      if (r) lift = { kind: "surface", deliveryAboveWaterM: r, basis: "farmer_report" };
    } else {
      const dag = n(deliveryAboveGround);
      if (dag == null) missing.push("height of the delivery point above the well head");
      let depth: { low: number; high: number } | null = null;
      let basis: InputBasis = "farmer_report";
      let lk = levelKind;
      let proxyRef: Extract<PlannerInput["lift"], { kind: "well" }>["proxy"] = null;
      if (depthMode === "measured") depth = range(depthLow, depthHigh, "your measured water level");
      else if (depthMode === "hypothetical") { depth = range(depthLow, depthHigh, "a hypothetical depth range"); basis = "hypothetical_input"; }
      else if (depthMode === "proxy") {
        if (!chosenWell || !proxy?.ok) missing.push("a nearby well with usable depth records (or another depth option)");
        else {
          depth = { low: proxy.low, high: proxy.high };
          basis = "ground_measurement_proxy";
          lk = chosenWell.measurements[0]?.levelState === "pumping" ? "pumping" : "static_plus_drawdown";
          proxyRef = { provider: chosenWell.provider, stationId: chosenWell.stationId, stationName: `${chosenWell.name} (${chosenWell.authority})`, distanceM: chosenWell.distanceM, observedAt: proxy.latest.m.time, originalValue: proxy.latest.m.originalValue, originalUnit: proxy.latest.m.originalUnit, derivation: proxy.derivation };
        }
      }
      const dd = lk === "static_plus_drawdown" && depthMode !== "unknown" ? range(ddLow, ddHigh, "drawdown while pumping (the static level needs it)") : null;
      if (dag != null) lift = { kind: "well", levelKind: lk, depthM: depthMode === "unknown" ? null : depth, drawdownM: dd, deliveryAboveGroundM: dag, basis, proxy: proxyRef };
      if (depthMode !== "unknown" && !depth) lift = null;
    }
    const pipeLen = range(pipeLow, pipeHigh, "pipe route length");
    const dia = n(diameter);
    if (dia == null) missing.push("pipe inner diameter");
    const k = range(kLow, kHigh, "fitting loss coefficient Σ K");
    const e = n(eta), rt = n(runtime), p = n(pr), c = n(ctrl), pk = n(pressure);
    if (e == null) missing.push("pump-and-motor efficiency");
    if (rt == null) missing.push("pumping hours per day");
    if (p == null) missing.push("PV performance ratio");
    if (c == null) missing.push("controller efficiency");
    if (pk == null) missing.push("delivery pressure");
    if (solarMode === "evaluate" && n(existingKwp) == null) missing.push("your existing PV capacity");
    if (missing.length || !demand || !lift || !pipeLen || !k || app == null || conv == null || dia == null || e == null || rt == null || p == null || c == null || pk == null) return { input: null, missing };
    const sourceRef = sourceKind === "surface" && chosenSource ? { provider: "OpenStreetMap", id: chosenSource.id, type: CATEGORY_LABEL[chosenSource.category], url: chosenSource.url, mappedAt: chosenSource.lastEdited } : sourceKind === "well" && chosenWell && depthMode === "proxy" ? { provider: chosenWell.provider, id: chosenWell.stationId, type: "monitoring well (proxy)", url: chosenWell.recordUrl, mappedAt: null } : null;
    return {
      missing,
      input: {
        schema: 1,
        areaHa,
        demand,
        efficiency: { application: app / 100, applicationBasis: method === "own" ? "farmer_report" : "default_assumption", method: method === "own" ? null : `${METHOD_LABELS[method]}: lower end of the attainable range (FAO W4367E, Keller 1992)`, conveyance: conv / 100, conveyanceBasis: conveyance === "100" ? "default_assumption" : "farmer_report" },
        source: {
          kind: sourceKind,
          label: sourceKind === "surface" ? (farmerSource.on ? farmerSource.label || "Farmer-reported source" : chosenSource ? `${chosenSource.name ?? CATEGORY_LABEL[chosenSource.category]}` : "Surface source (not selected)") : "Well",
          basis: sourceKind === "surface" ? (farmerSource.on ? "farmer_report" : "mapped_feature") : depthMode === "proxy" ? "ground_measurement_proxy" : depthMode === "hypothetical" ? "hypothetical_input" : "farmer_report",
          ref: sourceRef,
          straightLineM: sourceKind === "surface" ? (farmerSource.on ? n(farmerSource.distance) : chosenSource?.distanceM ?? null) : null,
          geometryNote: chosenSource && sourceKind === "surface" ? `Distance ${distanceMeaning(chosenSource.role)}` : null,
        },
        lift,
        deliveryPressureKPa: pk,
        pipe: { lengthM: pipeLen, lengthBasis: pipeBasis, innerDiameterMm: dia, roughnessMm: PIPE_MATERIALS.find((m) => m.id === material)!.eps, minorLossK: k },
        pump: { etaPumpMotor: e / 100, runtimeHoursPerDay: rt },
        solar: { performanceRatio: p / 100, controllerEfficiency: c / 100, mode: solarMode, existingKwp: solarMode === "evaluate" ? n(existingKwp) : null, summary: solar.data ? solar.data.summary : null },
        supply: { capacityM3PerDay: n(capacity), seasonalBudgetM3: n(budget), basis: "farmer_report" },
        storage: { tankM3: n(tank) },
        constants: { rho: 1000, g: 9.81 },
      },
    };
  }, [demandMode, run, manualDaily, manualMonths, manualBasis, method, ownEff, conveyance, sourceKind, aboveWaterLow, aboveWaterHigh, deliveryAboveGround, levelKind, depthMode, depthLow, depthHigh, chosenWell, proxy, ddLow, ddHigh, pipeLow, pipeHigh, diameter, kLow, kHigh, eta, runtime, pr, ctrl, pressure, solarMode, existingKwp, chosenSource, farmerSource, areaHa, pipeBasis, material, solar.data, capacity, budget, tank]);

  const computed = useMemo((): { result: PlannerResult | null; error: string | null } => {
    if (!built.input) return { result: null, error: null };
    try {
      return { result: computeWaterEnergy(built.input), error: null };
    } catch (e) {
      return { result: null, error: e instanceof WaterInputError ? e.message : "The calculation failed for these inputs." };
    }
  }, [built.input]);

  const stale = surface.state === "loading" || gw.state === "loading" || solar.state === "loading";
  const best = computed.result?.options[0] ?? null;
  const pvForScene = best?.totals.requiredKwp?.high ?? (solarMode === "evaluate" ? parse(existingKwp) : null);
  const flowing = !!best?.totals.energyKWhPerYear && (best.totals.grossM3PerYear ?? 0) > 0;

  // ---------------------------------------------------------------- save ---
  const [name, setName] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const save = () => {
    if (!built.input || !computed.result) return;
    const evidence = {
      surface: surface.data
        ? { search: { radiusM: surface.data.radiusM, ...surface.data.provider, found: surface.data.total, truncated: surface.data.truncated }, selected: chosenSource && sourceKind === "surface" && !farmerSource.on ? { id: chosenSource.id, name: chosenSource.name, category: chosenSource.category, role: chosenSource.role, distanceM: chosenSource.distanceM, intersects: chosenSource.intersects, lastEdited: chosenSource.lastEdited, url: chosenSource.url, tags: chosenSource.tags, fieldPoint: chosenSource.fieldPoint, sourcePoint: chosenSource.sourcePoint } : null, farmerSource: farmerSource.on ? { label: farmerSource.label, distanceM: parse(farmerSource.distance) } : null }
        : null,
      groundwater: gw.data
        ? { radiusM: gw.data.radiusM, fromDate: gw.data.fromDate, asOf: gw.data.asOf, countryHint: gw.data.countryHint, providers: gw.data.providers.map((p) => ({ id: p.id, name: p.name, consulted: p.consulted, outcome: p.outcome, message: p.message, stationsInRadius: p.stationsInRadius, licence: p.licence })), selected: chosenWell ? { provider: chosenWell.provider, stationId: chosenWell.stationId, authority: chosenWell.authority, name: chosenWell.name, distanceM: chosenWell.distanceM, aquifer: chosenWell.aquifer, wellDepthM: chosenWell.wellDepthM, groundElevation: chosenWell.groundElevation, recordUrl: chosenWell.recordUrl, retrievedAt: chosenWell.retrievedAt, measurements: chosenWell.measurements.slice(0, 20) } : null }
        : null,
      solar: solar.data ? solar.data.provenance : null,
    };
    startSave(async () => {
      const res = await actions.save({ name: name.trim() || `Water & energy ${new Date().toISOString().slice(0, 10)}`, inputs: built.input, evidence });
      if (!res.ok) {
        if ("auth" in res && res.auth) setAuthLost(true);
        setSaveMsg({ ok: false, text: res.message });
        return;
      }
      setSaveMsg({ ok: true, text: res.message });
      router.refresh();
    });
  };

  // ---------------------------------------------------------------- render ---
  const sceneSource = sourceKind === "surface"
    ? chosenSource && !farmerSource.on
      ? { kind: "surface" as const, label: chosenSource.name ?? CATEGORY_LABEL[chosenSource.category], geometry: chosenSource.geometry, fieldPoint: chosenSource.fieldPoint, sourcePoint: chosenSource.sourcePoint, distanceM: chosenSource.distanceM }
      : farmerSource.on ? { kind: "surface" as const, label: farmerSource.label || "Your source (position not mapped)", geometry: null, fieldPoint: null, sourcePoint: null, distanceM: parse(farmerSource.distance) } : null
    : { kind: "well" as const, label: "Well", geometry: null, fieldPoint: null, sourcePoint: null, distanceM: null };

  return (
    <Box>
      {authLost && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button href={`/sign-in?next=/fields/${fieldId}/water`}>Sign in</Button>}>
          Your session has ended. Sign in again; your inputs on this page are kept until you leave it.
        </Alert>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.05fr) minmax(0, 1fr)" }, gap: 2.5, alignItems: "start" }}>
        {/* ------------------------------------------------ map / 3D ------ */}
        <Box sx={{ position: { lg: "sticky" }, top: { lg: 84 } }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} aria-label="View">
              <ToggleButton value="map">Map</ToggleButton>
              <ToggleButton value="3d">3D schematic</ToggleButton>
            </ToggleButtonGroup>
            {view === "map" && (
              <ToggleButtonGroup size="small" exclusive value={basemap} onChange={(_, v) => v && setBasemap(v)} aria-label="Base map">
                <ToggleButton value="satellite">Satellite</ToggleButton>
                <ToggleButton value="streets">Streets</ToggleButton>
              </ToggleButtonGroup>
            )}
            {stale && <Chip size="small" icon={<CircularProgress size={12} />} label="Updating…" />}
          </Stack>
          <Box sx={{ position: "relative", height: { xs: 340, md: 460 }, borderRadius: `${radius.lg}px`, overflow: "hidden", border: `1px solid ${color.line}` }}>
            {view === "map" ? (
              capability == null ? (
                <SceneMessage title="Checking map support…" busy />
              ) : capability.support !== "webgl2" ? (
                mapUnavailable
              ) : (
              <SceneErrorBoundary fallback={() => mapUnavailable}>
              <WaterMapGL
                boundary={boundary}
                radiusM={sourceKind === "surface" ? surfaceRadius : gwRadius}
                sources={(surfaceData?.sources ?? []).map((s) => ({ id: s.id, geometry: s.geometry, label: s.name ?? CATEGORY_LABEL[s.category] }))}
                wells={stations.map((s) => ({ key: `${s.provider}:${s.stationId}`, lon: s.lon, lat: s.lat, label: s.name, tone: s.recency === "recent" ? "recent" : s.recency === "historical" ? "historical" : "none" }))}
                selectedSource={selectedSource}
                selectedWell={selectedWell}
                link={chosenSource && sourceKind === "surface" && !farmerSource.on ? { from: chosenSource.fieldPoint as Position, to: chosenSource.sourcePoint as Position } : null}
                basemap={basemap}
                onSelectSource={chooseSource}
                onSelectWell={(k) => { setSourceKind("well"); setSelectedWell(k); }}
                label={`Map of ${fieldName} with mapped water sources and monitoring wells`}
              />
              </SceneErrorBoundary>
              )
            ) : (
              <SceneShell
                label="Schematic: source direction and distance from the map; pump, pipe, panels and tank positions are illustrative. Flow animation is not live data."
                renderScene={(c) => <WaterScene {...c} boundary={boundary} source={sceneSource} pvKwp={pvForScene} tankM3={parse(tank)} flowing={flowing} reducedMotion={reducedMotion} selected={part} onSelect={setPart} />}
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            Dashed white outline: the searched area ({km(sourceKind === "surface" ? surfaceRadius : gwRadius)} from the field edge). Blue: mapped water. Dots: monitoring wells (green recent, amber older records, grey no records). Map tiles are pictures, not analytical data.
          </Typography>
          {view === "3d" && (
            <Box component="ul" aria-label="Scene parts" sx={{ pl: 3, mt: 1, mb: 0 }}>
              <li>Source: {sceneSource ? `${sceneSource.label}${sceneSource.distanceM != null ? `, ${km(sceneSource.distanceM)} straight line` : ""}` : "not chosen"}</li>
              <li>Pipe route: {pipeLow ? `${pipeLow}${pipeHigh && pipeHigh !== pipeLow ? `–${pipeHigh}` : ""} m (${pipeBasis === "mapped_feature" ? "straight-line minimum" : pipeBasis === "farmer_report" ? "your route" : "hypothetical"})` : "not entered"}</li>
              <li>PV array: {pvForScene ? `${num(pvForScene, 2)} kWp` : "not sized yet"}</li>
              <li>Tank: {parse(tank) ? `${tank} m³` : "none"}</li>
              {part && <li aria-live="polite">Selected: {part}</li>}
            </Box>
          )}
        </Box>

        {/* ------------------------------------------------ steps ------ */}
        <Box sx={{ minWidth: 0 }}>
          <Section step={1} title="Where will the water come from?" intro="Pick a mapped river, canal or pond, a source you know, or a well. Mapped water shows that water was drawn on a map; it does not show how much you may take, dry-season water, quality, ownership or permission.">
            <ToggleButtonGroup exclusive value={sourceKind} onChange={(_, v) => v && setSourceKind(v)} aria-label="Source type" sx={{ mb: 2 }}>
              <ToggleButton value="surface">River, canal or pond</ToggleButton>
              <ToggleButton value="well">Well (groundwater)</ToggleButton>
            </ToggleButtonGroup>

            {sourceKind === "surface" ? (
              <Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
                  <TextField select size="small" label="Search within" value={surfaceRadius} onChange={(e) => setSurfaceRadius(Number(e.target.value))} sx={{ width: 160 }}>
                    {RADII_SURFACE.map((r) => (
                      <MenuItem key={r} value={r}>
                        {km(r)} of the field
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button variant="outlined" onClick={() => void loadSurface(surfaceRadius)} disabled={surface.state === "loading"}>
                    {surface.state === "loading" ? "Searching…" : "Search mapped water"}
                  </Button>
                </Stack>
                {surface.state === "error" && (
                  <Alert severity="warning" sx={{ mb: 1.5 }}>
                    {surface.error} This is a service problem, not “no water”. You can still enter a source you know.
                  </Alert>
                )}
                {surface.state === "done" && surfaceData && (
                  <>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {surfaceData.total ? `${surfaceData.total} mapped water feature(s) within ${km(surfaceData.radiusM)} of the field edge${surfaceData.total > surfaceData.sources.length ? ` (nearest ${surfaceData.sources.length} shown)` : ""}.` : `No mapped water within ${km(surfaceData.radiusM)}. That does not mean there is no water: OpenStreetMap may not include small ponds or canals here. Try a larger radius or enter a source you know.`}
                      {surfaceData.truncated && " The map service returned its maximum number of features; use a smaller radius for a complete list."}
                    </Typography>
                    <RadioGroup value={farmerSource.on ? "" : selectedSource ?? ""} onChange={(e) => chooseSource(e.target.value)} aria-label="Mapped water sources">
                      <Box sx={{ maxHeight: 280, overflowY: "auto", border: `1px solid ${color.line}`, borderRadius: `${radius.md}px`, px: 1.5 }}>
                        {surfaceData.sources.slice(0, 25).map((s) => (
                          <FormControlLabel
                            key={s.id}
                            value={s.id}
                            control={<Radio size="small" />}
                            sx={{ display: "flex", alignItems: "flex-start", my: 0.5, "& .MuiFormControlLabel-label": { pt: 0.75 } }}
                            label={
                              <Box>
                                <Typography component="span" sx={{ fontWeight: 600 }}>
                                  {s.name ?? CATEGORY_LABEL[s.category]}
                                </Typography>{" "}
                                <Typography component="span" variant="body2" color="text.secondary">
                                  · {CATEGORY_LABEL[s.category]} · {s.intersects ? "touches the field (0 m)" : `${km(s.distanceM)} ${distanceMeaning(s.role)}`}
                                  {s.tags.intermittent === "yes" || s.tags.seasonal ? " · mapped as seasonal/intermittent" : ""}
                                  {s.lastEdited ? ` · map edited ${s.lastEdited.slice(0, 10)}` : ""}
                                </Typography>
                              </Box>
                            }
                          />
                        ))}
                      </Box>
                    </RadioGroup>
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                      © OpenStreetMap contributors (ODbL), via {surfaceData.provider.endpoint.replace(/^https:\/\//, "").split("/")[0]}; data as of {surfaceData.provider.osmBase?.slice(0, 10) ?? "unknown"}, retrieved {surfaceData.provider.retrievedAt.slice(0, 16).replace("T", " ")} UTC.
                    </Typography>
                  </>
                )}
                {surface.state === "loading" && <Typography variant="body2">Searching OpenStreetMap water features…</Typography>}
                <FormControlLabel sx={{ mt: 1 }} control={<Radio checked={farmerSource.on} onClick={() => setFarmerSource((f) => ({ ...f, on: !f.on }))} />} label="I use a source that is not on the map (farmer-reported)" />
                {farmerSource.on && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1 }}>
                    <TextField size="small" label="Name or description" value={farmerSource.label} onChange={(e) => setFarmerSource((f) => ({ ...f, label: e.target.value }))} />
                    <Num label="Distance from the field edge" unit="m" value={farmerSource.distance} onChange={(v) => setFarmerSource((f) => ({ ...f, distance: v }))} helper="Optional; your estimate" />
                  </Stack>
                )}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
                  <Num label="Delivery point above water, low" unit="m" value={aboveWaterLow} onChange={setAboveWaterLow} helper="Field outlet height above the water surface" width={230} />
                  <Num label="High (dry season)" unit="m" value={aboveWaterHigh} onChange={setAboveWaterHigh} helper="Leave empty if you know one value" width={200} />
                </Stack>
              </Box>
            ) : (
              <Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5, flexWrap: "wrap", rowGap: 1 }}>
                  <TextField select size="small" label="Search wells within" value={gwRadius} onChange={(e) => setGwRadius(Number(e.target.value))} sx={{ width: 170 }}>
                    {RADII_GW.map((r) => (
                      <MenuItem key={r} value={r}>
                        {km(r)} of the field
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button variant="outlined" onClick={() => { setSelectedWell(null); void loadGw(gwRadius); }} disabled={gw.state === "loading"}>
                    {gw.state === "loading" ? "Searching…" : "Search groundwater records"}
                  </Button>
                </Stack>
                <GroundwaterStatus gw={gw} />
                {stations.length > 0 && (
                  <RadioGroup value={selectedWell ?? ""} onChange={(e) => setSelectedWell(e.target.value)} aria-label="Monitoring wells">
                    <Box sx={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${color.line}`, borderRadius: `${radius.md}px`, px: 1.5 }}>
                      {stations.slice(0, 30).map((s) => {
                        const latest = s.measurements[0];
                        const d = latest ? depthBelowGround(latest, s) : null;
                        return (
                          <FormControlLabel
                            key={`${s.provider}:${s.stationId}`}
                            value={`${s.provider}:${s.stationId}`}
                            control={<Radio size="small" />}
                            sx={{ display: "flex", alignItems: "flex-start", my: 0.5, "& .MuiFormControlLabel-label": { pt: 0.75 } }}
                            label={
                              <Box>
                                <Typography component="span" sx={{ fontWeight: 600 }}>
                                  {s.name}
                                </Typography>
                                <Typography component="div" variant="body2" color="text.secondary">
                                  {km(s.distanceM)} from the field edge · {s.authority}
                                  {s.mirrors.length ? ` (also shared via ${s.mirrors.map((m) => (m.provider === "igrac_ggmn" ? "GGMN" : m.provider)).join(", ")})` : ""}
                                </Typography>
                                <Typography component="div" variant="body2">
                                  {latest
                                    ? `${latest.time.slice(0, 10)}: ${d ? `${num(d.depthM, 2)} m below ground${d.derived ? " (derived from level and ground elevation)" : ""}` : `${num(latest.valueM, 2)} m ${latest.kind === "level_elevation" ? `level (${latest.datum})` : "below the measuring point"}`}${latest.originalUnit !== "m" ? ` · original ${latest.originalValue} ${latest.originalUnit}` : ""}${latest.levelState !== "unknown" ? ` · ${latest.levelState}` : ""}`
                                    : s.recency === "not_requested" ? "Records not requested (farther than the nearest wells)" : "No water-level observations returned"}
                                  {s.recency === "historical" ? " · older record" : ""}
                                </Typography>
                                <Typography component="div" variant="caption" color="text.secondary">
                                  Aquifer: {s.aquifer ?? "not stated"}
                                  {s.wellDepthM != null ? ` · well depth ${num(s.wellDepthM, 1)} m (construction, not water level)` : ""}
                                  {s.recordUrl ? (
                                    <>
                                      {" · "}
                                      <a href={s.recordUrl} target="_blank" rel="noreferrer">
                                        source record
                                      </a>
                                    </>
                                  ) : null}
                                </Typography>
                              </Box>
                            }
                          />
                        );
                      })}
                    </Box>
                  </RadioGroup>
                )}
                <Typography component="h3" variant="subtitle1" sx={{ mt: 2, fontWeight: 700 }}>
                  Water level for the pump calculation
                </Typography>
                <RadioGroup value={depthMode} onChange={(e) => setDepthMode(e.target.value as typeof depthMode)}>
                  <FormControlLabel value="measured" control={<Radio size="small" />} label="I measured my own well" />
                  <FormControlLabel value="proxy" control={<Radio size="small" />} label="Use the selected nearby well as a proxy scenario (not a measurement at my field)" />
                  <FormControlLabel value="hypothetical" control={<Radio size="small" />} label="Try a hypothetical depth range" />
                  <FormControlLabel value="unknown" control={<Radio size="small" />} label="I don't know" />
                </RadioGroup>
                {depthMode === "unknown" && <Alert severity="info">Groundwater depth unavailable for this location. You can keep comparing rotations; the water demand is still shown, but pump energy needs a depth.</Alert>}
                {depthMode === "proxy" && (chosenWell ? proxy?.ok ? (
                  <Alert severity="info" sx={{ mb: 1 }}>
                    Proxy from {chosenWell.name}, {km(chosenWell.distanceM)} away: {num(proxy.low, 2)}–{num(proxy.high, 2)} m below ground over its {proxy.count} most recent returned observation(s) (latest {proxy.latest.m.time.slice(0, 10)}). Aquifer compatibility with your well is {chosenWell.aquifer ? "unknown to us" : "unknown (not stated)"}. {chosenWell.measurements[0]?.levelState === "pumping" ? "Recorded as a pumping level." : "These are static levels: add the drawdown your pump causes."}
                  </Alert>
                ) : <Alert severity="warning">{proxy?.why}</Alert> : <Alert severity="info">Select a well in the list or on the map.</Alert>)}
                {(depthMode === "measured" || depthMode === "hypothetical") && (
                  <Stack spacing={1.5} sx={{ mt: 1 }}>
                    {depthMode === "measured" && (
                      <TextField select size="small" label="What did you measure?" value={levelKind} onChange={(e) => setLevelKind(e.target.value as typeof levelKind)} sx={{ maxWidth: 360 }}>
                        <MenuItem value="pumping">Water level while pumping</MenuItem>
                        <MenuItem value="static_plus_drawdown">Water level at rest (static)</MenuItem>
                      </TextField>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <Num label={depthMode === "measured" ? "Depth below ground" : "Shallowest"} unit="m" value={depthLow} onChange={setDepthLow} helper="Negative if water rises above ground" />
                      <Num label={depthMode === "measured" ? "Deepest (optional)" : "Deepest"} unit="m" value={depthHigh} onChange={setDepthHigh} helper="e.g. late dry season" />
                    </Stack>
                  </Stack>
                )}
                {depthMode !== "unknown" && ((depthMode === "measured" && levelKind === "static_plus_drawdown") || depthMode === "hypothetical" || (depthMode === "proxy" && chosenWell?.measurements[0]?.levelState !== "pumping")) && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1.5 }}>
                    <Num label="Drawdown while pumping, low" unit="m" value={ddLow} onChange={setDdLow} helper="Counted once, added to the static level" width={230} />
                    <Num label="High" unit="m" value={ddHigh} onChange={setDdHigh} />
                  </Stack>
                )}
                {depthMode === "hypothetical" && levelKind !== "static_plus_drawdown" && null}
                <Box sx={{ mt: 1.5 }}>
                  <Num label="Delivery point above the well head" unit="m" value={deliveryAboveGround} onChange={setDeliveryAboveGround} width={260} helper="Negative if the field is lower" />
                </Box>
              </Box>
            )}
          </Section>

          <Section step={2} title="How much water do the rotations need?" intro="Uses the irrigation need your rotation comparison already computed (FAO-56 daily water balance, same weather years for every option). Net need becomes water pumped through your irrigation efficiency, counted once.">
            <ToggleButtonGroup exclusive value={demandMode} onChange={(_, v) => v && setDemandMode(v)} sx={{ mb: 2 }} aria-label="Demand source">
              <ToggleButton value="run" disabled={!runs.length}>From a comparison</ToggleButton>
              <ToggleButton value="manual">Enter my own</ToggleButton>
            </ToggleButtonGroup>
            {demandMode === "run" ? (
              runs.length ? (
                <>
                  <TextField select fullWidth size="small" label="Comparison" value={runId ?? ""} onChange={(e) => setRunId(e.target.value)} sx={{ mb: 1.5 }}>
                    {runs.map((r) => (
                      <MenuItem key={r.runId} value={r.runId}>
                        {r.scenarioName} · finished {r.finishedAt?.slice(0, 10) ?? "—"} · {r.demand.irrigationMode === "full" ? "irrigated" : "rainfed"}
                      </MenuItem>
                    ))}
                  </TextField>
                  {run?.demand.unavailable ? (
                    <Alert severity="info">{run.demand.unavailable}</Alert>
                  ) : (
                    run && (
                      <Typography variant="body2" component="div">
                        {run.demand.options.length} option(s): {run.demand.options.map((o) => `${o.label} (${o.annualNetMedianMm != null ? `${num(o.annualNetMedianMm, 0)} mm/yr median net` : "need unavailable"})`).join("; ")}. <ClassChip kind="modelled" />
                      </Typography>
                    )
                  )}
                </>
              ) : (
                <Alert severity="info">No finished comparison for this field yet. Run one from “Compare rotations”, or enter your own demand.</Alert>
              )
            ) : (
              <Stack spacing={1.5}>
                <Num label="Water pumped on an irrigation day" unit="m³/day" value={manualDaily} onChange={setManualDaily} width={260} />
                <Box>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Irrigation months
                  </Typography>
                  <ToggleButtonGroup size="small" value={manualMonths} onChange={(_, v: number[]) => setManualMonths(v)} aria-label="Irrigation months" sx={{ flexWrap: "wrap" }}>
                    {Array.from({ length: 12 }, (_, i) => (
                      <ToggleButton key={i} value={i + 1} sx={{ minWidth: 44 }}>
                        {monthLabel(`2024-${String(i + 1).padStart(2, "0")}`).slice(0, 3)}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </Box>
                <TextField select size="small" label="This volume is" value={manualBasis} onChange={(e) => setManualBasis(e.target.value as typeof manualBasis)} sx={{ maxWidth: 320 }}>
                  <MenuItem value="farmer_report">What I actually pump (my record)</MenuItem>
                  <MenuItem value="hypothetical_input">A what-if amount</MenuItem>
                </TextField>
              </Stack>
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
              <TextField select size="small" label="Irrigation method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} sx={{ width: { xs: "100%", sm: 260 } }} helperText={method === "own" ? "Your own value" : `Uses ${Math.round(ATTAINABLE_APPLICATION_EFFICIENCY[method][0] * 100)} %, the low end of ${Math.round(ATTAINABLE_APPLICATION_EFFICIENCY[method][0] * 100)}–${Math.round(ATTAINABLE_APPLICATION_EFFICIENCY[method][1] * 100)} % attainable (FAO)`}>
                {(Object.keys(METHOD_LABELS) as IrrigationMethod[]).map((m) => (
                  <MenuItem key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </MenuItem>
                ))}
                <MenuItem value="own">I know my application efficiency</MenuItem>
              </TextField>
              {method === "own" && <Num label="Application efficiency" unit="%" value={ownEff} onChange={setOwnEff} />}
              <Num label="Conveyance efficiency" unit="%" value={conveyance} onChange={setConveyance} helper="100 = no loss between pump and field" />
            </Stack>
          </Section>

          <Section step={3} title="Pump, pipe and solar" intro="Plain answers need a few engineering values. If you do not know them, use the starting values: they are shown, labelled and editable, and they are not facts about your equipment.">
            {!startingValues && (
              <Button variant="outlined" onClick={applyStarting} sx={{ mb: 2 }}>
                Fill empty boxes with starting values
              </Button>
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Num label="Pipe route length, low" unit="m" value={pipeLow} onChange={(v) => { setPipeLow(v); setPipeBasis("farmer_report"); }} helper={pipeBasis === "mapped_feature" ? "Straight-line minimum; a real route is longer" : "Your route"} width={220} />
              <Num label="High" unit="m" value={pipeHigh} onChange={(v) => { setPipeHigh(v); setPipeBasis("farmer_report"); }} width={140} />
              <Num label="Pumping hours per day" unit="h" value={runtime} onChange={setRuntime} />
              <Num label="Pump-and-motor efficiency" unit="%" value={eta} onChange={setEta} helper="From your pump curve if you have it" width={230} />
            </Stack>
            <More label="Advanced engineering inputs">
              <Num label="Pipe inner diameter" unit="mm" value={diameter} onChange={setDiameter} />
              <TextField select size="small" label="Pipe material" value={material} onChange={(e) => setMaterial(e.target.value)} sx={{ width: { xs: "100%", sm: 280 } }} helperText="Roughness: Moody (1944)">
                {PIPE_MATERIALS.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.label}
                  </MenuItem>
                ))}
              </TextField>
              <Num label="Fittings Σ K, low" value={kLow} onChange={setKLow} helper="Bends, valves, entrance" />
              <Num label="Σ K, high" value={kHigh} onChange={setKHigh} />
              <Num label="Pressure needed at outlet" unit="kPa" value={pressure} onChange={setPressure} helper="0 for open channel or tank; sprinklers/drip need more" width={230} />
              <Num label="PV performance ratio" unit="%" value={pr} onChange={setPr} helper="Array losses, excluding the controller" width={220} />
              <Num label="Controller efficiency" unit="%" value={ctrl} onChange={setCtrl} helper="PV → motor, counted once" width={200} />
            </More>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2, alignItems: { sm: "center" } }}>
              <ToggleButtonGroup exclusive size="small" value={solarMode} onChange={(_, v) => v && setSolarMode(v)} aria-label="Solar question">
                <ToggleButton value="size">How much PV do I need?</ToggleButton>
                <ToggleButton value="evaluate">Is my PV enough?</ToggleButton>
              </ToggleButtonGroup>
              {solarMode === "evaluate" && <Num label="My PV array" unit="kWp" value={existingKwp} onChange={setExistingKwp} />}
            </Stack>
            <SolarStatus solar={solar} onRetry={() => void loadSolar(true)} />
          </Section>

          <Section step={4} title="Water limits and storage (optional)" intro="Without a limit, water-supply feasibility is unknown. Sunlight does not create water: solar power never justifies unlimited pumping.">
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Num label="Source can give at most" unit="m³/day" value={capacity} onChange={setCapacity} width={220} />
              <Num label="Seasonal water allowance" unit="m³/year" value={budget} onChange={setBudget} width={230} />
              <Num label="Storage tank (daylight pumping)" unit="m³" value={tank} onChange={setTank} width={250} />
            </Stack>
          </Section>
        </Box>
      </Box>

      <Section title="What it means for each rotation" intro={<>Water to pump, pump power and energy, and the solar array needed, for every compared option on the same weather years and assumptions. <ClassChip kind="modelled" /></>} aside={stale ? <Chip size="small" label="Some data still loading" /> : undefined}>
        {computed.error && <Alert severity="error">{computed.error}</Alert>}
        {!computed.result && !computed.error && (
          <Alert severity="info">
            To calculate, add: {built.missing.join("; ")}.
          </Alert>
        )}
        {computed.result && built.input && (
          <>
            <ResultsView result={computed.result} input={built.input} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2, alignItems: { sm: "center" } }}>
              <TextField size="small" label="Name this version" value={name} onChange={(e) => setName(e.target.value)} sx={{ minWidth: 260 }} />
              <Button variant="contained" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save this version"}
              </Button>
              {saveMsg && (
                <Typography role="status" color={saveMsg.ok ? "success.main" : "error"} variant="body2">
                  {saveMsg.text}
                </Typography>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              Saving keeps these exact inputs, the provider records and dates used, the model version and this result. Later data refreshes create new versions; saved versions never change.
            </Typography>
          </>
        )}
      </Section>
    </Box>
  );
}

function GroundwaterStatus({ gw }: { gw: Load<Extract<GroundwaterLookup, { ok: true }>> }) {
  if (gw.state === "loading") return <Typography variant="body2" sx={{ mb: 1.5 }}>Finding the groundwater services that cover this location and asking them for nearby wells… (some national services take up to a minute)</Typography>;
  if (gw.state === "error") return <Alert severity="warning" sx={{ mb: 1.5 }}>{gw.error}</Alert>;
  if (gw.state !== "done" || !gw.data) return null;
  const d = gw.data;
  const withObs = d.stations.filter((s) => s.measurements.length);
  return (
    <Box sx={{ mb: 1.5 }}>
      {withObs.length === 0 && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Groundwater depth unavailable for this location: no usable water-level records were returned within {km(d.radiusM)} of the field. Coverage varies by country and monitoring network; this is not a statement that there is no groundwater.
        </Alert>
      )}
      <Box component="ul" aria-label="Groundwater providers checked" sx={{ listStyle: "none", p: 0, m: 0 }}>
        {d.providers.map((p) => (
          <Box component="li" key={p.id} sx={{ py: 0.5, borderBottom: `1px solid ${tokens.neutral[200]}` }}>
            <Typography variant="body2" component="div">
              <b>{p.name}</b>{" "}
              <Chip size="small" label={OUTCOME_TEXT[p.outcome]} sx={{ height: 20, ml: 0.5, bgcolor: p.outcome === "records_available" ? tokens.lime[200] : p.outcome === "error" ? "#F6DED6" : tokens.neutral[150] }} />
            </Typography>
            {(p.consulted || p.outcome === "access_restricted" || p.outcome === "not_integrated") && (
              <Typography variant="caption" color="text.secondary" component="div">
                {p.message}
                {p.truncated ? " (the provider returned its maximum; nearest wells are still listed first)" : ""}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        Searched {km(d.radiusM)} from the field edge for observations since {d.fromDate}; “latest” means the latest returned in that search, checked {d.asOf.slice(0, 16).replace("T", " ")} UTC. Country hint: {d.countryHint?.toUpperCase() ?? "not resolved (spatial routing only)"}. Records are context near your field, never measurements at it.
      </Typography>
    </Box>
  );
}

function SolarStatus({ solar, onRetry }: { solar: Load<Extract<SolarOutcome, { ok: true }>>; onRetry: () => void }) {
  if (solar.state === "loading") return <Typography variant="body2" sx={{ mt: 2 }}>Loading NASA POWER solar data…</Typography>;
  if (solar.state === "error")
    return (
      <Alert severity="warning" sx={{ mt: 2 }} action={<Button onClick={onRetry}>Retry</Button>}>
        {solar.error} Water demand and pump energy still work; the PV size needs solar data.
      </Alert>
    );
  if (!solar.data) return null;
  const s = solar.data.summary;
  return (
    <Box component="details" sx={{ mt: 2 }}>
      <Box component="summary" sx={{ cursor: "pointer", fontWeight: 600, color: tokens.forest[600] }}>
        Sunshine by month (NASA POWER, {s.fromDate.slice(0, 4)}–{s.toDate.slice(0, 4)}) <ClassChip kind="modelled" />
      </Box>
      <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: "wrap", mt: 1 }}>
        {s.months.map((m) => (
          <Box key={m.month} sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: color.surface, minWidth: 70 }}>
            <Typography variant="caption" color="text.secondary">
              {monthLabel(`2000-${String(m.month).padStart(2, "0")}`).slice(0, 3)}
            </Typography>
            <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{num(m.meanPsh, 2)}</Typography>
            <Typography variant="caption" color="text.secondary">
              low day {num(m.p10Psh, 1)}
            </Typography>
          </Box>
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        Peak sun hours per day = average daily all-sky irradiation on a horizontal surface (kWh/m²/day ÷ 1 kW/m²) for the POWER solar grid cell (about 1°), not your field; tilt and shading are not modelled. Units from the response: {solar.data.provenance.units}. Sources: {solar.data.provenance.upstream.join(", ") || "not stated"}; API {solar.data.provenance.apiVersion ?? "?"}; retrieved {solar.data.provenance.retrievedAt.slice(0, 16).replace("T", " ")} UTC. {s.missingDays} missing day(s) were left out, not counted as zero. Historical averages are not a forecast.
      </Typography>
    </Box>
  );
}
