/**
 * Daily series and monthly aggregation with explicit completeness.
 *
 * Rules (documented in docs/evidence-methods.md):
 * - A missing day is null, never zero, and is never interpolated.
 * - A monthly value is computed only when at least MONTH_MIN_COMPLETENESS of the month's days are
 *   valid. Otherwise the value is null and the valid/expected counts are kept, so the gap is visible.
 * - Sums (precipitation) over an incomplete month are never scaled up to look complete.
 */

export const MONTH_MIN_COMPLETENESS = 0.9;

export type DailySeries = {
  variable: string;
  unit: string;
  /** ISO dates (YYYY-MM-DD), consecutive. */
  dates: string[];
  values: (number | null)[];
};

export type Aggregation = "sum" | "mean" | "min" | "max" | "count";

export type PeriodValue = {
  variable: string;
  unit: string;
  aggregation: Aggregation;
  periodStart: string;
  periodEnd: string;
  /** null when no valid data, or completeness below the documented threshold. */
  value: number | null;
  validCount: number;
  expectedCount: number;
};

export const daysInMonth = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");
export const monthStart = (y: number, m: number) => `${y}-${pad(m)}-01`;
export const monthEnd = (y: number, m: number) => `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;

/** Converts POWER's YYYYMMDD keys to ISO dates. */
export const isoFromKey = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;

export function round(v: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Aggregates a daily series into calendar months. Months only partly inside the series count the missing days as missing. */
export function monthly(series: DailySeries, aggregation: Exclude<Aggregation, "count">, minCompleteness = MONTH_MIN_COMPLETENESS): PeriodValue[] {
  const byMonth = new Map<string, number[]>();
  const present = new Map<string, number>();
  series.dates.forEach((d, i) => {
    const key = d.slice(0, 7);
    present.set(key, (present.get(key) ?? 0) + 1);
    const v = series.values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) return;
    let arr = byMonth.get(key);
    if (!arr) byMonth.set(key, (arr = []));
    arr.push(v);
  });
  const out: PeriodValue[] = [];
  for (const key of present.keys()) {
    const [y, m] = key.split("-").map(Number) as [number, number];
    const expected = daysInMonth(y, m);
    const vals = byMonth.get(key) ?? [];
    const enough = vals.length > 0 && vals.length / expected >= minCompleteness;
    let value: number | null = null;
    if (enough) {
      if (aggregation === "sum") value = vals.reduce((s, v) => s + v, 0);
      else if (aggregation === "mean") value = vals.reduce((s, v) => s + v, 0) / vals.length;
      else if (aggregation === "min") value = Math.min(...vals);
      else value = Math.max(...vals);
      value = round(value);
    }
    out.push({ variable: series.variable, unit: series.unit, aggregation, periodStart: monthStart(y, m), periodEnd: monthEnd(y, m), value, validCount: vals.length, expectedCount: expected });
  }
  return out;
}

/** Splits a daily series by calendar year (only years fully inside the series' date range are returned). */
export function byYear(series: DailySeries): Map<number, { dates: string[]; values: (number | null)[] }> {
  const out = new Map<number, { dates: string[]; values: (number | null)[] }>();
  series.dates.forEach((d, i) => {
    const y = Number(d.slice(0, 4));
    let e = out.get(y);
    if (!e) out.set(y, (e = { dates: [], values: [] }));
    e.dates.push(d);
    e.values.push(series.values[i] ?? null);
  });
  for (const [y, e] of out) {
    const expected = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86_400_000;
    if (e.dates.length !== expected) out.delete(y);
  }
  return out;
}
