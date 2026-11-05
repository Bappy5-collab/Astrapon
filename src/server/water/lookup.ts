/**
 * Water & Energy lookups: mapped surface water, groundwater records and NASA POWER solar for a
 * field. Credential-free (usable by scripts); the server actions add auth and ownership checks.
 *
 * These are small, bounded, user-triggered requests (like place search), not the bulk evidence
 * downloads that run only in the worker: one Overpass query, ≤ 3 station queries, observation
 * requests for the nearest few stations, and one POWER point request, each with a timeout and
 * bounded retries, cached in memory. Precise field coordinates are never written to a shared
 * cache: cache keys round the search box to ≈ 100 m and stay in the server process.
 */

import type { BoundaryGeometry } from "@/domain/geo/boundary";
import { boundaryOrigin } from "@/domain/geo/local-frame";
import { routeProviders, type Box } from "@/domain/water/coverage";
import { boundaryDistance, fieldFrame, MAX_SEARCH_RADIUS_M, searchBox } from "@/domain/water/distance";
import { dedupeStations, outcomeFor, rankStations, type GroundwaterStation, type ProviderOutcome } from "@/domain/water/groundwater";
import type { GroundwaterLookup, ProviderReport, SurfaceLookup } from "@/domain/water/lookup-types";
import { measureSources } from "@/domain/water/surface";

export type { GroundwaterLookup, ProviderReport, SurfaceLookup };
import { ADAPTERS, ProviderError, type RequestLog } from "@/server/providers/groundwater-adapters";
import { fetchWaterGeometry } from "@/server/providers/overpass";
import { fetchSolar, type SolarOutcome } from "@/server/providers/power-solar";

export const SURFACE_MAX_RADIUS_M = 10_000;
export const GROUNDWATER_MAX_RADIUS_M = MAX_SEARCH_RADIUS_M;
/** Observations are requested only for this many nearest stations per provider. */
export const SERIES_STATIONS_PER_PROVIDER = 6;
export const GROUNDWATER_FROM_YEARS = 30;

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();
function cached<T>(key: string): T | null {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < TTL_MS ? (hit.value as T) : null;
}
function store(key: string, value: unknown) {
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value });
}
const boxKey = (b: Box) => [b.west, b.south, b.east, b.north].map((v) => v.toFixed(3)).join(",");

const ANTIMERIDIAN_LOOKUP = "This search area crosses the 180° meridian, which the water and groundwater services cannot be asked about in one box. Use a smaller radius, or enter your source and depth yourself.";

// -------------------------------------------------------------- surface ---


export async function lookupSurfaceWater(field: BoundaryGeometry, radiusM: number): Promise<SurfaceLookup> {
  if (!(radiusM >= 100 && radiusM <= SURFACE_MAX_RADIUS_M)) return { ok: false, radiusM, reason: "invalid", message: `Choose a search radius between 0.1 and ${SURFACE_MAX_RADIUS_M / 1000} km.` };
  const box = searchBox(field, radiusM);
  if (!box) return { ok: false, radiusM, reason: "unsupported_location", message: ANTIMERIDIAN_LOOKUP };
  const key = `osm|${boxKey(box)}`;
  let hit = cached<Awaited<ReturnType<typeof fetchWaterGeometry>> & { ok: true }>(key);
  const wasCached = !!hit;
  if (!hit) {
    const res = await fetchWaterGeometry(box);
    if (!res.ok) return { ok: false, radiusM, reason: "provider_error", message: res.error };
    hit = res;
    store(key, res);
  }
  const { sources, dropped } = measureSources(hit.elements, field, radiusM);
  return {
    ok: true,
    radiusM,
    box,
    sources: sources.slice(0, 60),
    total: sources.length,
    truncated: hit.truncated,
    dropped,
    provider: { name: "OpenStreetMap via Overpass API", licence: "© OpenStreetMap contributors, ODbL 1.0", endpoint: hit.endpoint, osmBase: hit.osmBase, retrievedAt: hit.retrieval.retrievedAt, bodySha256: hit.retrieval.bodySha256, cached: wasCached },
  };
}

// ----------------------------------------------------------- groundwater ---


