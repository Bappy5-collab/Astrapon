import { z } from "zod";

import type { Provenance } from "@/domain/provenance/evidence";

import { check, fetchText, type Check, type Retrieval } from "./http";

/**
 * ORNL DAAC MODIS/VIIRS Land Product Subsets REST service (TESViS), v1.
 * Docs: https://modis.ornl.gov/data/modis_webservice.html
 * No authentication. JSON requires `Accept: application/json`. At most 10 dates per /subset call.
 *
 * Used for MOD13Q1 v061 NDVI (250 m, 16-day composite). A 250 m pixel usually
 * mixes several fields: values are neighbourhood context, not field measurements.
 */
export const ORNL_BASE = "https://modis.ornl.gov/rst/api/v1";
export const MAX_DATES_PER_SUBSET = 10;
const JSON_ACCEPT = { Accept: "application/json" };

const bandsSchema = z.object({
  bands: z.array(
    z.object({
      band: z.string(),
      units: z.string(),
      fill_value: z.string().optional(),
      scale_factor: z.string().optional(),
      valid_range: z.string().optional(),
    }),
  ),
});

const datesSchema = z.object({ dates: z.array(z.object({ modis_date: z.string(), calendar_date: z.string() })) });

const subsetSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  band: z.string(),
  units: z.string(),
  scale: z.string(),
  cellsize: z.number(),
  nrows: z.number(),
  ncols: z.number(),
  subset: z.array(
    z.object({ modis_date: z.string(), calendar_date: z.string(), band: z.string(), tile: z.string(), proc_date: z.string(), data: z.array(z.number()) }),
  ),
});

export type BandInfo = { band: string; units: string; fill: number | null; scale: number; validRange: [number, number] | null };

export function parseBandInfo(raw: unknown, band: string): BandInfo | null {
  const b = bandsSchema.parse(raw).bands.find((x) => x.band === band);
  if (!b) return null;
  const range = b.valid_range?.match(/^(-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?)$/);
  return {
    band: b.band,
    units: b.units,
    fill: b.fill_value !== undefined ? Number(b.fill_value) : null,
    scale: b.scale_factor !== undefined ? Number(b.scale_factor) : 1,
    validRange: range ? [Number(range[1]), Number(range[2])] : null,
  };
}

/**
 * MOD13Q1 pixel reliability ranks. Range (0–3, fill −1) is from the official
 * v061 catalog; the labels come from the MOD13 user guide table as mirrored in
 * secondary sources and still need checking against the V6.1 guide (see registry).
 */
export const PIXEL_RELIABILITY = { [-1]: "fill/no data", 0: "good", 1: "marginal", 2: "snow/ice", 3: "cloudy" } as const;

export type NdviSample = {
  modisDate: string;
  calendarDate: string;
  tile: string;
  processedAt: string;
  rawNdvi: number;
  /** Scaled NDVI, or null when fill/out-of-range/not "good" reliability. No-data is never zero. */
  ndvi: number | null;
  reliability: number | null;
  excludedBecause: string | null;
};

export type NdviResult = {
  latitude: number;
  longitude: number;
  cellsizeM: number;
  samples: NdviSample[];
  provenance: Provenance;
  checks: Check[];
  ok: boolean;
};

async function getJson(url: string): Promise<{ raw: unknown; retrieval: Retrieval } | { error: string }> {
  const res = await fetchText(url, { headers: JSON_ACCEPT, timeoutMs: 120_000 });
  if (!res.ok) return { error: `${res.error}${res.bodySnippet ? ` — ${res.bodySnippet.slice(0, 120)}` : ""}` };
  if (!res.retrieval.contentType?.includes("json")) return { error: `expected JSON, got ${res.retrieval.contentType}` };
  return { raw: JSON.parse(res.body), retrieval: res.retrieval };
}

/**
 * Combine an NDVI subset response and a pixel-reliability subset response for a
 * single pixel (kmAboveBelow=kmLeftRight=0). Pure: unit-tested with fixtures.
 */
