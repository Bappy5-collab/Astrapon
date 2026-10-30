import { z } from "zod";

import type { EvidenceClass, Provenance } from "@/domain/provenance/evidence";

import { check, fetchText, type Check, type Retrieval } from "./http";

/**
 * NASA POWER Daily API, point endpoint, Agroclimatology (AG) community.
 * Docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
 *
 * POWER is a *derived* product. Meteorology comes from the MERRA-2 reanalysis,
 * then GEOS-IT for the most recent months; solar fluxes from CERES SYN1deg,
 * then FLASHFlux. Which upstreams were used is read from each response header.
 * Values describe a coarse grid cell, never a specific field.
 * Docs: https://power.larc.nasa.gov/docs/methodology/
 */
export const POWER_DAILY_POINT_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
export const POWER_FILL_VALUE = -999;

type ParameterSpec = {
  units: string;
  /** Upstream product behind the parameter, as documented by POWER. */
  upstream: string;
  evidenceClass: EvidenceClass;
  spatialSupport: string;
  /** Physically plausible bounds used as a sanity check, not a quality flag. */
  plausible: [number, number];
};

// POWER methodology states a ½° lat × ⅝° lon native meteorology grid; the daily API page also says 0.5° × 0.5°.
const MET_CELL = "meteorology grid cell, ½° lat × ⅝° lon native (POWER docs also cite 0.5° × 0.5°)";
const SOLAR_CELL = "solar grid cell, 1° × 1°";

/** Parameters FieldShift requests. Units are verified against each live response. */
export const POWER_PARAMETERS = {
  T2M: { units: "C", upstream: "MERRA-2 / GEOS-IT", evidenceClass: "assimilated_model_product", spatialSupport: MET_CELL, plausible: [-90, 60] },
  T2M_MAX: { units: "C", upstream: "MERRA-2 / GEOS-IT", evidenceClass: "assimilated_model_product", spatialSupport: MET_CELL, plausible: [-90, 60] },
  T2M_MIN: { units: "C", upstream: "MERRA-2 / GEOS-IT", evidenceClass: "assimilated_model_product", spatialSupport: MET_CELL, plausible: [-90, 60] },
  PRECTOTCORR: {
    units: "mm/day",
    upstream: "MERRA-2 bias-corrected total precipitation (GEOS-IT for recent dates)",
    evidenceClass: "assimilated_model_product",
    spatialSupport: MET_CELL,
    plausible: [0, 2000],
  },
  RH2M: { units: "%", upstream: "MERRA-2 / GEOS-IT", evidenceClass: "assimilated_model_product", spatialSupport: MET_CELL, plausible: [0, 100.5] },
  WS2M: { units: "m/s", upstream: "MERRA-2 / GEOS-IT", evidenceClass: "assimilated_model_product", spatialSupport: MET_CELL, plausible: [0, 75] },
  ALLSKY_SFC_SW_DWN: {
    units: "MJ/m^2/day",
    upstream: "CERES SYN1deg / FLASHFlux (recent dates), satellite-derived via radiative-transfer modelling",
    evidenceClass: "assimilated_model_product",
    spatialSupport: SOLAR_CELL,
    plausible: [0, 50],
  },
  GWETROOT: {
    units: "1",
    upstream: "reanalysis land-model root-zone (≈ upper 1 m) soil wetness, 0 dry – 1 saturated",
    evidenceClass: "assimilated_model_product",
    spatialSupport: MET_CELL,
    plausible: [0, 1],
  },
} as const satisfies Record<string, ParameterSpec>;

export type PowerParameter = keyof typeof POWER_PARAMETERS;

export type PowerDailyRequest = {
  latitude: number;
  longitude: number;
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  end: string;
  parameters: PowerParameter[];
};

const ymd = (iso: string) => iso.replaceAll("-", "");

export function buildPowerDailyPointUrl(req: PowerDailyRequest): string {
  const params = new URLSearchParams({
    parameters: req.parameters.join(","),
    community: "AG",
    longitude: String(req.longitude),
    latitude: String(req.latitude),
    start: ymd(req.start),
    end: ymd(req.end),
    format: "JSON",
    "time-standard": "LST",
  });
  return `${POWER_DAILY_POINT_URL}?${params}`;
}

/** Calendar dates from start to end inclusive, as YYYYMMDD keys (POWER's key format). */
export function dateKeys(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10).replaceAll("-", ""));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const powerResponseSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({ type: z.literal("Point"), coordinates: z.array(z.number()).min(2) }),
  properties: z.object({ parameter: z.record(z.string(), z.record(z.string(), z.number())) }),
  header: z.object({
    title: z.string(),
    api: z.object({ version: z.string(), name: z.string() }),
    sources: z.array(z.string()),
    fill_value: z.number(),
    time_standard: z.string(),
    start: z.string(),
    end: z.string(),
  }),
  messages: z.array(z.unknown()),
  parameters: z.record(z.string(), z.object({ units: z.string(), longname: z.string() })),
});

export type PowerSeries = {
  parameter: PowerParameter;
  units: string;
  longname: string;
  /** null = POWER fill value (no data). No-data is never converted to zero. */
  values: (number | null)[];
  validCount: number;
  missingCount: number;
  provenance: Provenance;
};

export type PowerDailyResult = {
  request: PowerDailyRequest;
  dates: string[];
  series: PowerSeries[];
  apiVersion: string | null;
  upstreamSources: string[];
  /** Third coordinate POWER returns with the point (metres); its exact definition is not documented in the response. */
  reportedElevationM: number | null;
  checks: Check[];
  ok: boolean;
};

