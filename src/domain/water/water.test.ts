import { describe, expect, it } from "vitest";

import type { BoundaryGeometry } from "../geo/boundary";
import { routeProviders } from "./coverage";
import { grossFromNetMm, netToGrossM3 } from "./demand";
import { boundaryDistance, routeLengthM, fieldFrame, searchBox } from "./distance";
import { dedupeStations, depthBelowGround, normaliseMeasurement, outcomeFor, rankStations, type GroundwaterStation } from "./groundwater";
import { computeWaterEnergy, type PlannerInput } from "./plan";
import { electricalEnergyKWh, electricalPowerW, flowFromRuntime, headBreakdown, pumpIntervals, staticLiftM, swameeJain, WaterInputError } from "./pump";
import { requiredPvKwp, summariseSolar } from "./solar";
import { FT_TO_M, lengthToM, mmOverHaToM3, mjToKwh } from "./units";

// SYNTHETIC unit-test reference (from the owner's brief); never real farm data.
const REF = { rho: 1000, g: 9.81, V: 50, H: 30, eta: 0.5, runtime: 5 };

describe("units", () => {
  it("1 mm over 1 ha is 10 m³", () => expect(mmOverHaToM3(1, 1)).toBe(10));
  it("feet convert only explicitly", () => {
    expect(lengthToM(10, "ft")).toBeCloseTo(3.048, 10);
    expect(FT_TO_M).toBe(0.3048);
    expect(() => lengthToM(1, "yd" as never)).toThrow();
  });
  it("MJ to kWh", () => expect(mjToKwh(3.6)).toBe(1));
});

describe("pump reference calculation (synthetic)", () => {
  it("flow, power and energy match the brief", () => {
    const q = flowFromRuntime(REF.V, REF.runtime);
    expect(q * 3600).toBeCloseTo(10, 10);
    expect(electricalPowerW(q, REF.H, REF.eta, REF.rho, REF.g) / 1000).toBeCloseTo(1.635, 6);
    expect(electricalEnergyKWh(REF.V, REF.H, REF.eta, REF.rho, REF.g)).toBeCloseTo(8.175, 6);
  });
  it("PV size on an energy-only basis", () => {
    expect(requiredPvKwp(8.175, 4.5, 0.75)).toBeCloseTo(2.422, 3);
  });
  it("rejects invalid efficiencies and runtimes", () => {
    for (const eta of [0, -0.1, 1.2, NaN]) expect(() => electricalEnergyKWh(1, 1, eta)).toThrow(WaterInputError);
    expect(() => flowFromRuntime(10, 0)).toThrow(WaterInputError);
    expect(() => flowFromRuntime(10, 25)).toThrow(WaterInputError);
  });
  it("zero demand and gravity give zero, never negative energy", () => {
    expect(electricalEnergyKWh(0, 30, 0.5)).toBe(0);
    expect(electricalEnergyKWh(100, -5, 0.5)).toBe(0);
    expect(electricalPowerW(0.01, -2, 0.5)).toBe(0);
  });
  it("counts drawdown once and keeps artesian depth negative", () => {
    expect(staticLiftM({ source: "well", level: { kind: "pumping", depthM: 12 }, deliveryAboveGroundM: 1 })).toBe(13);
    expect(staticLiftM({ source: "well", level: { kind: "static_plus_drawdown", staticDepthM: 8, drawdownM: 4 }, deliveryAboveGroundM: 1 })).toBe(13);
    expect(staticLiftM({ source: "well", level: { kind: "pumping", depthM: -2 }, deliveryAboveGroundM: 0.5 })).toBe(-1.5);
    expect(() => staticLiftM({ source: "well", level: { kind: "static_plus_drawdown", staticDepthM: 8, drawdownM: -1 }, deliveryAboveGroundM: 0 })).toThrow();
  });
  it("Darcy–Weisbach friction is sane and grows with flow", () => {
    // Swamee–Jain vs a known Colebrook value: Re 1e5, ε/D 1e-4 → f ≈ 0.0185.
    expect(swameeJain(1e5, 1e-4)).toBeCloseTo(0.0185, 3);
    const base = { lift: { source: "surface" as const, deliveryAboveWaterM: 3 }, deliveryPressureKPa: 0, pipe: { lengthM: 200, innerDiameterMm: 50, roughnessMm: 0.0015, minorLossK: 2 } };
    const a = headBreakdown(base, 10 / 3600), b = headBreakdown(base, 20 / 3600);
    expect(a.regime).toBe("turbulent");
    expect(b.frictionHeadM).toBeGreaterThan(a.frictionHeadM * 3);
    expect(a.totalHeadM).toBeCloseTo(a.staticLiftM + a.pressureHeadM + a.frictionHeadM + a.minorHeadM + a.velocityHeadM, 10);
    expect(headBreakdown(base, 0).frictionHeadM).toBe(0);
    expect(headBreakdown({ ...base, deliveryPressureKPa: 98.1 }, 0).pressureHeadM).toBeCloseTo(10, 6);
  });
  it("sums energy per interval rather than one average", () => {
    const head = { lift: { source: "surface" as const, deliveryAboveWaterM: 5 }, deliveryPressureKPa: 0, pipe: { lengthM: 500, innerDiameterMm: 40, roughnessMm: 0.0015, minorLossK: 0 } };
    const iv = pumpIntervals([{ key: "a", days: 30, volumeM3: 300 }, { key: "b", days: 30, volumeM3: 1500 }], head, 6, 0.5);
    const avg = pumpIntervals([{ key: "avg", days: 60, volumeM3: 1800 }], head, 6, 0.5)[0]!;
    expect(iv[0]!.energyKWh + iv[1]!.energyKWh).toBeGreaterThan(avg.energyKWh); // friction is non-linear in flow
  });
});

