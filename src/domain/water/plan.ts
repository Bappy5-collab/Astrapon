/**
 * Water & Energy planner: input snapshot schema and the deterministic calculation.
 *
 * Same input and WATER_MODEL_VERSION → identical result (no clock, no randomness, no I/O).
 * Uncertain inputs are ranges {low, high}; the result reports a LOW scenario (every uncertain
 * input at its favourable end) and a HIGH scenario (every one at its unfavourable end). When the
 * farmer knows a value exactly, low = high. Nothing unknown is filled with a hidden default:
 * an unknown groundwater depth stops the pump calculation and says why.
 */

import { z } from "zod";

import { grossFromNetMm, type Efficiencies } from "./demand";
import { pumpIntervals, validateEfficiency, WaterInputError, type HeadInput, type IntervalResult } from "./pump";
import { pvDailyYieldKWh, requiredPvKwp, type SolarSummary } from "./solar";
import { DEFAULT_G, DEFAULT_RHO, mmOverHaToM3 } from "./units";

export const WATER_MODEL_VERSION = "1.0.0";

const range = z
  .object({ low: z.number().finite(), high: z.number().finite() })
  .refine((r) => r.low <= r.high, "The low value must not exceed the high value");
export type Range = z.infer<typeof range>;

const basis = z.enum(["farmer_report", "ground_measurement_proxy", "hypothetical_input", "simulation_output", "mapped_feature", "default_assumption"]);
export type InputBasis = z.infer<typeof basis>;

const monthNeed = z.object({ key: z.string().regex(/^\d{4}-\d{2}$/), days: z.number().int().min(1).max(31), netMm: z.number().min(0).nullable() });

const optionDemand = z.object({
  optionId: z.string().min(1).max(40),
  label: z.string().max(300),
  kind: z.enum(["baseline", "alternative", "manual"]),
  unavailable: z.string().max(600).nullable(),
  annualNetMedianMm: z.number().nullable(),
  annualNetP80Mm: z.number().nullable(),
  window: z.object({ startDate: z.string(), endDate: z.string(), years: z.array(z.number().int()) }).nullable(),
  months: z.array(monthNeed).max(12 * 6),
});

const solarMonth = z.object({ month: z.number().int().min(1).max(12), validDays: z.number().int(), totalDays: z.number().int(), meanPsh: z.number().nullable(), p10Psh: z.number().nullable(), minPsh: z.number().nullable() });

export const plannerInputSchema = z.object({
  schema: z.literal(1),
  areaHa: z.number().positive().max(20000),
  demand: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("run"), runId: z.string().uuid(), resultSha256: z.string().regex(/^[0-9a-f]{64}$/), runKind: z.enum(["historical_replay", "scenario"]), options: z.array(optionDemand).min(1).max(5) }),
    /** Farmer's own net need, entered as mm per month or a gross daily volume. */
    z.object({ mode: z.literal("manual"), basis: z.enum(["farmer_report", "hypothetical_input"]), dailyGrossM3: z.number().min(0).max(1e6), months: z.array(z.number().int().min(1).max(12)).min(1).max(12), year: z.number().int().min(1900).max(2200) }),
  ]),
  efficiency: z.object({ application: z.number(), applicationBasis: basis, method: z.string().max(200).nullable(), conveyance: z.number(), conveyanceBasis: basis }),
  source: z.object({
    kind: z.enum(["surface", "well"]),
    label: z.string().max(300),
    basis,
    /** Mapped feature or monitoring station the farmer selected, verbatim from the lookup. */
    ref: z.object({ provider: z.string().max(40), id: z.string().max(120), type: z.string().max(80), url: z.string().max(500).nullable(), mappedAt: z.string().max(40).nullable() }).nullable(),
    straightLineM: z.number().min(0).nullable(),
    geometryNote: z.string().max(300).nullable(),
  }),
  lift: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("surface"), deliveryAboveWaterM: range, basis }),
    z.object({
      kind: z.literal("well"),
      levelKind: z.enum(["pumping", "static_plus_drawdown"]),
      /** Depth below ground at the well; may be negative (artesian). */
      depthM: range.nullable(),
      drawdownM: range.nullable(),
      deliveryAboveGroundM: z.number().finite(),
      basis,
      /** When a nearby station observation is used as a proxy scenario, its provenance. */
      proxy: z.object({ provider: z.string(), stationId: z.string(), stationName: z.string(), distanceM: z.number(), observedAt: z.string(), originalValue: z.number(), originalUnit: z.string(), derivation: z.string().nullable() }).nullable(),
    }),
  ]),
  deliveryPressureKPa: z.number().min(0).max(2000),
  pipe: z.object({ lengthM: range, lengthBasis: basis, innerDiameterMm: z.number().positive().max(2000), roughnessMm: z.number().min(0).max(10), minorLossK: range }),
  pump: z.object({ etaPumpMotor: z.number(), runtimeHoursPerDay: z.number() }),
  solar: z.object({
    performanceRatio: z.number(),
    controllerEfficiency: z.number(),
    mode: z.enum(["size", "evaluate"]),
    existingKwp: z.number().min(0).max(10000).nullable(),
    summary: z.object({ months: z.array(solarMonth).length(12), annualMeanPsh: z.number().nullable(), fromDate: z.string(), toDate: z.string(), missingDays: z.number().int() }).nullable(),
  }),
  supply: z.object({ capacityM3PerDay: z.number().min(0).nullable(), seasonalBudgetM3: z.number().min(0).nullable(), basis }),
  storage: z.object({ tankM3: z.number().min(0).max(1e6).nullable() }),
  constants: z.object({ rho: z.number().positive(), g: z.number().positive() }),
});
export type PlannerInput = z.infer<typeof plannerInputSchema>;