/**
 * Validate a POWER daily point response against the request. HTTP 200 alone is
 * not accepted: location, period, completeness, units, fill handling, and
 * physical plausibility are all checked and reported.
 */
export function parsePowerDailyPoint(raw: unknown, req: PowerDailyRequest, retrieval?: Retrieval): PowerDailyResult {
  const checks: Check[] = [];
  const dates = dateKeys(req.start, req.end);
  const parsed = powerResponseSchema.safeParse(raw);
  if (!parsed.success) {
    checks.push(check("schema", false, parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")));
    return { request: req, dates, series: [], apiVersion: null, upstreamSources: [], reportedElevationM: null, checks, ok: false };
  }
  const r = parsed.data;
  checks.push(check("schema", true, `GeoJSON Feature, API ${r.header.api.name} ${r.header.api.version}`));

  const [lon, lat, elev] = r.geometry.coordinates as [number, number, number?];
  checks.push(
    check(
      "location",
      Math.abs(lat - req.latitude) < 1e-6 && Math.abs(lon - req.longitude) < 1e-6,
      `requested (${req.latitude}, ${req.longitude}), returned (${lat}, ${lon})`,
    ),
  );
  checks.push(
    check("period", r.header.start === ymd(req.start) && r.header.end === ymd(req.end), `requested ${ymd(req.start)}–${ymd(req.end)}, header ${r.header.start}–${r.header.end}`),
  );
  checks.push(check("time-standard", r.header.time_standard === "LST", `time_standard=${r.header.time_standard}`));
  checks.push(check("fill-value", r.header.fill_value === POWER_FILL_VALUE, `header fill_value=${r.header.fill_value}`));
  checks.push(check("no-messages", r.messages.length === 0, r.messages.length === 0 ? "no API messages" : JSON.stringify(r.messages).slice(0, 200)));

  const series: PowerSeries[] = [];
  for (const name of req.parameters) {
    const spec: ParameterSpec = POWER_PARAMETERS[name];
    const meta = r.parameters[name];
    const byDate = r.properties.parameter[name];
    if (!meta || !byDate) {
      checks.push(check(`${name}:present`, false, "parameter missing from response"));
      continue;
    }
    checks.push(check(`${name}:units`, meta.units === spec.units, `expected ${spec.units}, got ${meta.units}`));

    const keys = Object.keys(byDate);
    const missingDates = dates.filter((d) => !(d in byDate));
    const extraDates = keys.filter((k) => !dates.includes(k));
    checks.push(
      check(`${name}:dates`, missingDates.length === 0 && extraDates.length === 0, `${keys.length}/${dates.length} dates; missing ${missingDates.length}, unexpected ${extraDates.length}`),
    );

    let implausible = 0;
    const values = dates.map((d) => {
      const v = byDate[d];
      if (v === undefined || v === r.header.fill_value) return null;
      if (v < spec.plausible[0] || v > spec.plausible[1]) implausible++;
      return v;
    });
    const validCount = values.filter((v) => v !== null).length;
    const trailingMissing = values.length - 1 - values.findLastIndex((v) => v !== null);
    checks.push(
      check(`${name}:has-data`, validCount > 0, `${validCount}/${values.length} valid; ${trailingMissing} trailing fill (near-real-time latency)`),
    );
    checks.push(check(`${name}:plausible`, implausible === 0, `${implausible} values outside [${spec.plausible.join(", ")}] ${spec.units}`));

    series.push({
      parameter: name,
      units: meta.units,
      longname: meta.longname,
      values,
      validCount,
      missingCount: values.length - validCount,
      provenance: {
        evidenceClass: spec.evidenceClass,
        source: `NASA POWER Daily API; parameter upstream: ${spec.upstream}; response sources: ${r.header.sources.join(", ")}`,
        product: { id: `POWER/daily/point/AG/${name}`, version: r.header.api.version },
        spatialSupport: spec.spatialSupport,
        temporalCoverage: { start: req.start, end: req.end },
        retrievedAt: retrieval?.retrievedAt,
      },
    });
  }

  const tmax = series.find((s) => s.parameter === "T2M_MAX");
  const tmin = series.find((s) => s.parameter === "T2M_MIN");
  if (tmax && tmin) {
    const inverted = tmax.values.filter((v, i) => v !== null && tmin.values[i] != null && v < (tmin.values[i] as number)).length;
    checks.push(check("tmin<=tmax", inverted === 0, `${inverted} days with T2M_MIN > T2M_MAX`));
  }

  return {
    request: req,
    dates,
    series,
    apiVersion: r.header.api.version,
    upstreamSources: r.header.sources,
    reportedElevationM: typeof elev === "number" ? elev : null,
    checks,
    ok: checks.every((c) => c.passed),
  };
}

export type PowerFetchOutcome =
  | { ok: true; url: string; retrieval: Retrieval; raw: unknown; result: PowerDailyResult }
  | { ok: false; url: string; retrievedAt: string; error: string; status?: number };

export async function fetchPowerDailyPoint(req: PowerDailyRequest): Promise<PowerFetchOutcome> {
  const url = buildPowerDailyPointUrl(req);
  const res = await fetchText(url, { timeoutMs: 90_000 });
  if (!res.ok) return { ok: false, url, retrievedAt: res.retrievedAt, error: res.error, status: res.status };
  let raw: unknown;
  try {
    raw = JSON.parse(res.body);
  } catch {
    return { ok: false, url, retrievedAt: res.retrieval.retrievedAt, error: "response was not JSON", status: res.retrieval.status };
  }
  return { ok: true, url, retrieval: res.retrieval, raw, result: parsePowerDailyPoint(raw, req, res.retrieval) };
}
