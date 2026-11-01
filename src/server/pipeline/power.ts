import { byYear, isoFromKey, monthly, type DailySeries } from "@/domain/evidence/aggregate";
import { PROCESSING_VERSION } from "@/domain/evidence/catalog";
import { powerCell } from "@/domain/evidence/footprint";
import { countDays, drySpells, FROST_THRESHOLD_C, HEAT_THRESHOLD_C } from "@/domain/evidence/indicators";
import { check, fetchText, type Check } from "@/server/providers/http";
import { buildPowerDailyPointUrl, parsePowerDailyPoint, type PowerDailyRequest, type PowerParameter } from "@/server/providers/nasa-power";

import { cacheKey, chunkMaxAge, combinedSha, readChunk, writeChunk } from "./cache";
import { PipelineError, type AggregateRow, type DailySeriesRow, type FieldContext, type PipelineOutput, type Progress } from "./types";

/**
 * NASA POWER daily, full record from 1981-01-01 to the end of the last complete month, for the
 * POWER grid cell containing the field. Requested in 10-year chunks at the cell centre, so every
 * field in the cell shares the same cached chunks.
 */
export const POWER_START = "1981-01-01";
export const POWER_PIPELINE_PARAMS: PowerParameter[] = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "GWETROOT"];
const MONTHLY: { parameter: PowerParameter; aggregation: "mean" | "sum" }[] = [
  { parameter: "T2M", aggregation: "mean" },
  { parameter: "T2M_MAX", aggregation: "mean" },
  { parameter: "T2M_MIN", aggregation: "mean" },
  { parameter: "PRECTOTCORR", aggregation: "sum" },
  { parameter: "GWETROOT", aggregation: "mean" },
];
const UNIT_OUT: Record<string, string> = { C: "°C", "mm/day": "mm", "1": "0–1" };

export function lastCompleteMonthEnd(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
}

export function powerChunks(start: string, end: string): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let y = Number(start.slice(0, 4));
  const lastY = Number(end.slice(0, 4));
  while (y <= lastY) {
    const cEnd = Math.min(y + 9, lastY);
    out.push({ start: y === Number(start.slice(0, 4)) ? start : `${y}-01-01`, end: cEnd === lastY ? end : `${cEnd}-12-31` });
    y = cEnd + 1;
  }
  return out;
}

