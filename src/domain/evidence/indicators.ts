/**
 * Transparent indicators computed from validated series. Each is a description of past
 * conditions in a grid cell or pixel. None is a measure of crop damage, yield or a forecast.
 * Definitions, thresholds and completeness rules are listed in INDICATORS (catalog.ts) and
 * docs/evidence-methods.md.
 */
import { round, type PeriodValue } from "./aggregate";

export const HEAT_THRESHOLD_C = 35;
export const FROST_THRESHOLD_C = 0;
export const DRY_DAY_MM = 1;
export const DRY_SPELL_MIN_DAYS = 10;
/** A calendar year needs this share of valid days before a count is reported. */
export const YEAR_MIN_COMPLETENESS = 0.95;
/** WMO standard climate normal period used as the anomaly baseline. */
export const BASELINE = { start: 1991, end: 2020 } as const;
/** Baseline months need this share of baseline years present. */
export const BASELINE_MIN_YEARS = 24;

export type YearValue = { year: number; value: number | null; validCount: number; expectedCount: number };

function yearGate(values: (number | null)[]): { valid: number; ok: boolean } {
  const valid = values.filter((v) => v !== null).length;
  return { valid, ok: values.length > 0 && valid / values.length >= YEAR_MIN_COMPLETENESS };
}

/** Days in the year meeting a threshold test. Null when the year is too incomplete to count. */
export function countDays(year: number, values: (number | null)[], test: (v: number) => boolean): YearValue {
  const g = yearGate(values);
  return { year, value: g.ok ? values.filter((v) => v !== null && test(v)).length : null, validCount: g.valid, expectedCount: values.length };
}

export type DrySpells = { longest: YearValue; spells: YearValue };

/**
 * Dry spells: runs of consecutive days with precipitation below DRY_DAY_MM inside one calendar year.
 * A missing day ends a run (it is not assumed dry or wet). Runs are not carried across years.
 */
export function drySpells(year: number, precip: (number | null)[]): DrySpells {
  const g = yearGate(precip);
  let run = 0;
  let longest = 0;
  let spells = 0;
  const close = () => {
    if (run >= DRY_SPELL_MIN_DAYS) spells++;
    longest = Math.max(longest, run);
    run = 0;
  };
  for (const p of precip) {
    if (p !== null && p < DRY_DAY_MM) run++;
    else close();
  }
  close();
  const base = { year, validCount: g.valid, expectedCount: precip.length };
  return { longest: { ...base, value: g.ok ? longest : null }, spells: { ...base, value: g.ok ? spells : null } };
}

const monthOf = (iso: string) => Number(iso.slice(5, 7));
const yearOf = (iso: string) => Number(iso.slice(0, 4));

export type MonthClimatology = { month: number; value: number | null; years: number };

/** Mean of each calendar month over the baseline years. Null when fewer than BASELINE_MIN_YEARS are present. */
export function climatology(months: PeriodValue[], baseline = BASELINE): MonthClimatology[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const vals = months.filter((p) => monthOf(p.periodStart) === m && yearOf(p.periodStart) >= baseline.start && yearOf(p.periodStart) <= baseline.end && p.value !== null).map((p) => p.value!);
    return { month: m, value: vals.length >= BASELINE_MIN_YEARS ? round(vals.reduce((s, v) => s + v, 0) / vals.length) : null, years: vals.length };
  });
}

export type Anomaly = { periodStart: string; value: number | null; normal: number | null; anomaly: number | null; percentOfNormal: number | null };

/** Difference from the baseline mean of the same calendar month. Percent of normal only for non-negative totals (precipitation). */
export function anomalies(months: PeriodValue[], clim: MonthClimatology[], percent = false): Anomaly[] {
  return months.map((p) => {
    const normal = clim[monthOf(p.periodStart) - 1]?.value ?? null;
    const anomaly = p.value !== null && normal !== null ? round(p.value - normal) : null;
    const percentOfNormal = percent && p.value !== null && normal !== null && normal > 0 ? round((100 * p.value) / normal, 1) : null;
    return { periodStart: p.periodStart, value: p.value, normal, anomaly, percentOfNormal };
  });
}

