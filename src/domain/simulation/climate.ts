import { dayIndex, dayOfYear } from "./dates";

/**
 * Daily weather for the engine, reference evapotranspiration (FAO-56 Eq. 52, Hargreaves) and the
 * scenario transformations. Missing days stay null; nothing is interpolated.
 */

export type DailyWeather = {
  /** Absolute day index of element 0. */
  startDay: number;
  tmax: (number | null)[];
  tmin: (number | null)[];
  precip: (number | null)[];
  /** Transformations already applied, in order (empty for historical replay). */
  applied: Transformation[];
};

export type Transformation =
  | { kind: "precipitation_scale"; percent: number }
  | { kind: "temperature_offset"; celsius: number };

export const TRANSFORM_LIMITS = { precipitationPercent: [-50, 50], temperatureCelsius: [-5, 5] } as const;

/** FAO-56 Eq. 21–25: extraterrestrial radiation, MJ m⁻² day⁻¹. */
export function extraterrestrialRadiation(latitudeDeg: number, doy: number): number {
  const GSC = 0.082; // MJ m⁻² min⁻¹
  const phi = (Math.PI / 180) * latitudeDeg;
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * doy);
  const delta = 0.409 * Math.sin(((2 * Math.PI) / 365) * doy - 1.39);
  const x = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta)));
  const ws = Math.acos(x);
  const ra = ((24 * 60) / Math.PI) * GSC * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
  return Math.max(0, ra);
}

/** FAO-56 Eq. 52 (Hargreaves), mm/day. Ra converted with 0.408 (Eq. 20). */
export function hargreavesEt0(tmax: number, tmin: number, latitudeDeg: number, doy: number): number {
  if (tmax < tmin) throw new RangeError("Tmax below Tmin");
  const raMm = 0.408 * extraterrestrialRadiation(latitudeDeg, doy);
  const tmean = (tmax + tmin) / 2;
  return Math.max(0, 0.0023 * (tmean + 17.8) * Math.sqrt(tmax - tmin) * raMm);
}

/** Validates physical ranges. Throws on impossible data rather than repairing it. */
export function validateWeather(w: DailyWeather): void {
  const n = w.tmax.length;
  if (w.tmin.length !== n || w.precip.length !== n) throw new Error("Weather series lengths differ");
  for (let i = 0; i < n; i++) {
    const hi = w.tmax[i];
    const lo = w.tmin[i];
    const p = w.precip[i];
    if (hi != null && (hi < -90 || hi > 65)) throw new RangeError(`Tmax out of range on day ${i}`);
    if (lo != null && (lo < -95 || lo > 60)) throw new RangeError(`Tmin out of range on day ${i}`);
    if (hi != null && lo != null && hi < lo) throw new RangeError(`Tmax below Tmin on day ${i}`);
    if (p != null && (p < 0 || p > 2000)) throw new RangeError(`Precipitation out of range on day ${i}`);
  }
}

export function weatherFromSeries(startIso: string, tmax: (number | null)[], tmin: (number | null)[], precip: (number | null)[]): DailyWeather {
  const w: DailyWeather = { startDay: dayIndex(startIso), tmax, tmin, precip, applied: [] };
  validateWeather(w);
  return w;
}

/** Applies one transformation to a copy. Applying the same kind twice is refused. */
export function applyTransformation(w: DailyWeather, t: Transformation): DailyWeather {
  if (w.applied.some((a) => a.kind === t.kind)) throw new Error(`Transformation ${t.kind} already applied`);
  if (t.kind === "precipitation_scale") {
    const [lo, hi] = TRANSFORM_LIMITS.precipitationPercent;
    if (!(t.percent >= lo && t.percent <= hi)) throw new RangeError(`Precipitation change must be between ${lo}% and ${hi}%`);
    const f = 1 + t.percent / 100;
    return { ...w, precip: w.precip.map((p) => (p == null ? null : Math.max(0, p * f))), applied: [...w.applied, t] };
  }
  const [lo, hi] = TRANSFORM_LIMITS.temperatureCelsius;
  if (!(t.celsius >= lo && t.celsius <= hi)) throw new RangeError(`Temperature change must be between ${lo} and ${hi} °C`);
  const add = (v: number | null) => (v == null ? null : v + t.celsius);
  return { ...w, tmax: w.tmax.map(add), tmin: w.tmin.map(add), applied: [...w.applied, t] };
}

export function applyTransformations(w: DailyWeather, ts: Transformation[]): DailyWeather {
  let out = w;
  for (const t of ts) out = applyTransformation(out, t);
  validateWeather(out);
  return out;
}

/** Daily ET0 aligned with the weather series (null where temperature is missing). */
export function et0Series(w: DailyWeather, latitudeDeg: number): (number | null)[] {
  return w.tmax.map((hi, i) => {
    const lo = w.tmin[i];
    if (hi == null || lo == null) return null;
    return hargreavesEt0(hi, lo, latitudeDeg, dayOfYear(w.startDay + i));
  });
}