export type Scenario = "low" | "high";

export type MonthResult = {
  key: string;
  days: number;
  netMm: number | null;
  grossM3: number | null;
  pump: Record<Scenario, IntervalResult> | null;
  pv: {
    /** Daily energy needed at the PV array output (after the controller), kWh/day. */
    arrayLoadKWhPerDay: Record<Scenario, number>;
    meanPsh: number | null;
    requiredKwp: Record<Scenario, number> | null;
    /** Existing array: share of the month's energy it can supply (0–1) and the deficit. */
    coverage: Record<Scenario, number> | null;
    deficitKWh: Record<Scenario, number> | null;
  } | null;
  supplyDeficitM3: number | null;
};

export type OptionResult = {
  optionId: string;
  label: string;
  kind: "baseline" | "alternative" | "manual";
  unavailable: string | null;
  annual: { netMedianMm: number | null; netP80Mm: number | null; grossMedianM3: number | null; grossP80M3: number | null };
  window: { startDate: string; endDate: string; years: number[] } | null;
  months: MonthResult[];
  totals: {
    /** Gross withdrawal over the window, per year (m³/yr). */
    grossM3PerYear: number | null;
    energyKWhPerYear: Record<Scenario, number> | null;
    peakMonth: string | null;
    peakDailyM3: number | null;
    peakFlowM3PerH: Record<Scenario, number> | null;
    peakHeadM: Record<Scenario, number> | null;
    peakPowerKW: Record<Scenario, number> | null;
    /** Pipe velocity at peak flow (m/s) and the share of total head lost to pipe and fitting friction (high scenario). */
    peakVelocityMPerS: number | null;
    frictionShareOfHead: number | null;
    criticalSolarMonth: string | null;
    requiredKwp: Record<Scenario, number> | null;
    /** Required kWp on a low-sun day (10th percentile) of the critical month. */
    requiredKwpLowSunDay: Record<Scenario, number> | null;
    /** Existing array: lowest monthly energy coverage and total deficit. */
    worstCoverage: Record<Scenario, number> | null;
    deficitKWhPerYear: Record<Scenario, number> | null;
    /** Existing array at 1 kW/m²: can it supply the pump's peak electrical power? */
    instantaneous: Record<Scenario, "sufficient" | "insufficient"> | null;
    supplyStatus: "unknown" | "within_limits" | "exceeds_capacity" | "exceeds_budget" | "exceeds_both";
    supplyDeficitM3PerYear: number | null;
    tankDaysOfPeak: number | null;
    gravityAssisted: boolean;
  };
};

export type PlannerResult = {
  modelVersion: string;
  status: "ok" | "partial" | "insufficient";
  options: OptionResult[];
  /** Why the pump/energy part could not be computed, if it could not. */
  pumpUnavailable: string | null;
  solarUnavailable: string | null;
  comparison: { energyRanking: string[] | null; energyRankingNote: string };
  operationalFeasibility: "unverified_daily_energy_only";
  assumptions: string[];
  gaps: string[];
};