export const SEASONS = [
  { id: "DJF", label: "Dec–Feb", months: [12, 1, 2] },
  { id: "MAM", label: "Mar–May", months: [3, 4, 5] },
  { id: "JJA", label: "Jun–Aug", months: [6, 7, 8] },
  { id: "SON", label: "Sep–Nov", months: [9, 10, 11] },
] as const;
export type SeasonId = (typeof SEASONS)[number]["id"];

export type SeasonValue = { season: SeasonId; year: number; value: number | null };

/**
 * Three-month season values, named by months so they are correct in both hemispheres.
 * DJF of year Y uses December of Y−1. A season needs all three months; temperature-like
 * values are day-weighted means of monthly means, totals are sums.
 */
export function seasonal(months: PeriodValue[], kind: "mean" | "sum"): SeasonValue[] {
  const byKey = new Map(months.map((p) => [p.periodStart.slice(0, 7), p]));
  const years = [...new Set(months.map((p) => yearOf(p.periodStart)))].sort((a, b) => a - b);
  const out: SeasonValue[] = [];
  for (const year of years)
    for (const s of SEASONS) {
      const parts = s.months.map((m) => byKey.get(`${m === 12 && s.id === "DJF" ? year - 1 : year}-${String(m).padStart(2, "0")}`));
      if (parts.some((p) => !p || p.value === null)) {
        out.push({ season: s.id, year, value: null });
        continue;
      }
      const ps = parts as PeriodValue[];
      const value = kind === "sum" ? ps.reduce((a, p) => a + p.value!, 0) : ps.reduce((a, p) => a + p.value! * p.expectedCount, 0) / ps.reduce((a, p) => a + p.expectedCount, 0);
      out.push({ season: s.id, year, value: round(value) });
    }
  return out;
}

/** Median of pairwise slopes (Theil–Sen), robust to single outlying years. Descriptive only: no significance test. */
export function theilSen(points: { x: number; y: number }[]): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]!, b = points[j]!;
      if (b.x !== a.x) slopes.push((b.y - a.y) / (b.x - a.x));
    }
  if (!slopes.length) return null;
  slopes.sort((p, q) => p - q);
  const mid = slopes.length / 2;
  return slopes.length % 2 ? slopes[Math.floor(mid)]! : (slopes[mid - 1]! + slopes[mid]!) / 2;
}

export const NDVI_MIN_GOOD_PER_YEAR = 8;
export const NDVI_MIN_YEARS_FOR_TREND = 8;

export type NdviComposite = { date: string; value: number | null };

/** Highest good-quality NDVI composite per calendar year; null when too few good composites. */
export function annualPeakNdvi(composites: NdviComposite[]): YearValue[] {
  const years = new Map<number, NdviComposite[]>();
  for (const c of composites) years.set(yearOf(c.date), [...(years.get(yearOf(c.date)) ?? []), c]);
  return [...years]
    .sort(([a], [b]) => a - b)
    .map(([year, cs]) => {
      const good = cs.filter((c) => c.value !== null).map((c) => c.value!);
      return { year, value: good.length >= NDVI_MIN_GOOD_PER_YEAR ? round(Math.max(...good), 4) : null, validCount: good.length, expectedCount: cs.length };
    });
}

/** Theil–Sen slope of annual peak NDVI, per decade. */
export function ndviTrendPerDecade(peaks: YearValue[]): { slope: number | null; years: number } {
  const pts = peaks.filter((p) => p.value !== null).map((p) => ({ x: p.year, y: p.value! }));
  if (pts.length < NDVI_MIN_YEARS_FOR_TREND) return { slope: null, years: pts.length };
  const s = theilSen(pts);
  return { slope: s === null ? null : round(s * 10, 4), years: pts.length };
}

/** Mean of a set of yearly values within [from, to]; null if fewer than `min` present. */
export function meanOfYears(values: YearValue[], from: number, to: number, min: number): { value: number | null; years: number } {
  const v = values.filter((x) => x.year >= from && x.year <= to && x.value !== null).map((x) => x.value!);
  return { value: v.length >= min ? round(v.reduce((s, x) => s + x, 0) / v.length, 1) : null, years: v.length };
}