export function combineNdvi(
  ndviRaw: unknown[],
  reliabilityRaw: unknown[],
  ndviBand: BandInfo,
  request: { latitude: number; longitude: number; startDate: string; endDate: string },
  retrievedAt?: string,
): NdviResult {
  const checks: Check[] = [];
  const ndviChunks = ndviRaw.map((r) => subsetSchema.parse(r));
  const relChunks = reliabilityRaw.map((r) => subsetSchema.parse(r));
  const ndviRows = ndviChunks.flatMap((c) => c.subset);
  const relByDate = new Map(relChunks.flatMap((c) => c.subset).map((s) => [s.modis_date, s.data[0]]));
  const first = ndviChunks[0];

  checks.push(
    check(
      "location",
      ndviChunks.every((c) => Math.abs(c.latitude - request.latitude) < 1e-6 && Math.abs(c.longitude - request.longitude) < 1e-6),
      `requested (${request.latitude}, ${request.longitude})`,
    ),
  );
  checks.push(check("single-pixel", ndviChunks.every((c) => c.nrows === 1 && c.ncols === 1), "1×1 pixel subset"));
  checks.push(check("scale", ndviChunks.every((c) => Number(c.scale) === ndviBand.scale), `response scale ${first?.scale}, band metadata ${ndviBand.scale}`));
  checks.push(
    check(
      "period",
      ndviRows.length > 0 && ndviRows.every((s) => s.calendar_date >= request.startDate && s.calendar_date <= request.endDate),
      `${ndviRows.length} composites within ${request.startDate}–${request.endDate}`,
    ),
  );
  checks.push(check("reliability-paired", ndviRows.every((s) => relByDate.has(s.modis_date)), "every NDVI composite has a reliability rank"));

  const samples: NdviSample[] = ndviRows.map((s) => {
    const raw = s.data[0] ?? NaN;
    const rel = relByDate.get(s.modis_date) ?? null;
    let excludedBecause: string | null = null;
    if (!Number.isFinite(raw) || raw === ndviBand.fill) excludedBecause = "fill value";
    else if (ndviBand.validRange && (raw < ndviBand.validRange[0] || raw > ndviBand.validRange[1])) excludedBecause = "outside valid range";
    else if (rel === null || rel === -1) excludedBecause = "no reliability rank";
    else if (rel !== 0) excludedBecause = `reliability rank ${rel} (${PIXEL_RELIABILITY[rel as 1 | 2 | 3] ?? "unknown"})`;
    return {
      modisDate: s.modis_date,
      calendarDate: s.calendar_date,
      tile: s.tile,
      processedAt: s.proc_date,
      rawNdvi: raw,
      ndvi: excludedBecause ? null : Math.round(raw * ndviBand.scale * 10000) / 10000,
      reliability: rel,
      excludedBecause,
    };
  });
  checks.push(check("has-valid-samples", samples.some((s) => s.ndvi !== null), `${samples.filter((s) => s.ndvi !== null).length}/${samples.length} usable`));

  return {
    latitude: request.latitude,
    longitude: request.longitude,
    cellsizeM: first?.cellsize ?? NaN,
    samples,
    provenance: {
      evidenceClass: "satellite_observation",
      source: "MODIS/Terra MOD13Q1 v061 via ORNL DAAC TESViS subset service (16-day maximum-value composite)",
      product: { id: "MOD13Q1", version: "061", doi: "10.5067/MODIS/MOD13Q1.061" },
      spatialResolutionMeters: first?.cellsize,
      spatialSupport: "≈231.66 m MODIS sinusoidal pixel containing the point",
      temporalCoverage: { start: request.startDate, end: request.endDate },
      retrievedAt,
    },
    checks,
    ok: checks.every((c) => c.passed),
  };
}

const toModisDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const doy = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  return `A${d.getUTCFullYear()}${String(doy).padStart(3, "0")}`;
};

/** Fetch MOD13Q1 NDVI + pixel reliability for one point over a period, chunked to ≤10 composites per call. */
export async function fetchMod13q1Ndvi(latitude: number, longitude: number, startDate: string, endDate: string) {
  const product = "MOD13Q1";
  const loc = `latitude=${latitude}&longitude=${longitude}`;
  const bandsRes = await getJson(`${ORNL_BASE}/${product}/bands`);
  if ("error" in bandsRes) return { error: `bands: ${bandsRes.error}` } as const;
  const ndviBand = parseBandInfo(bandsRes.raw, "250m_16_days_NDVI");
  if (!ndviBand) return { error: "bands: 250m_16_days_NDVI not listed" } as const;

  const datesRes = await getJson(`${ORNL_BASE}/${product}/dates?${loc}`);
  if ("error" in datesRes) return { error: `dates: ${datesRes.error}` } as const;
  const dates = datesSchema
    .parse(datesRes.raw)
    .dates.filter((d) => d.calendar_date >= startDate && d.calendar_date <= endDate)
    .map((d) => d.modis_date);
  if (dates.length === 0) return { error: `no composites between ${startDate} and ${endDate}` } as const;

  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += MAX_DATES_PER_SUBSET) chunks.push(dates.slice(i, i + MAX_DATES_PER_SUBSET));

  const urls: string[] = [];
  const ndviRaw: unknown[] = [];
  const relRaw: unknown[] = [];
  let retrievedAt: string | undefined;
  for (const c of chunks) {
    for (const [band, sink] of [["250m_16_days_NDVI", ndviRaw], ["250m_16_days_pixel_reliability", relRaw]] as const) {
      const url = `${ORNL_BASE}/${product}/subset?${loc}&band=${band}&startDate=${c[0]}&endDate=${c.at(-1)}&kmAboveBelow=0&kmLeftRight=0`;
      const res = await getJson(url);
      if ("error" in res) return { error: `subset ${band}: ${res.error}` } as const;
      urls.push(url);
      sink.push(res.raw);
      retrievedAt ??= res.retrieval.retrievedAt;
    }
  }
  return {
    urls,
    bandsRaw: bandsRes.raw,
    ndviRaw,
    relRaw,
    result: combineNdvi(ndviRaw, relRaw, ndviBand, { latitude, longitude, startDate, endDate }, retrievedAt),
    requestedModisRange: [toModisDate(startDate), toModisDate(endDate)],
  } as const;
}