export async function runPower(ctx: FieldContext, progress: Progress, now = new Date()): Promise<PipelineOutput> {
  const cell = powerCell(ctx.centroid.lat, ctx.centroid.lon);
  const end = lastCompleteMonthEnd(now);
  const chunks = powerChunks(POWER_START, end);
  const checks: Check[] = [];
  const dates: string[] = [];
  const values = new Map<PowerParameter, (number | null)[]>(POWER_PIPELINE_PARAMS.map((p) => [p, []]));
  const shas: string[] = [];
  const fetched: string[] = [];
  const urls: string[] = [];
  let bytes = 0;
  let apiVersion: string | null = null;
  const upstream = new Set<string>();
  let units: Record<string, string> = {};

  for (const [i, c] of chunks.entries()) {
    await progress({ step: `POWER ${c.start.slice(0, 4)}–${c.end.slice(0, 4)}`, done: i, total: chunks.length });
    const req: PowerDailyRequest = { latitude: cell.centre.lat, longitude: cell.centre.lon, start: c.start, end: c.end, parameters: POWER_PIPELINE_PARAMS };
    const url = buildPowerDailyPointUrl(req);
    const key = cacheKey({ product: "POWER/daily/point/AG", location: cell.key, start: c.start, end: c.end, params: POWER_PIPELINE_PARAMS.join(","), timeStandard: "LST" });
    let chunk = await readChunk(key, chunkMaxAge(c.end, now));
    if (!chunk) {
      const res = await fetchText(url, { timeoutMs: 120_000 });
      if (!res.ok) throw new PipelineError(`NASA POWER did not answer for ${c.start}–${c.end}: ${res.error}${res.attempts ? ` after ${res.attempts} attempts` : ""}`, "unavailable");
      await writeChunk(key, res.retrieval, res.body);
      chunk = { key, retrieval: res.retrieval, body: res.body, cachedAt: new Date().toISOString() };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(chunk.body);
    } catch {
      throw new PipelineError(`NASA POWER returned non-JSON for ${c.start}–${c.end}`, "invalid");
    }
    const parsed = parsePowerDailyPoint(raw, req, chunk.retrieval);
    for (const ch of parsed.checks) checks.push({ ...ch, id: `${c.start.slice(0, 4)}:${ch.id}` });
    if (!parsed.series.length) throw new PipelineError(`NASA POWER response for ${c.start}–${c.end} failed validation`, "invalid");
    apiVersion ??= parsed.apiVersion;
    parsed.upstreamSources.forEach((s) => upstream.add(s));
    units = { ...units, ...Object.fromEntries(parsed.series.map((s) => [s.parameter, s.units])) };
    dates.push(...parsed.dates.map(isoFromKey));
    for (const p of POWER_PIPELINE_PARAMS) {
      const s = parsed.series.find((x) => x.parameter === p);
      values.get(p)!.push(...(s ? s.values : parsed.dates.map(() => null)));
    }
    shas.push(chunk.retrieval.bodySha256);
    fetched.push(chunk.retrieval.retrievedAt);
    urls.push(url);
    bytes += chunk.retrieval.bodyBytes;
  }
  await progress({ step: "Aggregating", done: chunks.length, total: chunks.length });

  const series = (p: PowerParameter): DailySeries => ({ variable: p, unit: units[p] ?? "", dates, values: values.get(p)! });
  const aggregates: AggregateRow[] = [];
  for (const m of MONTHLY)
    for (const v of monthly(series(m.parameter), m.aggregation)) aggregates.push({ ...v, unit: UNIT_OUT[v.unit] ?? v.unit, pixel: "" });

  const tmin = byYear(series("T2M_MIN"));
  const tmax = byYear(series("T2M_MAX"));
  const prec = byYear(series("PRECTOTCORR"));
  const yearRow = (variable: string, unit: string, aggregation: AggregateRow["aggregation"], year: number, v: { value: number | null; validCount: number; expectedCount: number }): AggregateRow => ({
    variable, unit, aggregation, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`, value: v.value, validCount: v.validCount, expectedCount: v.expectedCount, pixel: "",
  });
  for (const [year, s] of tmin) aggregates.push(yearRow("frost_days", "days", "count", year, countDays(year, s.values, (t) => t <= FROST_THRESHOLD_C)));
  for (const [year, s] of tmax) aggregates.push(yearRow("heat_days", "days", "count", year, countDays(year, s.values, (t) => t >= HEAT_THRESHOLD_C)));
  for (const [year, s] of prec) {
    const d = drySpells(year, s.values);
    aggregates.push(yearRow("dry_spell_longest", "days", "max", year, d.longest));
    aggregates.push(yearRow("dry_spells_10d", "spells", "count", year, d.spells));
  }

  // Normalised daily series for the simulation engine. Dates must be consecutive.
  const startDay = Date.parse(`${dates[0]}T00:00:00Z`) / 86_400_000;
  const contiguous = dates.every((d, i) => Date.parse(`${d}T00:00:00Z`) / 86_400_000 === startDay + i);
  checks.push(check("daily-contiguous", contiguous, contiguous ? `${dates.length} consecutive days` : "gap or repeat in the daily dates"));
  const daily: DailySeriesRow[] = contiguous
    ? [
        { variable: "T2M_MAX", unit: "°C", startDate: dates[0]!, values: values.get("T2M_MAX")! },
        { variable: "T2M_MIN", unit: "°C", startDate: dates[0]!, values: values.get("T2M_MIN")! },
        { variable: "PRECTOTCORR", unit: "mm/day", startDate: dates[0]!, values: values.get("PRECTOTCORR")! },
      ]
    : [];
  for (const [p, u] of [["T2M_MAX", "C"], ["T2M_MIN", "C"], ["PRECTOTCORR", "mm/day"]] as const)
    if (units[p] !== u) throw new PipelineError(`Unexpected unit for ${p}: ${units[p] ?? "missing"}`, "invalid");

  const failed = checks.filter((c) => !c.passed);
  checks.push(check("record-length", dates.length > 0 && dates[0] === POWER_START && dates.at(-1) === end, `${dates[0]} → ${dates.at(-1)} (${dates.length} days)`));
  return {
    retrieval: {
      sourceId: "nasa-power-daily",
      productId: "POWER/daily/point/AG",
      productVersion: apiVersion,
      evidenceClass: "assimilated_model_product",
      spatialSupport: "NASA POWER grid cell, ½° lat × ⅝° lon (MERRA-2 native); value describes the whole cell",
      request: { endpoint: "https://power.larc.nasa.gov/api/temporal/daily/point", parameters: POWER_PIPELINE_PARAMS, community: "AG", timeStandard: "LST", cell: cell.key, latitude: cell.centre.lat, longitude: cell.centre.lon, chunks, urls },
      retrievedAt: fetched.sort()[0]!,
      responseSha256: combinedSha(shas),
      responseBytes: bytes,
      outcome: failed.length === 0 ? "valid" : "partial",
      checks: checks.slice(-200),
      provenance: {
        evidenceClass: "assimilated_model_product",
        source: "NASA POWER Daily API (Agroclimatology community)",
        upstream: [...upstream],
        apiVersion,
        units,
        cell: { key: cell.key, centre: cell.centre, footprint: cell.footprint.ring },
        fetchedAt: fetched,
        chunkSha256: shas,
        timeStandard: "LST (local solar time)",
        failedChecks: failed.map((c) => c.id).slice(0, 50),
      },
      cacheKey: cacheKey({ source: "nasa-power-daily", location: cell.key, start: POWER_START, end, processing: PROCESSING_VERSION }),
      processingVersion: PROCESSING_VERSION,
      observationStart: dates[0] ?? null,
      observationEnd: dates.at(-1) ?? null,
    },
    aggregates,
    daily,
  };
}