describe("solar", () => {
  const days = Array.from({ length: 365 }, (_, i) => {
    const d = new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10);
    return { date: d, kwhPerM2: i % 50 === 0 ? -999 : 4 + (i % 3) };
  });
  it("treats the fill value as missing, never zero", () => {
    const s = summariseSolar(days);
    expect(s.missingDays).toBe(8);
    expect(s.months[0]!.meanPsh).toBeGreaterThan(4);
    expect(s.months.every((m) => m.minPsh == null || m.minPsh >= 4)).toBe(true);
  });
  it("leaves an incomplete month empty", () => {
    const s = summariseSolar(days.map((d) => (d.date.startsWith("2023-02") && d.date < "2023-02-15" ? { ...d, kwhPerM2: null } : d)));
    expect(s.months[1]!.meanPsh).toBeNull();
    expect(s.annualMeanPsh).toBeNull();
  });
});

describe("demand", () => {
  it("applies application and conveyance efficiency once", () => {
    expect(grossFromNetMm(60, { application: 0.75, conveyance: 0.8 })).toBeCloseTo(100, 10);
    expect(netToGrossM3(60, 2, { application: 0.75, conveyance: 0.8 })).toBeCloseTo(2000, 10);
    expect(() => grossFromNetMm(10, { application: 0, conveyance: 1 })).toThrow();
  });
});

// A ≈ 100 m square field near Mymensingh (synthetic geometry).
const FIELD: BoundaryGeometry = { type: "Polygon", coordinates: [[[90.4, 24.75], [90.401, 24.75], [90.401, 24.751], [90.4, 24.751], [90.4, 24.75]]] };

