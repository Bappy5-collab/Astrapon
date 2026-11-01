/**
 * FAO-56 single-coefficient crop ET and Chapter 8 root-zone water balance for one planting period.
 * Units: mm of water, mm/day, metres of rooting depth, AWC in mm per metre of soil.
 *
 * Storage S = TAW − Dr (available water held in the current root zone). Per period:
 *   Σ(P + I + G) − Σ ETa − Σ DP = S_end − S_start
 * where G is the available water in soil newly explored as roots deepen (that layer is assumed to
 * be at the root zone's current relative depletion). RO = 0 and CR = 0 (docs/scientific-methodology.md §6.4).
 */

export const ROOT_DEPTH_AT_PLANTING_M = 0.15;
export const CONSERVATION_TOLERANCE_MM = 1e-6;

export type Stages = { ini: number; dev: number; mid: number; late: number };
export type KcSet = { ini: number; mid: number; end: number };

export function kcOnDay(day: number, s: Stages, kc: KcSet): number {
  const i = day + 1; // FAO-56 Eq. 66 counts days from 1
  if (day < s.ini) return kc.ini;
  if (day < s.ini + s.dev) return kc.ini + ((i - s.ini) / s.dev) * (kc.mid - kc.ini);
  if (day < s.ini + s.dev + s.mid) return kc.mid;
  return kc.mid + ((i - (s.ini + s.dev + s.mid)) / Math.max(1, s.late)) * (kc.end - kc.mid);
}

export function rootDepthOnDay(day: number, s: Stages, maxDepthM: number): number {
  const grow = s.ini + s.dev;
  if (grow <= 0) return maxDepthM;
  return ROOT_DEPTH_AT_PLANTING_M + (maxDepthM - ROOT_DEPTH_AT_PLANTING_M) * Math.min(1, (day + 1) / grow);
}

export type PeriodInput = {
  et0: (number | null)[];
  precip: (number | null)[];
  stages: Stages;
  kc: KcSet;
  /** null when soil water capacity is unknown, or the crop is potential-only (paddy rice). */
  soil: null | { awcMmPerM: number; rootMaxM: number; p: number };
  initial: "field_capacity" | "readily_available_depleted";
  irrigation: "rainfed" | "full";
};

export type PeriodResult = {
  complete: boolean;
  days: number;
  precipMm: number | null;
  etcMm: number | null;
  /** Water-limited quantities: null when soil is unknown or the crop is potential-only. */
  etaMm: number | null;
  irrigationMm: number | null;
  drainageMm: number | null;
  rootZoneGainMm: number | null;
  storageStartMm: number | null;
  storageEndMm: number | null;
  stressDays: number | null;
  conservationErrorMm: number | null;
};

export function runPeriod(input: PeriodInput): PeriodResult {
  const L = input.et0.length;
  if (input.precip.length !== L) throw new Error("Period series lengths differ");
  const sumStages = input.stages.ini + input.stages.dev + input.stages.mid + input.stages.late;
  if (sumStages !== L) throw new Error(`Stage lengths (${sumStages}) do not match the period (${L} days)`);
  const empty: PeriodResult = { complete: false, days: L, precipMm: null, etcMm: null, etaMm: null, irrigationMm: null, drainageMm: null, rootZoneGainMm: null, storageStartMm: null, storageEndMm: null, stressDays: null, conservationErrorMm: null };
  if (input.et0.some((v) => v == null) || input.precip.some((v) => v == null)) return empty;

  let P = 0;
  let ETc = 0;
  const etcDaily: number[] = [];
  for (let d = 0; d < L; d++) {
    const etc = kcOnDay(d, input.stages, input.kc) * input.et0[d]!;
    etcDaily.push(etc);
    ETc += etc;
    P += input.precip[d]!;
  }
  if (!input.soil) return { ...empty, complete: true, precipMm: P, etcMm: ETc };

  const { awcMmPerM, rootMaxM, p: pTable } = input.soil;
  if (!(awcMmPerM > 0 && awcMmPerM <= 700)) throw new RangeError("AWC must be between 0 and 700 mm/m");
  let taw = awcMmPerM * rootDepthOnDay(0, input.stages, rootMaxM);
  const p0 = Math.min(0.8, Math.max(0.1, pTable + 0.04 * (5 - (etcDaily[0] ?? 0))));
  let dr = input.initial === "field_capacity" ? 0 : p0 * taw;
  const storageStart = taw - dr;
  let I = 0;
  let ETa = 0;
  let DP = 0;
  let G = 0;
  let stress = 0;

  for (let d = 0; d < L; d++) {
    // Roots deepen: the newly explored layer has the same relative depletion as the root zone.
    const tawNew = awcMmPerM * rootDepthOnDay(d, input.stages, rootMaxM);
    if (tawNew !== taw) {
      const rel = taw > 0 ? dr / taw : 0;
      const drNew = rel * tawNew;
      G += tawNew - drNew - (taw - dr);
      taw = tawNew;
      dr = drNew;
    }
    const etc = etcDaily[d]!;
    const p = Math.min(0.8, Math.max(0.1, pTable + 0.04 * (5 - etc)));
    const raw = p * taw;
    const rain = input.precip[d]!;
    let irr = 0;
    if (input.irrigation === "full" && dr > raw) irr = dr; // refill to field capacity (FAO-56 MAD approach)
    const drAfterInput = Math.max(0, dr - rain - irr);
    const ks = drAfterInput <= raw ? 1 : Math.max(0, (taw - drAfterInput) / ((1 - p) * taw));
    if (ks < 1) stress++;
    const eta = Math.min(ks * etc, taw - drAfterInput);
    let drEnd = dr - rain - irr + eta;
    let dp = 0;
    if (drEnd < 0) {
      dp = -drEnd;
      drEnd = 0;
    }
    if (drEnd > taw) drEnd = taw;
    dr = drEnd;
    I += irr;
    ETa += eta;
    DP += dp;
  }
  const storageEnd = taw - dr;
  const err = P + I + G - ETa - DP - (storageEnd - storageStart);
  if (Math.abs(err) > CONSERVATION_TOLERANCE_MM * Math.max(1, P + I + G)) throw new Error(`Water balance not conserved (${err} mm)`);
  return {
    complete: true, days: L, precipMm: P, etcMm: ETc, etaMm: ETa, irrigationMm: I, drainageMm: DP, rootZoneGainMm: G,
    storageStartMm: storageStart, storageEndMm: storageEnd, stressDays: stress, conservationErrorMm: err,
  };
}
