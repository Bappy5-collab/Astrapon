import { z } from "zod";

import { round } from "@/domain/evidence/aggregate";
import { PROCESSING_VERSION } from "@/domain/evidence/catalog";
import { fractionInside, lonLatToSinusoidal, MAX_PIXELS, MIN_PIXELS_FOR_WITHIN_FIELD, PIXEL_INSIDE_MIN, pixelFootprint, pixelId, sinusoidalToLonLat, type PixelGrid } from "@/domain/evidence/footprint";
import { annualPeakNdvi } from "@/domain/evidence/indicators";
import { projectField } from "@/domain/geo/local-frame";
import { check, fetchText, type Check } from "@/server/providers/http";
import { MAX_DATES_PER_SUBSET, ORNL_BASE, PIXEL_RELIABILITY } from "@/server/providers/ornl-modis";

import { cacheKey, chunkMaxAge, combinedSha, readChunk, writeChunk } from "./cache";
import { PipelineError, type AggregateRow, type FieldContext, type PipelineOutput, type Progress } from "./types";

/**
 * MOD13Q1 v061 NDVI + pixel reliability for the pixel grid around the field, last MODIS_RECORD_YEARS
 * years plus the current one. Optional context: the simulation engine never reads it.
 * Only "good" (reliability 0) pixels are used; nothing is filled or interpolated.
 * Field value per composite = mean of good pixels lying ≥ 75% inside the field, required for at
 * least half of those pixels; when no pixel lies mostly inside, the pixel containing the field's
 * interior point is used and labelled as neighbourhood context.
 */

const PRODUCT = "MOD13Q1";
const VERSION = "061";
const CELL = 231.656358264;
const NDVI_SCALE = 0.0001;
const NDVI_VALID: [number, number] = [-2000, 10000];
const NDVI_FILL = -3000;
const JSON_ACCEPT = { Accept: "application/json" };

const gridSchema = z.object({
  xllcorner: z.union([z.string(), z.number()]).transform(Number),
  yllcorner: z.union([z.string(), z.number()]).transform(Number),
  cellsize: z.number(),
  nrows: z.number().int().positive(),
  ncols: z.number().int().positive(),
  band: z.string(),
  scale: z.string(),
  subset: z.array(z.object({ modis_date: z.string(), calendar_date: z.string(), band: z.string(), tile: z.string(), proc_date: z.string(), data: z.array(z.number()) })),
});
const datesSchema = z.object({ dates: z.array(z.object({ modis_date: z.string(), calendar_date: z.string() })) });

async function getJson(url: string, cacheParts: Record<string, string | number>, maxAgeMs: number, now: Date) {
  const key = cacheKey(cacheParts);
  let chunk = await readChunk(key, maxAgeMs);
  if (!chunk) {
    const res = await fetchText(url, { headers: JSON_ACCEPT, timeoutMs: 120_000, attempts: 5 });
    if (!res.ok) throw new PipelineError(`ORNL MODIS service did not answer (${res.error}${res.attempts ? `, ${res.attempts} attempts` : ""})`, "unavailable");
    if (!res.retrieval.contentType?.includes("json")) throw new PipelineError(`ORNL MODIS service returned ${res.retrieval.contentType}, not JSON`, "invalid");
    await writeChunk(key, res.retrieval, res.body);
    chunk = { key, retrieval: res.retrieval, body: res.body, cachedAt: now.toISOString() };
  }
  return { raw: JSON.parse(chunk.body) as unknown, retrieval: chunk.retrieval };
}

/**
 * Years of record fetched before the latest composite's year. Ten complete years plus the current
 * partial one: enough for the 10-year typical peak and the ≥ 8-year trend, at about a third of the
 * requests of the full 2000-onwards record.
 */
export const MODIS_RECORD_YEARS = 10;
/** Subset requests in flight at once (also capped per host in providers/http.ts). */
export const MODIS_PARALLEL = 4;

/** Composites from 1 January of (latest composite year − MODIS_RECORD_YEARS) onwards. Depends only on the listing, not the clock. */
export function recentComposites<T extends { calendar_date: string }>(dates: T[]): T[] {
  const last = dates.reduce((m, d) => (d.calendar_date > m ? d.calendar_date : m), "");
  if (!last) return [];
  const from = `${Number(last.slice(0, 4)) - MODIS_RECORD_YEARS}-01-01`;
  return dates.filter((d) => d.calendar_date >= from);
}