describe("distance", () => {
  it("measures from the field edge, not the centre", () => {
    const frame = fieldFrame(FIELD);
    const east = frame.toLonLat([frame.toLocal([90.401, 24.7505])[0] + 500, frame.toLocal([90.401, 24.7505])[1]]);
    const d = boundaryDistance(FIELD, { type: "Point", coordinates: east });
    expect(d.distanceM).toBeCloseTo(500, 0);
    expect(d.intersects).toBe(false);
  });
  it("is zero for a line crossing the field and for a polygon containing it", () => {
    expect(boundaryDistance(FIELD, { type: "LineString", coordinates: [[90.3995, 24.7505], [90.4015, 24.7505]] }).distanceM).toBe(0);
    expect(boundaryDistance(FIELD, { type: "Polygon", coordinates: [[[90.39, 24.74], [90.41, 24.74], [90.41, 24.76], [90.39, 24.76], [90.39, 24.74]]] }).intersects).toBe(true);
  });
  it("measures to the nearest segment of a line, not its vertices", () => {
    const frame = fieldFrame(FIELD);
    const [x0, y0] = frame.toLocal([90.4, 24.751]);
    const a = frame.toLonLat([x0 - 2000, y0 + 300]), b = frame.toLonLat([x0 + 2000, y0 + 300]);
    expect(boundaryDistance(FIELD, { type: "LineString", coordinates: [a, b] }).distanceM).toBeCloseTo(300, 0);
  });
  it("keeps route length separate from straight-line distance", () => {
    const frame = fieldFrame(FIELD);
    const p = (x: number, y: number) => frame.toLonLat([x, y]);
    expect(routeLengthM([p(0, 0), p(300, 0), p(300, 400)], frame)).toBeCloseTo(700, 3);
    expect(() => routeLengthM([p(0, 0)], frame)).toThrow();
  });
  it("rejects a search box crossing the 180° meridian", () => {
    const near: BoundaryGeometry = { type: "Polygon", coordinates: [[[179.99, -16.5], [179.995, -16.5], [179.995, -16.495], [179.99, -16.495], [179.99, -16.5]]] };
    expect(searchBox(near, 5000)).toBeNull();
    expect(searchBox(FIELD, 5000)).not.toBeNull();
    expect(() => searchBox(FIELD, 50_000)).toThrow();
  });
});

const station = (over: Partial<GroundwaterStation>): GroundwaterStation => ({
  provider: "usgs", stationId: "x", authorityId: "x", authority: "U.S. Geological Survey", name: "W", lon: 0, lat: 0, country: null, aquifer: null, wellDepthM: null, groundElevation: null,
  recordUrl: null, firstObservation: null, lastObservation: null, observationCount: null, measurements: [], measurementsRequested: true, mirrors: [], retrievedAt: "2026-11-05T00:00:00Z", ...over,
});

