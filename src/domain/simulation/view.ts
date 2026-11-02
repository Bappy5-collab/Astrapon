/**
 * Pure read-only views over a stored engine result, for the replay scene, the selected-date tables
 * and the deterministic explanations. Nothing here recomputes a model quantity: values are looked
 * up in the stored timeline and indicator tables (docs/scientific-methodology.md §9a).
 */
import { dayIndex, isoDate } from "./dates";
import type { Comparison, IndicatorDefinition, IndicatorTable, PriorityKey, RunView, StrategyView, TimelinePlanting, TimelineStrategy, TimelineView } from "./engine";

export type FaoStage = "initial" | "development" | "mid_season" | "late_season";

export type PlantingDay = { planting: TimelinePlanting; dayInCrop: number; stage: FaoStage | null; /** 0–1, illustrative canopy height. */ growth: number };

/** The planting occupying relative day `d`, with its FAO-56 stage. Later plantings win on a shared day. */
export function plantingOn(s: TimelineStrategy, d: number): PlantingDay | null {
  let hit: TimelinePlanting | null = null;
  for (const p of s.plantings) if (d >= p.start && d < p.end) hit = p;
  if (!hit) return null;
  const k = d - hit.start;
  const st = hit.stages;
  if (!st) return { planting: hit, dayInCrop: k, stage: null, growth: Math.min(1, 0.15 + (0.85 * (k + 1)) / Math.max(1, hit.end - hit.start)) };
  let stage: FaoStage;
  let growth: number;
  if (k < st.ini) {
    stage = "initial";
    growth = 0.12 + 0.18 * ((k + 1) / Math.max(1, st.ini));
  } else if (k < st.ini + st.dev) {
    stage = "development";
    growth = 0.3 + 0.7 * ((k - st.ini + 1) / Math.max(1, st.dev));
  } else if (k < st.ini + st.dev + st.mid) {
    stage = "mid_season";
    growth = 1;
  } else {
    stage = "late_season";
    growth = 1;
  }
  return { planting: hit, dayInCrop: k, stage, growth };
}

/** Scene stage (plants.ts) for a day: the FAO-56 stage drives the drawing; heights are illustrative. */
export function sceneStage(p: PlantingDay | null): "bare" | "emerging" | "growing" | "mature" {
  if (!p) return "bare";
  if (p.stage === "initial") return "emerging";
  if (p.stage === "development") return "growing";
  if (p.stage === null) return p.growth < 0.3 ? "emerging" : p.growth < 1 ? "growing" : "mature";
  return "mature";
}

export type DayValues = {
  date: string;
  crop: string | null;
  cropId: string | null;
  stage: FaoStage | null;
  dayInCrop: number | null;
  cropDays: number | null;
  potentialOnly: boolean;
  kc: number | null;
  etc: number | null;
  eta: number | null;
  rootM: number | null;
  depletion: number | null;
  ks: number | null;
  irrigation: number | null;
  drainage: number | null;
};

export function dayValues(t: TimelineView, s: TimelineStrategy, d: number): DayValues {
  const p = plantingOn(s, d);
  return {
    date: dateOf(t, d),
    crop: p?.planting.crop ?? null,
    cropId: p?.planting.cropId ?? null,
    stage: p?.stage ?? null,
    dayInCrop: p ? p.dayInCrop + 1 : null,
    cropDays: p ? p.planting.end - p.planting.start : null,
    potentialOnly: p?.planting.potentialOnly ?? false,
    kc: s.kc[d] ?? null,
    etc: s.etc[d] ?? null,
    eta: s.eta[d] ?? null,
    rootM: s.rootM[d] ?? null,
    depletion: s.depletion[d] ?? null,
    ks: s.ks[d] ?? null,
    irrigation: s.irrigation[d] ?? null,
    drainage: s.drainage[d] ?? null,
  };
}

export const dateOf = (t: TimelineView, d: number) => isoDate(dayIndex(t.startDate) + d);

export type Marker = { day: number; kind: "plant" | "harvest"; crop: string; strategyId: string };