const r = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const both = <T,>(f: (s: Scenario) => T): Record<Scenario, T> => ({ low: f("low"), high: f("high") });
const daysInMonth = (key: string) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();

function headFor(input: PlannerInput, s: Scenario): HeadInput | null {
  const pick = (rg: Range) => (s === "low" ? rg.low : rg.high);
  const lift = input.lift;
  let liftInput: HeadInput["lift"];
  if (lift.kind === "surface") liftInput = { source: "surface", deliveryAboveWaterM: pick(lift.deliveryAboveWaterM) };
  else {
    if (!lift.depthM) return null;
    liftInput =
      lift.levelKind === "pumping"
        ? { source: "well", level: { kind: "pumping", depthM: pick(lift.depthM) }, deliveryAboveGroundM: lift.deliveryAboveGroundM }
        : { source: "well", level: { kind: "static_plus_drawdown", staticDepthM: pick(lift.depthM), drawdownM: lift.drawdownM ? pick(lift.drawdownM) : NaN }, deliveryAboveGroundM: lift.deliveryAboveGroundM };
  }
  return {
    lift: liftInput,
    deliveryPressureKPa: input.deliveryPressureKPa,
    pipe: { lengthM: pick(input.pipe.lengthM), innerDiameterMm: input.pipe.innerDiameterMm, roughnessMm: input.pipe.roughnessMm, minorLossK: pick(input.pipe.minorLossK) },
    rho: input.constants.rho,
    g: input.constants.g,
  };
}

function manualOption(d: Extract<PlannerInput["demand"], { mode: "manual" }>): z.infer<typeof optionDemand> {
  return { optionId: "manual", label: d.basis === "farmer_report" ? "Your stated water demand" : "Hypothetical water demand", kind: "manual", unavailable: null, annualNetMedianMm: null, annualNetP80Mm: null, window: null, months: [] };
}