/** Runs tasks with at most `limit` in flight; results keep the input order. */
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

/** Half-width of the requested grid in whole km (ORNL takes integers), enough to cover the field. */
export function gridKm(extentM: number): number {
  return Math.min(4, Math.max(1, Math.ceil(extentM / 2000 + 0.25)));
}

export async function runModis(ctx: FieldContext, progress: Progress, now = new Date()): Promise<PipelineOutput> {
  // Request at the centre of the pixel containing the field's interior point, so every field sharing that pixel shares the cache.
  const [x, y] = lonLatToSinusoidal([ctx.centroid.lon, ctx.centroid.lat]);
  const ix = Math.floor(x / CELL), iy = Math.floor(y / CELL);
  const [lon, lat] = sinusoidalToLonLat((ix + 0.5) * CELL, (iy + 0.5) * CELL);
  const reqLat = round(lat, 6), reqLon = round(lon, 6);
  const km = gridKm(projectField(ctx.boundary).extentM);
  const locKey = `modis:${ix}:${iy}:km${km}`;
  const checks: Check[] = [];

  await progress({ step: "Listing MODIS composites", done: 0, total: 1 });
  const dl = await getJson(`${ORNL_BASE}/${PRODUCT}/dates?latitude=${reqLat}&longitude=${reqLon}`, { product: PRODUCT, kind: "dates", location: locKey, day: now.toISOString().slice(0, 10) }, 86_400_000, now);
  const dates = recentComposites(datesSchema.parse(dl.raw).dates);
  if (!dates.length) throw new PipelineError("ORNL lists no MOD13Q1 composites for this location", "invalid");
  const chunks: { modis: string[]; calendar: string[] }[] = [];
  for (let i = 0; i < dates.length; i += MAX_DATES_PER_SUBSET) {
    const part = dates.slice(i, i + MAX_DATES_PER_SUBSET);
    chunks.push({ modis: part.map((d) => d.modis_date), calendar: part.map((d) => d.calendar_date) });
  }

  let grid: PixelGrid | null = null;
  const ndvi = new Map<string, { calendar: string; data: number[]; tile: string; proc: string }>();
  const rel = new Map<string, number[]>();
  const shas: string[] = [];
  const fetched: string[] = [];
  let bytes = 0;
  let scaleMismatch = 0;
  let gridMismatch = 0;

  const tasks = chunks.flatMap((c) => (["250m_16_days_NDVI", "250m_16_days_pixel_reliability"] as const).map((band) => ({ c, band })));
  const total = tasks.length;
  let done = 0;
  // Download in parallel; results come back in task order, so processing and the combined hash are unchanged.
  const responses = await mapLimited(tasks, MODIS_PARALLEL, async ({ c, band }) => {
    const url = `${ORNL_BASE}/${PRODUCT}/subset?latitude=${reqLat}&longitude=${reqLon}&band=${band}&startDate=${c.modis[0]}&endDate=${c.modis.at(-1)}&kmAboveBelow=${km}&kmLeftRight=${km}`;
    const r = await getJson(url, { product: `${PRODUCT}.${VERSION}`, band, location: locKey, start: c.modis[0]!, end: c.modis.at(-1)! }, chunkMaxAge(c.calendar.at(-1)!, now), now);
    await progress({ step: `MODIS ${c.calendar[0]!.slice(0, 7)} ${band.endsWith("NDVI") ? "NDVI" : "quality"}`, done: ++done, total });
    return r;
  });
  for (const [i, { band }] of tasks.entries()) {
    const r = responses[i]!;
    const g = gridSchema.safeParse(r.raw);
    if (!g.success) throw new PipelineError(`ORNL subset response did not match the expected grid format (${g.error.issues[0]?.message})`, "invalid");
    const gg = g.data;
    const thisGrid = { xll: gg.xllcorner, yll: gg.yllcorner, cellsize: gg.cellsize, nrows: gg.nrows, ncols: gg.ncols };
    grid ??= thisGrid;
    if (Math.abs(thisGrid.xll - grid.xll) > 0.01 || Math.abs(thisGrid.yll - grid.yll) > 0.01 || thisGrid.nrows !== grid.nrows || thisGrid.ncols !== grid.ncols) gridMismatch++;
    if (band.endsWith("NDVI") && Number(gg.scale) !== NDVI_SCALE) scaleMismatch++;
    for (const s of gg.subset) {
      if (s.data.length !== gg.nrows * gg.ncols) throw new PipelineError(`ORNL subset ${s.modis_date} has ${s.data.length} values for a ${gg.nrows}×${gg.ncols} grid`, "invalid");
      if (band.endsWith("NDVI")) ndvi.set(s.modis_date, { calendar: s.calendar_date, data: s.data, tile: s.tile, proc: s.proc_date });
      else rel.set(s.modis_date, s.data);
    }
    shas.push(r.retrieval.bodySha256);
    fetched.push(r.retrieval.retrievedAt);
    bytes += r.retrieval.bodyBytes;
  }
  if (!grid) throw new PipelineError("No MODIS grid returned", "invalid");
  checks.push(check("grid-consistent", gridMismatch === 0, `${gridMismatch} chunks with a different grid`));
  checks.push(check("ndvi-scale", scaleMismatch === 0, `scale ${NDVI_SCALE} in every NDVI chunk`));
  checks.push(check("cellsize", Math.abs(grid.cellsize - CELL) < 1e-6, `cellsize ${grid.cellsize} m`));
  checks.push(check("quality-paired", [...ndvi.keys()].every((k) => rel.has(k)), `${[...ndvi.keys()].filter((k) => !rel.has(k)).length} composites without a reliability layer`));
  const listed = new Set(dates.map((d) => d.modis_date));
  checks.push(check("all-composites", [...listed].every((d) => ndvi.has(d)), `${ndvi.size}/${listed.size} listed composites returned`));

  // Classify pixels against the field boundary.
  const pixels: { id: string; index: number; fraction: number }[] = [];
  for (let r = 0; r < grid.nrows; r++)
    for (let c = 0; c < grid.ncols; c++) {
      const ring = pixelFootprint(grid, r, c);
      const fraction = fractionInside(ring, ctx.boundary);
      if (fraction > 0) pixels.push({ id: pixelId(r, c), index: r * grid.ncols + c, fraction: round(fraction, 3) });
    }
  const inside = pixels.filter((p) => p.fraction >= PIXEL_INSIDE_MIN);
  const centreIndex = Math.floor(grid.nrows / 2) * grid.ncols + Math.floor(grid.ncols / 2);
  const used = inside.length ? inside.map((p) => p.index) : [centreIndex];
  const representation = inside.length ? "field_pixels" : "centre_pixel";
  const withinField = inside.length >= MIN_PIXELS_FOR_WITHIN_FIELD && inside.length <= MAX_PIXELS;
  checks.push(check("field-pixels", true, inside.length ? `${inside.length} pixel(s) ≥ ${PIXEL_INSIDE_MIN * 100}% inside the field` : "no pixel lies mostly inside the field; using the pixel at the field's interior point"));

  const good = (md: string, idx: number): number | null => {
    const n = ndvi.get(md)?.data[idx];
    const q = rel.get(md)?.[idx];
    if (n === undefined || q === undefined || n === NDVI_FILL || n < NDVI_VALID[0] || n > NDVI_VALID[1] || q !== 0) return null;
    return round(n * NDVI_SCALE, 4);
  };

  const ordered = [...ndvi.entries()].sort(([, a], [, b]) => a.calendar.localeCompare(b.calendar));
  const aggregates: AggregateRow[] = [];
  const fieldComposites: { date: string; value: number | null }[] = [];
  const qualityCounts: Record<string, number> = {};
  for (const [md, s] of ordered) {
    const vals = used.map((i) => good(md, i));
    for (const i of used) {
      const q = rel.get(md)?.[i];
      const label = q === undefined ? "missing" : (PIXEL_RELIABILITY[q as -1 | 0 | 1 | 2 | 3] ?? `rank ${q}`);
      qualityCounts[label] = (qualityCounts[label] ?? 0) + 1;
    }
    const ok = vals.filter((v): v is number => v !== null);
    const value = ok.length > 0 && ok.length * 2 >= used.length ? round(ok.reduce((a, b) => a + b, 0) / ok.length, 4) : null;
    const end = new Date(Date.parse(`${s.calendar}T00:00:00Z`) + 15 * 86_400_000).toISOString().slice(0, 10);
    aggregates.push({ variable: "ndvi", unit: "NDVI", aggregation: "mean", periodStart: s.calendar, periodEnd: end, value, validCount: ok.length, expectedCount: used.length, pixel: "" });
    fieldComposites.push({ date: s.calendar, value });
  }
  for (const p of annualPeakNdvi(fieldComposites))
    aggregates.push({ variable: "ndvi_annual_peak", unit: "NDVI", aggregation: "max", periodStart: `${p.year}-01-01`, periodEnd: `${p.year}-12-31`, value: p.value, validCount: p.validCount, expectedCount: p.expectedCount, pixel: "" });
  if (withinField)
    for (const px of inside) {
      const comps = ordered.map(([md, s]) => ({ date: s.calendar, value: good(md, px.index) }));
      for (const p of annualPeakNdvi(comps))
        aggregates.push({ variable: "ndvi_annual_peak", unit: "NDVI", aggregation: "max", periodStart: `${p.year}-01-01`, periodEnd: `${p.year}-12-31`, value: p.value, validCount: p.validCount, expectedCount: p.expectedCount, pixel: px.id });
    }

  const failed = checks.filter((c) => !c.passed);
  const first = ordered[0]?.[1].calendar ?? null;
  const last = ordered.at(-1)?.[1].calendar ?? null;
  return {
    retrieval: {
      sourceId: "modis-mod13q1-ornl",
      productId: PRODUCT,
      productVersion: VERSION,
      evidenceClass: "satellite_observation",
      spatialSupport: `MODIS sinusoidal pixels ≈${Math.round(CELL)} m; ${representation === "field_pixels" ? `${inside.length} pixel(s) mostly inside the field` : "single pixel at the field's interior point (mixes neighbours)"}`,
      request: { endpoint: `${ORNL_BASE}/${PRODUCT}/subset`, latitude: reqLat, longitude: reqLon, kmAboveBelow: km, kmLeftRight: km, bands: ["250m_16_days_NDVI", "250m_16_days_pixel_reliability"], composites: listed.size, chunks: chunks.length },
      retrievedAt: fetched.sort()[0]!,
      responseSha256: combinedSha(shas),
      responseBytes: bytes,
      outcome: failed.length === 0 ? "valid" : "partial",
      checks,
      provenance: {
        evidenceClass: "satellite_observation",
        source: "MODIS/Terra Vegetation Indices 16-Day L3 Global 250m SIN Grid (MOD13Q1 v061) via ORNL DAAC TESViS",
        doi: "10.5067/MODIS/MOD13Q1.061",
        grid,
        representation,
        withinField,
        // Footprints are recomputed from `grid` (domain pixelFootprint); only ids and coverage are stored.
        pixels: pixels.slice(0, 200).map(({ id, fraction }) => ({ id, fraction })),
        usedPixels: used.length,
        qualityCounts,
        qualityRule: "pixel reliability 0 (good) only; ranks 1 marginal, 2 snow/ice, 3 cloudy and fill are excluded, not filled",
        tile: ordered[0]?.[1].tile ?? null,
        processedRange: [ordered.map(([, s]) => s.proc).sort()[0] ?? null, ordered.map(([, s]) => s.proc).sort().at(-1) ?? null],
        fetchedRange: [fetched.sort()[0], fetched.sort().at(-1)],
        rowOrder: "ORNL lists values row by row from the upper-left (north-west) pixel",
      },
      cacheKey: cacheKey({ source: "modis-mod13q1-ornl", location: locKey, from: first ?? "none", through: last ?? "none", processing: PROCESSING_VERSION }),
      processingVersion: PROCESSING_VERSION,
      observationStart: first,
      observationEnd: last ? new Date(Date.parse(`${last}T00:00:00Z`) + 15 * 86_400_000).toISOString().slice(0, 10) : null,
    },
    aggregates,
  };
}