describe("groundwater records", () => {
  it("keeps original value and unit and converts feet explicitly", () => {
    const m = normaliseMeasurement({ time: "2026-08-25", value: 11.17, unit: "ft", kind: "depth_below_ground", datum: "land surface", parameter: "72019" })!;
    expect(m.originalValue).toBe(11.17);
    expect(m.valueM).toBeCloseTo(3.4046, 4);
    expect(normaliseMeasurement({ time: "x", value: 1, unit: "furlong", kind: "depth_below_ground", datum: null, parameter: "p" })!.valueM).toBeNull();
    expect(normaliseMeasurement({ time: "x", value: null, unit: "m", kind: "depth_below_ground", datum: null, parameter: "p" })).toBeNull();
  });
  it("derives depth from elevation only with a matching datum, and keeps artesian negative", () => {
    const m = normaliseMeasurement({ time: "t", value: 137.09, unit: "m", kind: "level_elevation", datum: "NGF", parameter: "niveau" })!;
    expect(depthBelowGround(m, { groundElevation: { valueM: 142, datum: "NGF", basis: "surveyed_or_provider" } })!.depthM).toBeCloseTo(4.91, 6);
    expect(depthBelowGround(m, { groundElevation: { valueM: 142, datum: "NAVD88", basis: "surveyed_or_provider" } })).toBeNull();
    expect(depthBelowGround(m, { groundElevation: null })).toBeNull();
    const art = normaliseMeasurement({ time: "t", value: -1.2, unit: "m", kind: "depth_below_ground", datum: null, parameter: "d" })!;
    expect(depthBelowGround(art, { groundElevation: null })!.depthM).toBe(-1.2);
    const ref = normaliseMeasurement({ time: "t", value: 4.26, unit: "m", kind: "depth_below_reference", datum: "measuring point", parameter: "p" })!;
    expect(depthBelowGround(ref, { groundElevation: null })).toBeNull();
  });
  it("de-duplicates mirrors by authority id, never by proximity", () => {
    const direct = station({ provider: "hubeau", stationId: "09838D2500/F", authorityId: "09838D2500/F", authority: "BRGM" });
    const mirror = station({ provider: "igrac_ggmn", stationId: "393446", authorityId: "09838d2500/f", authority: "France - French Geological Survey (BRGM)" });
    const neighbour = station({ provider: "hubeau", stationId: "09838D2499/F", authorityId: "09838D2499/F", authority: "BRGM", lon: 0.00001 });
    const out = dedupeStations([mirror, direct, neighbour], ["hubeau", "igrac_ggmn"]);
    expect(out).toHaveLength(2);
    const kept = out.find((s) => s.stationId === "09838D2500/F")!;
    expect(kept.provider).toBe("hubeau");
    expect(kept.mirrors.map((m) => m.provider)).toEqual(["igrac_ggmn"]);
  });
  it("ranks recent records before stale ones and states reasons", () => {
    const asOf = new Date("2026-11-05T00:00:00Z");
    const mk = (time: string) => normaliseMeasurement({ time, value: 3, unit: "m", kind: "depth_below_ground", datum: null, parameter: "p" })!;
    const ranked = rankStations([
      { ...station({ stationId: "old", measurements: [mk("2008-01-01")] }), distanceM: 100 },
      { ...station({ stationId: "new", measurements: [mk("2026-06-01")] }), distanceM: 5000 },
      { ...station({ stationId: "meta" }), distanceM: 10 },
    ], asOf);
    expect(ranked.map((s) => s.stationId)).toEqual(["new", "old", "meta"]);
    expect(ranked[2]!.reasons.join(" ")).toMatch(/no water-level observations/);
    expect(outcomeFor([ranked[1]!], asOf)).toBe("historical_only");
    expect(outcomeFor([], asOf)).toBe("no_stations");
  });
});

describe("provider routing", () => {
  const box = (lon: number, lat: number) => ({ west: lon - 0.1, south: lat - 0.1, east: lon + 0.1, north: lat + 0.1 });
  const consulted = (lon: number, lat: number, hint: string | null) => routeProviders(box(lon, lat), hint).filter((d) => d.consult).map((d) => d.provider.id);
  it("routes from coordinates, always including the global network", () => {
    expect(consulted(-93.6, 42.0, "us")).toEqual(["usgs", "igrac_ggmn"]);
    expect(consulted(1.44, 43.6, "fr")).toEqual(["hubeau", "igrac_ggmn"]);
    expect(consulted(147.4, -35.1, "au")).toEqual(["igrac_ggmn"]);
    expect(consulted(90.4, 24.75, "bd")).toEqual(["igrac_ggmn"]);
    expect(consulted(36.8, -1.3, null)).toEqual(["igrac_ggmn"]); // Kenya: no national adapter
  });
  it("does not trust the country hint alone", () => {
    expect(consulted(1.44, 43.6, "us")).toEqual(["hubeau", "igrac_ggmn"]);
  });
  it("explains non-consulted national providers", () => {
    const bd = routeProviders(box(90.4, 24.75), "bd").find((d) => d.provider.id === "bwdb")!;
    expect(bd.consult).toBe(false);
    expect(bd.reason).toMatch(/request|registration/);
  });
});