/** Planting and harvest days inside the window, for the scrubber. */
export function markers(t: TimelineView, ids?: string[]): Marker[] {
  const out: Marker[] = [];
  for (const s of t.strategies) {
    if (ids && !ids.includes(s.id)) continue;
    for (const p of s.plantings) {
      if (p.start >= 0 && p.start < t.days) out.push({ day: p.start, kind: "plant", crop: p.crop, strategyId: s.id });
      if (p.end - 1 >= 0 && p.end - 1 < t.days) out.push({ day: p.end - 1, kind: "harvest", crop: p.crop, strategyId: s.id });
    }
  }
  return out.sort((a, b) => a.day - b.day || a.strategyId.localeCompare(b.strategyId));
}

export type MonthRow = { month: string; crops: string[]; rainMm: number | null; etcMm: number | null; etaMm: number | null; irrigationMm: number | null; stressDays: number | null; days: number };

/** Monthly totals of stored daily values (text equivalent of the scene). Sums are of the stored, rounded days. */
export function monthlySummary(t: TimelineView, s: TimelineStrategy): MonthRow[] {
  const rows: MonthRow[] = [];
  const sum = (xs: (number | null)[]) => (xs.some((v) => v != null) ? Math.round(xs.reduce<number>((a, v) => a + (v ?? 0), 0) * 10) / 10 : null);
  let d = 0;
  while (d < t.days) {
    const month = dateOf(t, d).slice(0, 7);
    const idx: number[] = [];
    while (d < t.days && dateOf(t, d).startsWith(month)) idx.push(d++);
    const crops = [...new Set(idx.map((i) => plantingOn(s, i)?.planting.crop).filter((c): c is string => Boolean(c)))];
    const ks = idx.map((i) => s.ks[i] ?? null);
    rows.push({
      month,
      crops,
      rainMm: sum(idx.map((i) => t.weather.precip[i] ?? null)),
      etcMm: sum(idx.map((i) => s.etc[i] ?? null)),
      etaMm: sum(idx.map((i) => s.eta[i] ?? null)),
      irrigationMm: sum(idx.map((i) => s.irrigation[i] ?? null)),
      stressDays: ks.some((v) => v != null) ? ks.filter((v) => v != null && v < 1).length : null,
      days: idx.length,
    });
  }
  return rows;
}

// ------------------------------------------------------------- comparison ---

export const optionsOf = (r: RunView): StrategyView[] => [...(r.baseline ? [r.baseline] : []), ...r.alternatives];

/** The base-case indicator table the stored ranking was computed from. */
export function indicatorTable(r: RunView): IndicatorTable {
  return Object.fromEntries(optionsOf(r).map((o) => [o.id, Object.fromEntries(Object.entries(o.indicators).map(([k, v]) => [k, v.value]))]));
}

export type Difference = { key: string; label: string; unit: string; from: number; to: number; better: boolean; scored: boolean };

/** Indicator differences of `id` against `against`, with direction from the definitions. Equal values are omitted. */
export function differences(defs: IndicatorDefinition[], table: IndicatorTable, against: string, id: string): Difference[] {
  const out: Difference[] = [];
  for (const def of defs) {
    const a = table[against]?.[def.key];
    const b = table[id]?.[def.key];
    if (a == null || b == null || a === b) continue;
    out.push({ key: def.key, label: def.label, unit: def.unit, from: a, to: b, better: def.better === "high" ? b > a : b < a, scored: def.scored });
  }
  return out;
}

export type Reason = { priority: PriorityKey; contribution: number; share: number };

/** Priority groups ordered by their contribution to an option's relative score. */
export function reasons(c: Comparison, id: string): Reason[] {
  const contrib = c.contributions[id] ?? {};
  const total = Object.values(contrib).reduce<number>((a, v) => a + (v ?? 0), 0);
  return (Object.entries(contrib) as [PriorityKey, number][])
    .filter(([, v]) => v > 0)
    .map(([priority, contribution]) => ({ priority, contribution, share: total > 0 ? contribution / total : 0 }))
    .sort((a, b) => b.contribution - a.contribution || a.priority.localeCompare(b.priority));
}
