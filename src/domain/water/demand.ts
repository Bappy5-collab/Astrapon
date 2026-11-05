/**
 * Irrigation demand per compared rotation option, taken from a stored simulation result.
 *
 * Nothing is recalculated: the engine (docs/scientific-methodology.md §6) already produces the
 * FAO-56 NET irrigation requirement — water that refills the root zone to field capacity whenever
 * depletion passes RAW, after rainfall and stored soil water are counted in the daily balance.
 * Here it is only (1) summed by calendar month over the stored replay window, and (2) converted
 * to GROSS withdrawal with application and conveyance efficiency, each applied exactly once:
 *
 *   gross_mm = net_mm ÷ (E_application × E_conveyance);   m³ = mm × ha × 10.
 *
 * Effective rainfall and soil storage are not adjusted again (the balance already holds them).
 * The monthly profile is one replay window (the most recent complete rotation-length years),
 * not a forecast; annual median and 80th-percentile need come from the engine's indicators.
 */

import type { EngineResult, RunView, TimelineView } from "../simulation/engine";
import { validateEfficiency } from "./pump";
import { mmOverHaToM3 } from "./units";

export type MonthNeed = { key: string; days: number; netMm: number | null };

export type OptionDemand = {
  optionId: string;
  label: string;
  kind: "baseline" | "alternative";
  /** Why demand is unavailable, if it is. */
  unavailable: string | null;
  annualNetMedianMm: number | null;
  annualNetP80Mm: number | null;
  window: { startDate: string; endDate: string; years: number[] } | null;
  months: MonthNeed[];
};

export type RunDemand = {
  runKind: RunView["kind"];
  irrigationMode: EngineResult["irrigationMode"];
  options: OptionDemand[];
  /** Run-level reason demand cannot be estimated for any option. */
  unavailable: string | null;
};

const MS_DAY = 86_400_000;
const isoAt = (start: string, offset: number) => new Date(Date.parse(`${start}T00:00:00Z`) + offset * MS_DAY).toISOString().slice(0, 10);

function monthsOf(timeline: TimelineView, strategyId: string): { months: MonthNeed[]; reason: string | null } {
  const st = timeline.strategies.find((s) => s.id === strategyId);
  if (!st) return { months: [], reason: "This option has no day-by-day replay." };
  const map = new Map<string, MonthNeed>();
  let unknownCropDays = 0;
  for (let t = 0; t < timeline.days; t++) {
    const key = isoAt(timeline.startDate, t).slice(0, 7);
    const m = map.get(key) ?? { key, days: 0, netMm: 0 };
    m.days++;
    const inCrop = st.plantings.some((p) => t >= p.start && t < p.end);
    const v = st.irrigation[t];
    if (inCrop && v == null) { m.netMm = null; unknownCropDays++; }
    else if (m.netMm != null && v != null) m.netMm += v;
    map.set(key, m);
  }
  const months = [...map.values()].map((m) => ({ ...m, netMm: m.netMm == null ? null : Math.round(m.netMm * 10) / 10 }));
  const potential = st.plantings.filter((p) => p.potentialOnly).map((p) => p.crop);
  const reason = unknownCropDays > 0 ? `Irrigation need could not be computed for ${unknownCropDays} crop day(s)${potential.length ? ` (${[...new Set(potential)].join(", ")}: only potential water use is modelled)` : ""}.` : null;
  return { months, reason };
}

/** Demand for every option of one run kind ("historical_replay" by default) of a stored result. */
export function demandFromResult(result: EngineResult, runKind: RunView["kind"] = "historical_replay"): RunDemand {
  const run = result.runs.find((r) => r.kind === runKind) ?? null;
  if (!run) return { runKind, irrigationMode: result.irrigationMode, options: [], unavailable: "This result has no such run." };
  const options = [run.baseline, ...run.alternatives].filter((s): s is NonNullable<typeof s> => s != null);
  let runReason: string | null = null;
  if (result.irrigationMode !== "full") runReason = "This comparison was run as rainfed, so the engine did not compute an irrigation requirement. Run the comparison again with “full irrigation” (or record that the field is irrigated), or enter your own water demand.";
  else if (result.soil.awcMmPerM == null) runReason = "Soil water capacity is unknown for this field, so the engine could not compute irrigation need. Add a soil test value, or enter your own water demand.";
  else if (!run.timeline) runReason = run.timelineNote ?? "This run has no day-by-day replay window.";
  const tl = run.timeline;
  return {
    runKind,
    irrigationMode: result.irrigationMode,
    unavailable: runReason,
    options: options.map((s) => {
      const med = s.indicators.irrigation_requirement?.value ?? null;
      const gap = s.indicators.irrigation_dry_gap?.value ?? null;
      const { months, reason } = runReason || !tl ? { months: [], reason: runReason } : monthsOf(tl, s.id);
      return {
        optionId: s.id,
        label: s.label,
        kind: s.kind,
        unavailable: runReason ?? reason,
        annualNetMedianMm: med,
        annualNetP80Mm: med != null && gap != null ? med + gap : null,
        window: tl ? { startDate: tl.startDate, endDate: isoAt(tl.startDate, tl.days - 1), years: tl.years } : null,
        months,
      };
    }),
  };
}

export type Efficiencies = { application: number; conveyance: number };

/** Gross withdrawal (mm) from net need (mm), applying each efficiency once. */
export function grossFromNetMm(netMm: number, eff: Efficiencies): number {
  const e = validateEfficiency(eff.application, "Application efficiency") * validateEfficiency(eff.conveyance, "Conveyance efficiency");
  if (!(netMm >= 0)) throw new Error("Net irrigation cannot be negative");
  return netMm / e;
}

export const netToGrossM3 = (netMm: number, areaHa: number, eff: Efficiencies) => mmOverHaToM3(grossFromNetMm(netMm, eff), areaHa);

/**
 * Seasonal application efficiencies "attainable with good design and management levels", FAO
 * W4367E (Augier, Baudequin & Isbérie, citing Keller 1992), Tables 1, 3 and 5. These are ranges
 * for well-run systems; real systems can be lower. When the farmer does not know their own value,
 * the planner uses the LOWER end of the range for their method and labels it as an assumption.
 * https://www.fao.org/4/w4367e/w4367e0e.htm (checked 2026-11-05)
 */
export const ATTAINABLE_APPLICATION_EFFICIENCY = {
  basin: [0.7, 0.9],
  border: [0.7, 0.85],
  furrow: [0.65, 0.85],
  sprinkler_hand_move: [0.65, 0.8],
  sprinkler_travelling_gun: [0.55, 0.7],
  centre_pivot: [0.75, 0.8],
  solid_set_sprinkler: [0.65, 0.75],
  drip_row_crop: [0.65, 0.9],
} as const satisfies Record<string, readonly [number, number]>;
export type IrrigationMethod = keyof typeof ATTAINABLE_APPLICATION_EFFICIENCY;
export const METHOD_LABELS: Record<IrrigationMethod, string> = {
  basin: "Basin (flooded plots)",
  border: "Border strips",
  furrow: "Furrows",
  sprinkler_hand_move: "Sprinklers, hand-move laterals",
  sprinkler_travelling_gun: "Travelling gun",
  centre_pivot: "Centre pivot",
  solid_set_sprinkler: "Solid-set sprinklers",
  drip_row_crop: "Drip (row crops)",
};