export async function lookupGroundwater(field: BoundaryGeometry, radiusM: number, countryHint: string | null, now = new Date()): Promise<GroundwaterLookup> {
  if (!(radiusM >= 500 && radiusM <= GROUNDWATER_MAX_RADIUS_M)) return { ok: false, radiusM, reason: "invalid", message: `Choose a search radius between 0.5 and ${GROUNDWATER_MAX_RADIUS_M / 1000} km.` };
  const box = searchBox(field, radiusM);
  if (!box) return { ok: false, radiusM, reason: "unsupported_location", message: ANTIMERIDIAN_LOOKUP };
  const fromDate = `${now.getUTCFullYear() - GROUNDWATER_FROM_YEARS}-01-01`;
  const key = `gw|${boxKey(box)}|${fromDate}`;
  const hit = cached<{ providers: ProviderReport[]; stations: (GroundwaterStation & { distanceM: number })[] }>(key);
  const frame = fieldFrame(field);
  const routes = routeProviders(box, countryHint);
  let providers: ProviderReport[];
  let all: (GroundwaterStation & { distanceM: number })[];
  if (hit) ({ providers, stations: all } = hit);
  else {
    all = [];
    providers = await Promise.all(
      routes.map(async ({ provider, covers, consult, reason }): Promise<ProviderReport> => {
        const base = { id: provider.id, name: provider.name, operator: provider.operator, scope: provider.scope, consulted: consult, licence: provider.licence, homepage: provider.homepage, stationsFound: 0, stationsInRadius: 0, seriesRequested: 0, truncated: false, requests: [] as RequestLog[] };
        if (!consult) {
          const outcome: ProviderOutcome = !covers ? "not_covered" : provider.integration === "credential_required" ? "credential_required" : provider.integration === "access_restricted" ? "access_restricted" : "not_integrated";
          return { ...base, outcome, message: reason };
        }
        const adapter = ADAPTERS[provider.id];
        if (!adapter) return { ...base, outcome: "not_integrated", message: "No adapter is configured." };
        const q = { box, fromDate, timeoutMs: 25_000 };
        try {
          const found = await adapter.findStations(q);
          const inRadius = found.stations
            .map((s) => ({ ...s, distanceM: Math.round(boundaryDistance(field, { type: "Point", coordinates: [s.lon, s.lat] }, frame).distanceM * 10) / 10 }))
            .filter((s) => s.distanceM <= radiusM)
            .sort((a, b) => a.distanceM - b.distanceM);
          // Observations are requested first for the nearest stations whose provider-reported last observation is
          // recent, then inside the query period, then undated. Stations are never searched beyond the radius.
          const recentFrom = `${now.getUTCFullYear() - 3}-01-01`;
          const tier = (s: GroundwaterStation) => (s.lastObservation == null ? 2 : s.lastObservation.slice(0, 10) >= recentFrom ? 0 : s.lastObservation.slice(0, 10) >= fromDate ? 1 : 3);
          const nearest = [...inRadius].sort((a, b) => tier(a) - tier(b) || a.distanceM - b.distanceM).slice(0, SERIES_STATIONS_PER_PROVIDER);
          let seriesLog: RequestLog[] = [];
          let seriesError: string | null = null;
          if (nearest.length) {
            try {
              seriesLog = await adapter.getMeasurements(nearest, q);
            } catch (e) {
              seriesError = e instanceof Error ? e.message : String(e);
              seriesLog = e instanceof ProviderError ? e.log : [];
            }
          }
          all.push(...inRadius);
          const outcome = seriesError ? "error" : outcomeFor(nearest, now);
          return {
            ...base,
            outcome,
            message: seriesError ? `Stations were found, but observations could not be retrieved (${seriesError}). This is a temporary provider problem, not “no groundwater”.` : inRadius.length ? `${inRadius.length} monitoring well(s) within ${(radiusM / 1000).toFixed(1)} km; observations requested for the nearest ${nearest.length}.` : `No monitoring wells within ${(radiusM / 1000).toFixed(1)} km.`,
            stationsFound: found.stations.length,
            stationsInRadius: inRadius.length,
            seriesRequested: nearest.length,
            truncated: found.truncated,
            requests: [...found.log, ...seriesLog].map(redact),
          };
        } catch (e) {
          return { ...base, outcome: "error", message: `The provider did not answer (${e instanceof Error ? e.message : String(e)}). This is a temporary error, not “no groundwater”.`, requests: (e instanceof ProviderError ? e.log : []).map(redact) };
        }
      }),
    );
    if (providers.every((p) => !p.consulted || p.outcome !== "error")) store(key, { providers, stations: all });
  }
  const deduped = dedupeStations(all, ["usgs", "hubeau", "igrac_ggmn"]);
  return { ok: true, radiusM, box, fromDate, asOf: now.toISOString(), countryHint, providers, stations: rankStations(deduped, now) };
}

/** Request logs keep host, path and status; the query (which carries the search box) is dropped. */
function redact(l: RequestLog): RequestLog {
  try {
    const u = new URL(l.url);
    return { ...l, url: `${u.origin}${u.pathname}` };
  } catch {
    return { ...l, url: "(unparseable)" };
  }
}

// ------------------------------------------------------------------ solar ---

export async function lookupSolar(field: BoundaryGeometry, now = new Date()): Promise<SolarOutcome> {
  const [lon, lat] = boundaryOrigin(field);
  const key = `solar|${lat.toFixed(2)},${lon.toFixed(2)}|${now.getUTCFullYear()}`;
  const hit = cached<SolarOutcome>(key);
  if (hit) return hit;
  const res = await fetchSolar(lat, lon, now);
  if (res.ok) store(key, { ...res, days: [] });
  return res.ok ? { ...res, days: [] } : res;
}