function baseInput(over: Partial<PlannerInput> = {}): PlannerInput {
  const months = [
    { key: "2023-01", days: 31, netMm: 0 },
    { key: "2023-02", days: 28, netMm: 40 },
    { key: "2023-03", days: 31, netMm: 90 },
  ];
  const solarMonths = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, validDays: 30, totalDays: 30, meanPsh: i === 2 ? 4.5 : 5, p10Psh: 3, minPsh: 2 }));
  return {
    schema: 1,
    areaHa: 1,
    demand: {
      mode: "run", runId: "00000000-0000-4000-8000-000000000000", resultSha256: "a".repeat(64), runKind: "historical_replay",
      options: [
        { optionId: "baseline", label: "Rice → Wheat", kind: "baseline", unavailable: null, annualNetMedianMm: 130, annualNetP80Mm: 160, window: { startDate: "2023-01-01", endDate: "2023-03-31", years: [2023] }, months },
        { optionId: "alternative-1", label: "Maize → Lentil", kind: "alternative", unavailable: null, annualNetMedianMm: 60, annualNetP80Mm: 80, window: { startDate: "2023-01-01", endDate: "2023-03-31", years: [2023] }, months: months.map((m) => ({ ...m, netMm: (m.netMm ?? 0) / 2 })) },
      ],
    },
    efficiency: { application: 0.75, applicationBasis: "farmer_report", method: null, conveyance: 1, conveyanceBasis: "farmer_report" },
    source: { kind: "well", label: "Own tube well", basis: "farmer_report", ref: null, straightLineM: null, geometryNote: null },
    lift: { kind: "well", levelKind: "pumping", depthM: { low: 8, high: 12 }, drawdownM: null, deliveryAboveGroundM: 1, basis: "farmer_report", proxy: null },
    deliveryPressureKPa: 0,
    pipe: { lengthM: { low: 50, high: 50 }, lengthBasis: "farmer_report", innerDiameterMm: 75, roughnessMm: 0.0015, minorLossK: { low: 1, high: 3 } },
    pump: { etaPumpMotor: 0.5, runtimeHoursPerDay: 6 },
    solar: { performanceRatio: 0.8, controllerEfficiency: 0.95, mode: "size", existingKwp: null, summary: { months: solarMonths, annualMeanPsh: 4.96, fromDate: "2016-01-01", toDate: "2025-12-31", missingDays: 0 } },
    supply: { capacityM3PerDay: null, seasonalBudgetM3: null, basis: "farmer_report" },
    storage: { tankM3: null },
    constants: { rho: 1000, g: 9.81 },
    ...over,
  };
}

