/**
 * Solar resource summaries and a first-stage, energy-only PV size.
 *
 * Input: NASA POWER daily ALLSKY_SFC_SW_DWN for the field's grid cell, Renewable Energy (RE)
 * community, which the API returns in kWh/m²/day (verified from each response's parameter
 * metadata; the AG community returns MJ/m²/day and is converted with mjToKwh only when the
 * metadata says MJ). This is all-sky irradiation on a HORIZONTAL surface, not plane-of-array:
 * no tilt or orientation is modelled, so none is offered as a control. The value describes a
 * ≈ 1° solar grid cell; local shading is unknown.
 *
 * Peak sun hours (h/day) = daily irradiation (kWh/m²/day) ÷ 1 kW/m². Daylight length is never
 * used as peak sun hours.
 *
 * PV_kWp = E_load (kWh/day at the PV array's DC output) ÷ (PSH × PR). PR is the array
 * performance ratio EXCLUDING the pump controller/inverter, which is applied once, separately,
 * to convert motor-terminal energy into array-output energy.
 */

import { REFERENCE_IRRADIANCE_KW_PER_M2 } from "./units";
import { validateEfficiency, WaterInputError } from "./pump";

export const POWER_SOLAR_FILL = -999;
/** A month is summarised only when at least this share of its days have a valid value. */
export const MONTH_COMPLETENESS = 0.8;

export type DailyIrradiation = { date: string; kwhPerM2: number | null };

export type MonthSolar = {
  month: number; // 1–12
  validDays: number;
  totalDays: number;
  /** Mean daily horizontal irradiation = mean peak sun hours; null if incomplete. */
  meanPsh: number | null;
  /** 10th percentile of daily values (a low-sun day in that month); null if incomplete. */
  p10Psh: number | null;
  minPsh: number | null;
};

export type SolarSummary = {
  months: MonthSolar[];
  annualMeanPsh: number | null;
  fromDate: string;
  toDate: string;
  missingDays: number;
};

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
};

/** Fill values and impossible values become null (missing), never zero. */
export function cleanIrradiation(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v === POWER_SOLAR_FILL || v < 0 || v > 15) return null;
  return v;
}

export function summariseSolar(days: DailyIrradiation[]): SolarSummary {
  if (!days.length) throw new WaterInputError("No solar data");
  const byMonth = new Map<number, { vals: number[]; total: number }>();
  let missing = 0;
  for (const d of days) {
    const m = Number(d.date.slice(5, 7));
    if (!(m >= 1 && m <= 12)) throw new WaterInputError(`Bad date ${d.date}`);
    const e = byMonth.get(m) ?? { vals: [], total: 0 };
    e.total++;
    const v = cleanIrradiation(d.kwhPerM2);
    if (v == null) missing++;
    else e.vals.push(v / REFERENCE_IRRADIANCE_KW_PER_M2);
    byMonth.set(m, e);
  }
  const months: MonthSolar[] = [];
  for (let m = 1; m <= 12; m++) {
    const e = byMonth.get(m) ?? { vals: [], total: 0 };
    const ok = e.total > 0 && e.vals.length / e.total >= MONTH_COMPLETENESS;
    const sorted = [...e.vals].sort((a, b) => a - b);
    months.push({
      month: m, validDays: e.vals.length, totalDays: e.total,
      meanPsh: ok ? e.vals.reduce((a, b) => a + b, 0) / e.vals.length : null,
      p10Psh: ok ? quantile(sorted, 0.1) : null,
      minPsh: ok ? sorted[0]! : null,
    });
  }
  const complete = months.every((m) => m.meanPsh != null);
  const sortedDates = days.map((d) => d.date).sort();
  return {
    months,
    annualMeanPsh: complete ? months.reduce((a, m) => a + m.meanPsh!, 0) / 12 : null,
    fromDate: sortedDates[0]!,
    toDate: sortedDates[sortedDates.length - 1]!,
    missingDays: missing,
  };
}

/** kWp = daily load at array output ÷ (PSH × PR). Energy-only; not an equipment recommendation. */
export function requiredPvKwp(dailyLoadKWh: number, peakSunHours: number, performanceRatio: number): number {
  validateEfficiency(performanceRatio, "Performance ratio");
  if (!(dailyLoadKWh >= 0)) throw new WaterInputError("Daily load cannot be negative");
  if (!(peakSunHours > 0)) throw new WaterInputError("Peak sun hours must be positive");
  return dailyLoadKWh / (peakSunHours * performanceRatio);
}

/** Daily array-output energy of an existing array: kWp × PSH × PR (kWh/day). */
export function pvDailyYieldKWh(kwp: number, peakSunHours: number, performanceRatio: number): number {
  validateEfficiency(performanceRatio, "Performance ratio");
  if (!(kwp >= 0)) throw new WaterInputError("PV capacity cannot be negative");
  if (!(peakSunHours >= 0)) throw new WaterInputError("Peak sun hours cannot be negative");
  return kwp * peakSunHours * performanceRatio;
}