/** Runs the planner. Throws WaterInputError for invalid inputs (bad efficiency, runtime, ranges). */
export function computeWaterEnergy(raw: unknown): PlannerResult {
  const parsed = plannerInputSchema.safeParse(raw);
  if (!parsed.success) throw new WaterInputError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const input = parsed.data;
  const eff: Efficiencies = { application: input.efficiency.application, conveyance: input.efficiency.conveyance };
  validateEfficiency(eff.application, "Application efficiency");
  validateEfficiency(eff.conveyance, "Conveyance efficiency");
  validateEfficiency(input.pump.etaPumpMotor, "Pump-and-motor efficiency");
  validateEfficiency(input.solar.performanceRatio, "Performance ratio");
  validateEfficiency(input.solar.controllerEfficiency, "Controller efficiency");
  if (!(input.pump.runtimeHoursPerDay > 0 && input.pump.runtimeHoursPerDay <= 24)) throw new WaterInputError("Pumping hours per day must be more than 0 and at most 24");
  if (input.solar.mode === "evaluate" && input.solar.existingKwp == null) throw new WaterInputError("Enter the existing PV capacity (kWp) to evaluate it");

  const assumptions: string[] = [
    `Water density ${input.constants.rho} kg/m³ and gravity ${input.constants.g} m/s².`,
    `Application efficiency ${Math.round(eff.application * 100)} % (${basisText(input.efficiency.applicationBasis)}${input.efficiency.method ? `, ${input.efficiency.method}` : ""}) and conveyance efficiency ${Math.round(eff.conveyance * 100)} % (${basisText(input.efficiency.conveyanceBasis)}), each applied once to net need.`,
    `Pump-and-motor efficiency ${Math.round(input.pump.etaPumpMotor * 100)} % at the motor terminals; controller/inverter efficiency ${Math.round(input.solar.controllerEfficiency * 100)} % between the PV array and the motor; array performance ratio ${input.solar.performanceRatio} (excluding the controller).`,
    `Pumping ${input.pump.runtimeHoursPerDay} h on each irrigation day; flow = daily volume ÷ pumping time, averaged within each month.`,
    "Pipe friction by Darcy–Weisbach with the Swamee–Jain friction factor; fittings as Σ K · v²/2g; the outlet velocity head is included.",
    "Steady flow within a month; no pump curve, suction-lift or cavitation check (no pump model is selected).",
  ];
  const gaps: string[] = [];
  if (input.pipe.lengthBasis !== "farmer_report") gaps.push(input.pipe.lengthBasis === "mapped_feature" ? "Pipe length uses the straight-line distance as a minimum; a real route is usually longer." : "Pipe length is a hypothetical range, not a surveyed route.");
  if (input.lift.kind === "well" && input.lift.proxy) gaps.push(`Well depth uses a nearby station as a proxy scenario (${input.lift.proxy.stationName}, ${(input.lift.proxy.distanceM / 1000).toFixed(1)} km away, observed ${input.lift.proxy.observedAt.slice(0, 10)}). It is not a measurement at your field.`);
  if (input.lift.kind === "well" && input.lift.basis === "hypothetical_input") gaps.push("Groundwater depth is a hypothetical range chosen for sensitivity, not a measurement.");
  if (input.supply.capacityM3PerDay == null && input.supply.seasonalBudgetM3 == null) gaps.push("Source capacity and water allowance are unknown, so water-supply feasibility is unknown. Mapping a water body does not show how much water may be taken, its dry-season level, ownership or permission.");

  // ---- pump head per scenario
  const heads = { low: headFor(input, "low"), high: headFor(input, "high") };
  let pumpUnavailable: string | null = null;
  if (!heads.low || !heads.high) pumpUnavailable = "Groundwater depth unavailable for this location: enter a measured depth, choose a nearby well as a proxy scenario, or choose a hypothetical depth range. Rotation planning continues without it.";
  if (input.lift.kind === "well" && input.lift.levelKind === "static_plus_drawdown" && !input.lift.drawdownM) pumpUnavailable = "A static water level needs a drawdown (or enter a measured pumping water level instead).";

  const summary: SolarSummary | null = input.solar.summary as SolarSummary | null;
  const solarUnavailable = summary ? null : "NASA POWER solar data has not been loaded for this field.";

  const demandOptions = input.demand.mode === "run" ? input.demand.options : [manualOption(input.demand)];
  const options: OptionResult[] = demandOptions.map((o) => {
    let months: { key: string; days: number; netMm: number | null; grossM3: number | null }[];
    if (input.demand.mode === "manual") {
      const d = input.demand;
      months = Array.from({ length: 12 }, (_, i) => {
        const key = `${d.year}-${String(i + 1).padStart(2, "0")}`;
        const days = daysInMonth(key);
        return { key, days, netMm: null, grossM3: d.months.includes(i + 1) ? d.dailyGrossM3 * days : 0 };
      });
    } else {
      months = o.months.map((m) => ({ ...m, grossM3: m.netMm == null ? null : mmOverHaToM3(grossFromNetMm(m.netMm, eff), input.areaHa) }));
    }
    const annual = {
      netMedianMm: o.annualNetMedianMm,
      netP80Mm: o.annualNetP80Mm,
      grossMedianM3: o.annualNetMedianMm == null ? null : r(mmOverHaToM3(grossFromNetMm(o.annualNetMedianMm, eff), input.areaHa), 1),
      grossP80M3: o.annualNetP80Mm == null ? null : r(mmOverHaToM3(grossFromNetMm(o.annualNetP80Mm, eff), input.areaHa), 1),
    };
    const years = input.demand.mode === "manual" ? 1 : Math.max(1, o.window?.years.length ?? 1);
    const demandKnown = !o.unavailable && months.length > 0 && months.every((m) => m.grossM3 != null);
    const unavailable = o.unavailable ?? (months.length === 0 ? "No monthly demand for this option." : !demandKnown ? "Irrigation need is missing for some months." : null);

    const monthResults: MonthResult[] = months.map((m) => {
      let pump: MonthResult["pump"] = null;
      let pv: MonthResult["pv"] = null;
      if (demandKnown && !pumpUnavailable && m.grossM3 != null) {
        pump = both((s) => pumpIntervals([{ key: m.key, days: m.days, volumeM3: m.grossM3! }], heads[s]!, input.pump.runtimeHoursPerDay, input.pump.etaPumpMotor)[0]!);
        const monthIdx = Number(m.key.slice(5, 7));
        const sm = summary?.months.find((x) => x.month === monthIdx) ?? null;
        const load = both((s) => pump![s].energyKWh / m.days / input.solar.controllerEfficiency);
        const psh = sm?.meanPsh ?? null;
        pv = {
          arrayLoadKWhPerDay: load,
          meanPsh: psh,
          requiredKwp: psh != null && psh > 0 ? both((s) => requiredPvKwp(load[s], psh, input.solar.performanceRatio)) : null,
          coverage: psh != null && input.solar.mode === "evaluate" ? both((s) => (load[s] === 0 ? 1 : Math.min(1, pvDailyYieldKWh(input.solar.existingKwp!, psh, input.solar.performanceRatio) / load[s]))) : null,
          deficitKWh: psh != null && input.solar.mode === "evaluate" ? both((s) => Math.max(0, load[s] - pvDailyYieldKWh(input.solar.existingKwp!, psh, input.solar.performanceRatio)) * m.days) : null,
        };
      }
      const supplyDeficitM3 = input.supply.capacityM3PerDay != null && m.grossM3 != null ? Math.max(0, m.grossM3 - input.supply.capacityM3PerDay * m.days) : null;
      return { key: m.key, days: m.days, netMm: m.netMm, grossM3: m.grossM3 == null ? null : r(m.grossM3, 1), pump, pv, supplyDeficitM3: supplyDeficitM3 == null ? null : r(supplyDeficitM3, 1) };
    });

    const withDemand = monthResults.filter((m) => (m.grossM3 ?? 0) > 0);
    const peak = withDemand.reduce<MonthResult | null>((a, m) => (!a || m.grossM3! / m.days > a.grossM3! / a.days ? m : a), null);
    const grossTotal = demandKnown ? monthResults.reduce((a, m) => a + (m.grossM3 ?? 0), 0) : null;
    const pumped = demandKnown && !pumpUnavailable;
    const critical = pumped && summary ? withDemand.filter((m) => m.pv?.requiredKwp).reduce<MonthResult | null>((a, m) => (!a || m.pv!.requiredKwp!.high > a.pv!.requiredKwp!.high ? m : a), null) : null;
    const criticalSm = critical ? summary!.months.find((x) => x.month === Number(critical.key.slice(5, 7))) : null;
    const missingSolarInDemand = pumped && summary ? withDemand.some((m) => m.pv?.meanPsh == null) : false;

    const evaluate = input.solar.mode === "evaluate" && pumped && summary && !missingSolarInDemand;
    const arrayPeakKW = input.solar.existingKwp != null ? input.solar.existingKwp * input.solar.performanceRatio * input.solar.controllerEfficiency : null;
    const totalDeficit = (s: Scenario) => monthResults.reduce((a, m) => a + (m.pv?.deficitKWh?.[s] ?? 0), 0);
    const supplyAnnual = grossTotal == null ? null : grossTotal / years;
    const exceedsCap = monthResults.some((m) => (m.supplyDeficitM3 ?? 0) > 0);
    const exceedsBudget = input.supply.seasonalBudgetM3 != null && supplyAnnual != null && supplyAnnual > input.supply.seasonalBudgetM3;
    const known = input.supply.capacityM3PerDay != null || input.supply.seasonalBudgetM3 != null;
    const supplyStatus: OptionResult["totals"]["supplyStatus"] = !known || supplyAnnual == null ? "unknown" : exceedsCap && exceedsBudget ? "exceeds_both" : exceedsCap ? "exceeds_capacity" : exceedsBudget ? "exceeds_budget" : "within_limits";
    const capDeficit = input.supply.capacityM3PerDay != null && demandKnown ? monthResults.reduce((a, m) => a + (m.supplyDeficitM3 ?? 0), 0) / years : null;
    const budgetDeficit = exceedsBudget ? supplyAnnual! - input.supply.seasonalBudgetM3! : 0;

    return {
      optionId: o.optionId,
      label: o.label,
      kind: o.kind,
      unavailable,
      annual,
      window: o.window,
      months: monthResults,
      totals: {
        grossM3PerYear: supplyAnnual == null ? null : r(supplyAnnual, 1),
        energyKWhPerYear: pumped ? both((s) => r(monthResults.reduce((a, m) => a + (m.pump?.[s].energyKWh ?? 0), 0) / years, 2)) : null,
        peakMonth: peak?.key ?? null,
        peakDailyM3: peak ? r(peak.grossM3! / peak.days, 2) : null,
        peakFlowM3PerH: pumped && peak?.pump ? both((s) => r(peak.pump![s].flowM3PerH, 3)) : null,
        peakHeadM: pumped && peak?.pump ? both((s) => r(peak.pump![s].head.totalHeadM, 2)) : null,
        peakPowerKW: pumped && peak?.pump ? both((s) => r(peak.pump![s].electricalPowerKW, 3)) : null,
        peakVelocityMPerS: pumped && peak?.pump ? r(peak.pump.high.head.velocityMPerS, 2) : null,
        frictionShareOfHead: pumped && peak?.pump && peak.pump.high.head.totalHeadM > 0 ? r((peak.pump.high.head.frictionHeadM + peak.pump.high.head.minorHeadM) / peak.pump.high.head.totalHeadM, 3) : null,
        criticalSolarMonth: missingSolarInDemand ? null : critical?.key ?? null,
        requiredKwp: !missingSolarInDemand && critical ? both((s) => r(critical.pv!.requiredKwp![s], 3)) : null,
        requiredKwpLowSunDay: !missingSolarInDemand && critical && criticalSm?.p10Psh ? both((s) => r(requiredPvKwp(critical.pv!.arrayLoadKWhPerDay[s], criticalSm.p10Psh!, input.solar.performanceRatio), 3)) : null,
        worstCoverage: evaluate ? both((s) => r(Math.min(...withDemand.map((m) => m.pv!.coverage![s]), 1), 3)) : null,
        deficitKWhPerYear: evaluate ? both((s) => r(totalDeficit(s) / years, 2)) : null,
        instantaneous: arrayPeakKW != null && pumped && peak?.pump ? both((s) => (arrayPeakKW >= peak.pump![s].electricalPowerKW ? "sufficient" : "insufficient")) : null,
        supplyStatus,
        supplyDeficitM3PerYear: supplyStatus === "unknown" ? null : r(Math.max(capDeficit ?? 0, budgetDeficit), 1),
        tankDaysOfPeak: input.storage.tankM3 != null && peak ? r(input.storage.tankM3 / (peak.grossM3! / peak.days), 2) : null,
        gravityAssisted: pumped && monthResults.some((m) => m.pump?.low.gravity),
      },
    };
  });

  const comparable = options.filter((o) => o.totals.energyKWhPerYear != null);
  const energyRanking = comparable.length >= 2 && comparable.length === options.length ? [...comparable].sort((a, b) => a.totals.energyKWhPerYear!.high - b.totals.energyKWhPerYear!.high || a.optionId.localeCompare(b.optionId)).map((o) => o.optionId) : null;
  const energyRankingNote = energyRanking
    ? "Ordered by yearly pumping energy in the high scenario over the replay window (the same weather years and assumptions for every option; one window can be wetter or drier than the median year shown on each card). This is one trade-off, not a new rotation ranking; hard agronomic constraints and your priorities still decide the comparison."
    : pumpUnavailable ?? (options.length < 2 ? "Only one demand option, so there is nothing to order." : "Energy cannot be compared because irrigation need is unavailable for at least one option.");
  if (summary) assumptions.push(`Solar: NASA POWER all-sky horizontal irradiation ${summary.fromDate} to ${summary.toDate}, monthly means used as peak sun hours. Panels' tilt and local shading are not modelled. Historical averages are not a forecast.`);
  if (input.storage.tankM3 != null) assumptions.push(`Storage tank of ${input.storage.tankM3} m³ is a farmer input; no tank losses are modelled.`);

  const anyPump = options.some((o) => o.totals.energyKWhPerYear != null);
  return {
    modelVersion: WATER_MODEL_VERSION,
    status: anyPump && !solarUnavailable ? (options.every((o) => o.totals.energyKWhPerYear != null) ? "ok" : "partial") : anyPump || options.some((o) => o.totals.grossM3PerYear != null) ? "partial" : "insufficient",
    options,
    pumpUnavailable,
    solarUnavailable,
    comparison: { energyRanking, energyRankingNote },
    operationalFeasibility: "unverified_daily_energy_only",
    assumptions,
    gaps,
  };
}

export function basisText(b: InputBasis): string {
  return {
    farmer_report: "your input",
    ground_measurement_proxy: "nearby station, proxy scenario",
    hypothetical_input: "hypothetical",
    simulation_output: "model output",
    mapped_feature: "from mapped geometry",
    default_assumption: "stated assumption",
  }[b];
}

export { DEFAULT_G, DEFAULT_RHO };