describe("planner", () => {
  it("is deterministic and orders low ≤ high", () => {
    const a = computeWaterEnergy(baseInput()), b = computeWaterEnergy(baseInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const t = a.options[0]!.totals;
    expect(t.energyKWhPerYear!.low).toBeLessThan(t.energyKWhPerYear!.high);
    expect(t.peakMonth).toBe("2023-03");
    expect(a.options[0]!.months[2]!.grossM3).toBeCloseTo(1200, 6); // 90 mm / 0.75 × 1 ha × 10
    expect(t.criticalSolarMonth).toBe("2023-03");
    expect(a.comparison.energyRanking).toEqual(["alternative-1", "baseline"]);
    expect(a.operationalFeasibility).toBe("unverified_daily_energy_only");
  });
  it("stops at an unknown groundwater depth instead of filling a default", () => {
    const res = computeWaterEnergy(baseInput({ lift: { kind: "well", levelKind: "pumping", depthM: null, drawdownM: null, deliveryAboveGroundM: 1, basis: "farmer_report", proxy: null } }));
    expect(res.pumpUnavailable).toMatch(/Groundwater depth unavailable/);
    expect(res.options[0]!.totals.energyKWhPerYear).toBeNull();
    expect(res.options[0]!.totals.grossM3PerYear).toBeCloseTo(1733.3, 1); // (40 + 90) mm ÷ 0.75 × 10 m³: demand still shown
    expect(res.comparison.energyRanking).toBeNull();
  });
  it("reports supply as unknown without limits, and deficits when exceeded", () => {
    expect(computeWaterEnergy(baseInput()).options[0]!.totals.supplyStatus).toBe("unknown");
    const lim = computeWaterEnergy(baseInput({ supply: { capacityM3PerDay: 20, seasonalBudgetM3: 1000, basis: "farmer_report" } })).options[0]!;
    expect(lim.totals.supplyStatus).toBe("exceeds_both");
    expect(lim.totals.supplyDeficitM3PerYear).toBeGreaterThan(0);
  });
  it("handles zero demand without negative or NaN energy", () => {
    const zero = baseInput();
    if (zero.demand.mode === "run") zero.demand.options = zero.demand.options.map((o) => ({ ...o, months: o.months.map((m) => ({ ...m, netMm: 0 })) }));
    const t = computeWaterEnergy(zero).options[0]!.totals;
    expect(t.energyKWhPerYear).toEqual({ low: 0, high: 0 });
    expect(t.peakMonth).toBeNull();
    expect(t.requiredKwp).toBeNull();
  });
  it("marks solar unavailable and keeps energy without it", () => {
    const res = computeWaterEnergy(baseInput({ solar: { performanceRatio: 0.8, controllerEfficiency: 0.95, mode: "size", existingKwp: null, summary: null } }));
    expect(res.solarUnavailable).toMatch(/NASA POWER/);
    expect(res.options[0]!.totals.energyKWhPerYear).not.toBeNull();
    expect(res.options[0]!.totals.requiredKwp).toBeNull();
  });
  it("evaluates an existing PV array with coverage and deficits", () => {
    const res = computeWaterEnergy(baseInput({ solar: { ...baseInput().solar, mode: "evaluate", existingKwp: 0.2 } }));
    const t = res.options[0]!.totals;
    expect(t.worstCoverage!.high).toBeLessThan(1);
    expect(t.deficitKWhPerYear!.high).toBeGreaterThan(0);
    expect(t.instantaneous).not.toBeNull();
  });
  it("rejects invalid efficiency, runtime and reversed ranges", () => {
    expect(() => computeWaterEnergy(baseInput({ pump: { etaPumpMotor: 1.5, runtimeHoursPerDay: 6 } }))).toThrow(WaterInputError);
    expect(() => computeWaterEnergy(baseInput({ pump: { etaPumpMotor: 0.5, runtimeHoursPerDay: 0 } }))).toThrow(WaterInputError);
    expect(() => computeWaterEnergy(baseInput({ pipe: { ...baseInput().pipe, lengthM: { low: 10, high: 5 } } }))).toThrow(WaterInputError);
  });
  it("accepts a manual demand scenario", () => {
    const res = computeWaterEnergy(baseInput({ demand: { mode: "manual", basis: "hypothetical_input", dailyGrossM3: 50, months: [3, 4], year: 2024 } }));
    const o = res.options[0]!;
    expect(o.kind).toBe("manual");
    expect(o.totals.grossM3PerYear).toBe(50 * 31 + 50 * 30);
    expect(o.totals.peakDailyM3).toBe(50);
  });
});

describe("water source registry", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { WATER_SOURCES } = await import("./sources");
  const ROOT = join(import.meta.dirname, "..", "..", "..");
  it("claims live_verified only with a committed passing artifact", () => {
    for (const s of WATER_SOURCES.filter((x) => x.status === "live_verified")) {
      const file = join(ROOT, s.statusEvidence);
      expect(existsSync(file), s.id).toBe(true);
      const art = JSON.parse(readFileSync(file, "utf8"));
      expect(art.outcome, s.id).toBe("live_verified");
      expect(art.checks.every((c: { passed: boolean }) => c.passed), s.id).toBe(true);
      expect(art.trace, s.id).toBeTruthy();
    }
  });
  it("never marks a credentialed source live and labels non-NASA producers", () => {
    for (const s of WATER_SOURCES) {
      if (s.auth !== "none") expect(s.status, s.id).not.toBe("live_verified");
      if (!s.isNasa) expect(s.producer, s.id).toMatch(/non-NASA/);
      expect(s.cannotEstablish.length, s.id).toBeGreaterThan(0);
    }
  });
});
