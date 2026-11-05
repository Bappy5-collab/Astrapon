/**
 * Groundwater provider adapters (credential-free public services). Each adapter discovers
 * stations in a search box and then retrieves actual water-level observations for the nearest
 * stations only. A station without returned observations is reported as metadata only.
 *
 *  - USGS Water Data OGC API (https://api.waterdata.usgs.gov/ogcapi/v0/): monitoring-locations
 *    (site_type_code=GW) and field-measurements for parameter 72019 (depth to water level, ft below
 *    land surface). Public domain.
 *  - Hub'Eau Piézométrie v1 (https://hubeau.eaufrance.fr/api/v1/niveaux_nappes): stations and
 *    chroniques (daily levels: niveau_nappe_eau, m NGF; profondeur_nappe, m below the measuring
 *    reference). Licence Ouverte 2.0.
 *  - IGRAC GGIS (https://ggis.un-igrac.org): public WFS layer groundwater:GGMN_Levels_Data and the
 *    documented public measurement URL /groundwater/record/{id}/measurements/WellLevelMeasurement/data.
 *    Reuse conditions set by each original provider, who is credited on every record.
 */

import type { Box } from "@/domain/water/coverage";
import { normaliseMeasurement, type GroundwaterMeasurement, type GroundwaterStation, type ProviderId } from "@/domain/water/groundwater";
import type { RequestLog } from "@/domain/water/lookup-types";
import { lengthToM, FT_TO_M } from "@/domain/water/units";

export type { RequestLog };

import { fetchText } from "./http";

export type AdapterQuery = {
  box: Box;
  /** Observations on or after this date (YYYY-MM-DD) are requested. */
  fromDate: string;
  timeoutMs: number;
};


export type FindResult = { stations: GroundwaterStation[]; truncated: boolean; log: RequestLog[] };

export interface GroundwaterAdapter {
  id: ProviderId;
  findStations(q: AdapterQuery): Promise<FindResult>;
  /** Fills `measurements` (newest first) for the given stations; returns the request log. */
  getMeasurements(stations: GroundwaterStation[], q: AdapterQuery): Promise<RequestLog[]>;
}

export class ProviderError extends Error {
  constructor(message: string, public log: RequestLog[]) {
    super(message);
  }
}

async function getJson(url: string, timeoutMs: number, log: RequestLog[]): Promise<unknown> {
  const res = await fetchText(url, { timeoutMs, attempts: 2, headers: { Accept: "application/json" } });
  if (!res.ok) {
    log.push({ url, status: res.status ?? null, ok: false, retrievedAt: res.retrievedAt, durationMs: res.durationMs, note: res.error });
    throw new ProviderError(res.error, log);
  }
  log.push({ url, status: res.retrieval.status, ok: true, retrievedAt: res.retrieval.retrievedAt, durationMs: res.retrieval.durationMs, bodySha256: res.retrieval.bodySha256 });
  try {
    return JSON.parse(res.body);
  } catch {
    throw new ProviderError("unreadable JSON", log);
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const now = () => new Date().toISOString();

/** Runs per-station requests; one failing station does not lose the others. Throws only if all fail. */
async function eachStation(stations: GroundwaterStation[], log: RequestLog[], fn: (s: GroundwaterStation) => Promise<void>) {
  const results = await Promise.allSettled(stations.map(fn));
  if (stations.length && results.every((r) => r.status === "rejected")) throw new ProviderError("every observation request failed", log);
}

// ------------------------------------------------------------------ USGS ---

const USGS = "https://api.waterdata.usgs.gov/ogcapi/v0/collections";
export const USGS_STATION_LIMIT = 500;

type Feature = { id?: string; geometry?: { type: string; coordinates?: number[] } | null; properties?: Record<string, unknown> };

export const usgsAdapter: GroundwaterAdapter = {
  id: "usgs",
  async findStations(q) {
    const log: RequestLog[] = [];
    const bbox = [q.box.west, q.box.south, q.box.east, q.box.north].map((v) => v.toFixed(5)).join(",");
    const j = (await getJson(`${USGS}/monitoring-locations/items?f=json&bbox=${bbox}&site_type_code=GW&limit=${USGS_STATION_LIMIT}`, q.timeoutMs, log)) as { features?: Feature[] };
    const feats = Array.isArray(j.features) ? j.features : [];
    const stations: GroundwaterStation[] = [];
    for (const f of feats) {
      const p = f.properties ?? {};
      const c = f.geometry?.coordinates;
      const id = str(p.id) ?? str(f.id);
      if (!id || !Array.isArray(c) || num(c[0]) == null || num(c[1]) == null) continue;
      const altFt = num(p.altitude);
      const datum = str(p.vertical_datum);
      const depthFt = num(p.well_constructed_depth) ?? num(p.hole_constructed_depth);
      stations.push({
        provider: "usgs",
        stationId: id,
        authorityId: id,
        authority: str(p.agency_name) ?? "U.S. Geological Survey",
        name: str(p.monitoring_location_name) ?? id,
        lon: c[0]!, lat: c[1]!,
        country: str(p.country_name),
        aquifer: str(p.national_aquifer_code) ?? str(p.aquifer_code),
        wellDepthM: depthFt == null ? null : depthFt * FT_TO_M,
        groundElevation: altFt != null && datum ? { valueM: altFt * FT_TO_M, datum, basis: "surveyed_or_provider" } : null,
        recordUrl: `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(id.replace(/^USGS-/, ""))}/`,
        firstObservation: null, lastObservation: null, observationCount: null,
        measurements: [], measurementsRequested: false, mirrors: [], retrievedAt: now(),
      });
    }
    // Latest depth-to-water observation per well in the box, so wells with observations are asked first.
    const latest = (await getJson(`${USGS}/latest-field-measurements/items?f=json&bbox=${bbox}&parameter_code=72019&limit=${USGS_STATION_LIMIT * 2}`, Math.max(q.timeoutMs, 50_000), log)) as { features?: Feature[] };
    const byId = new Map(stations.map((s) => [s.stationId, s]));
    for (const f of latest.features ?? []) {
      const p = f.properties ?? {};
      const id = str(p.monitoring_location_id);
      const t = str(p.time);
      const c = f.geometry?.coordinates;
      if (!id || !t) continue;
      const known = byId.get(id);
      if (known) known.lastObservation = t;
      else if (Array.isArray(c) && num(c[0]) != null && num(c[1]) != null) {
        const extra: GroundwaterStation = {
          provider: "usgs", stationId: id, authorityId: id, authority: str(p.measuring_agency) ?? "U.S. Geological Survey", name: id, lon: c[0]!, lat: c[1]!,
          country: null, aquifer: null, wellDepthM: null, groundElevation: null, recordUrl: `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(id.replace(/^USGS-/, ""))}/`,
          firstObservation: null, lastObservation: t, observationCount: null, measurements: [], measurementsRequested: false, mirrors: [], retrievedAt: now(),
        };
        stations.push(extra);
        byId.set(id, extra);
      }
    }
    return { stations, truncated: feats.length >= USGS_STATION_LIMIT || (latest.features?.length ?? 0) >= USGS_STATION_LIMIT * 2, log };
  },
  async getMeasurements(stations, q) {
    const log: RequestLog[] = [];
    await eachStation(stations, log, async (s) => {
        const url = `${USGS}/field-measurements/items?f=json&monitoring_location_id=${encodeURIComponent(s.stationId)}&parameter_code=72019&datetime=${q.fromDate}T00:00:00Z/..&sortby=-time&limit=50`;
        const j = (await getJson(url, q.timeoutMs, log)) as { features?: Feature[] };
        s.measurementsRequested = true;
        s.measurements = (j.features ?? [])
          .map((f) => {
            const p = f.properties ?? {};
            const quals = Array.isArray(p.qualifier) ? (p.qualifier as unknown[]).map(String) : [];
            return normaliseMeasurement({
              time: str(p.time) ?? "",
              value: num(p.value),
              unit: str(p.unit_of_measure) ?? "",
              kind: "depth_below_ground",
              datum: "land surface",
              levelState: quals.some((x) => /pump/i.test(x)) ? "pumping" : quals.some((x) => /static/i.test(x)) ? "static" : "unknown",
              quality: [str(p.approval_status), ...quals, str(p.observing_procedure)].filter(Boolean).join("; ") || null,
              parameter: "72019 depth to water level, below land surface",
            });
          })
          .filter((m): m is GroundwaterMeasurement => m != null && !!m.time)
          .sort((a, b) => b.time.localeCompare(a.time));
    });
    return log;
  },
};

// ---------------------------------------------------------------- Hub'Eau ---

const HUBEAU = "https://hubeau.eaufrance.fr/api/v1/niveaux_nappes";
export const HUBEAU_STATION_LIMIT = 500;

export const hubeauAdapter: GroundwaterAdapter = {
  id: "hubeau",
  async findStations(q) {
    const log: RequestLog[] = [];
    const bbox = [q.box.west, q.box.south, q.box.east, q.box.north].map((v) => v.toFixed(5)).join(",");
    const j = (await getJson(`${HUBEAU}/stations?bbox=${bbox}&size=${HUBEAU_STATION_LIMIT}&format=json`, q.timeoutMs, log)) as { data?: Record<string, unknown>[]; count?: number };
    const rows = Array.isArray(j.data) ? j.data : [];
    const stations: GroundwaterStation[] = [];
    for (const p of rows) {
      const code = str(p.code_bss);
      const lon = num(p.x), lat = num(p.y);
      if (!code || lon == null || lat == null) continue;
      const alt = num(p.altitude_station);
      const masses = Array.isArray(p.noms_masse_eau_edl) ? (p.noms_masse_eau_edl as unknown[]).map(String).filter(Boolean) : [];
      const lisa = Array.isArray(p.codes_bdlisa) ? (p.codes_bdlisa as unknown[]).map(String).filter(Boolean) : [];
      stations.push({
        provider: "hubeau",
        stationId: code,
        authorityId: code,
        authority: "BRGM / ADES (France)",
        name: [str(p.libelle_pe), str(p.nom_commune)].filter(Boolean).join(" · ") || code,
        lon, lat,
        country: "France",
        aquifer: masses[0] ?? (lisa.length ? `BD LISA ${lisa.join(", ")}` : null),
        wellDepthM: num(p.profondeur_investigation),
        groundElevation: alt != null ? { valueM: alt, datum: "NGF", basis: "surveyed_or_provider" } : null,
        recordUrl: `https://ades.eaufrance.fr/Fiche/PtEau?Code=${encodeURIComponent(code)}`,
        firstObservation: str(p.date_debut_mesure),
        lastObservation: str(p.date_fin_mesure),
        observationCount: num(p.nb_mesures_piezo),
        measurements: [], measurementsRequested: false, mirrors: [], retrievedAt: now(),
      });
    }
    return { stations, truncated: (num(j.count) ?? 0) > rows.length, log };
  },
  async getMeasurements(stations, q) {
    const log: RequestLog[] = [];
    await eachStation(stations, log, async (s) => {
        const url = `${HUBEAU}/chroniques?code_bss=${encodeURIComponent(s.stationId)}&date_debut_mesure=${q.fromDate}&size=50&sort=desc&format=json`;
        const j = (await getJson(url, q.timeoutMs, log)) as { data?: Record<string, unknown>[] };
        s.measurementsRequested = true;
        const out: GroundwaterMeasurement[] = [];
        for (const p of j.data ?? []) {
          const time = str(p.date_mesure);
          if (!time) continue;
          const quality = [str(p.statut), str(p.qualification), str(p.mode_obtention)].filter(Boolean).join("; ") || null;
          const lvl = normaliseMeasurement({ time, value: num(p.niveau_nappe_eau), unit: "m", kind: "level_elevation", datum: "NGF", quality, parameter: "niveau_nappe_eau (groundwater level, m NGF)" });
          if (lvl) out.push(lvl);
          else {
            const dep = normaliseMeasurement({ time, value: num(p.profondeur_nappe), unit: "m", kind: "depth_below_reference", datum: "station measuring reference", quality, parameter: "profondeur_nappe (depth below measuring reference, m)" });
            if (dep) out.push(dep);
          }
        }
        s.measurements = out.sort((a, b) => b.time.localeCompare(a.time));
    });
    return log;
  },
};

// ------------------------------------------------------------ IGRAC GGMN ---

const GGIS = "https://ggis.un-igrac.org";
export const GGMN_STATION_LIMIT = 300;

function ggmnKind(par: string): { kind: GroundwaterMeasurement["kind"]; datum: string } | null {
  const p = par.toLowerCase();
  if (p.includes("elevation") && (p.includes("a.m.s.l") || p.includes("amsl") || p.includes("sea level"))) return { kind: "level_elevation", datum: "a.m.s.l." };
  if (p.includes("depth") && p.includes("ground surface")) return { kind: "depth_below_ground", datum: "ground surface" };
  if (p.includes("depth")) return { kind: "depth_below_reference", datum: par };
  return null;
}

export const ggmnAdapter: GroundwaterAdapter = {
  id: "igrac_ggmn",
  async findStations(q) {
    const log: RequestLog[] = [];
    // WFS 2.0 with EPSG:4326 URN uses latitude-first axis order.
    const bbox = `${q.box.south.toFixed(5)},${q.box.west.toFixed(5)},${q.box.north.toFixed(5)},${q.box.east.toFixed(5)},urn:ogc:def:crs:EPSG::4326`;
    const url = `${GGIS}/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=groundwater:GGMN_Levels_Data&outputFormat=application/json&count=${GGMN_STATION_LIMIT}&bbox=${bbox}`;
    const j = (await getJson(url, q.timeoutMs, log)) as { features?: Feature[]; numberMatched?: number };
    const feats = Array.isArray(j.features) ? j.features : [];
    const stations: GroundwaterStation[] = [];
    for (const f of feats) {
      const p = f.properties ?? {};
      const c = f.geometry?.coordinates;
      const id = num(p.id);
      if (id == null || !Array.isArray(c) || num(c[0]) == null || num(c[1]) == null) continue;
      const gse = num(p.ground_surface_elevation), gseUnit = str(p.ground_surface_elevation_unit);
      const dem = num(p.dem_elevation), demUnit = str(p.dem_elevation_unit);
      const ground = gse != null && gseUnit === "m" ? { valueM: gse, datum: "a.m.s.l.", basis: "surveyed_or_provider" as const } : dem != null && demUnit === "m" ? { valueM: dem, datum: "a.m.s.l.", basis: "dem" as const } : null;
      stations.push({
        provider: "igrac_ggmn",
        stationId: String(id),
        authorityId: str(p.original_id) ?? String(id),
        authority: str(p.organisation) ?? "GGMN data provider",
        name: str(p.name) ?? String(id),
        lon: c[0]!, lat: c[1]!,
        country: str(p.country),
        aquifer: str(p.aquifer_name),
        wellDepthM: null,
        groundElevation: ground,
        recordUrl: `${GGIS}/groundwater/record/${id}`,
        firstObservation: str(p.first_recorded_measurement),
        lastObservation: str(p.last_recorded_measurement),
        observationCount: num(p.groundwater_level_data),
        measurements: [], measurementsRequested: false, mirrors: [], retrievedAt: now(),
      });
    }
    return { stations, truncated: feats.length >= GGMN_STATION_LIMIT, log };
  },
  async getMeasurements(stations, q) {
    const log: RequestLog[] = [];
    const from = Date.parse(`${q.fromDate}T00:00:00Z`);
    await eachStation(stations, log, async (s) => {
        const j = (await getJson(`${GGIS}/groundwater/record/${encodeURIComponent(s.stationId)}/measurements/WellLevelMeasurement/data?page=1`, q.timeoutMs, log)) as { data?: { dt?: number; par?: string; u?: string; v?: number; met?: string }[] };
        s.measurementsRequested = true;
        const out: GroundwaterMeasurement[] = [];
        for (const r of j.data ?? []) {
          const t = num(r.dt);
          const k = ggmnKind(str(r.par) ?? "");
          if (t == null || !k || t * 1000 < from) continue;
          const m = normaliseMeasurement({ time: new Date(t * 1000).toISOString(), value: num(r.v), unit: str(r.u) ?? "", kind: k.kind, datum: k.datum, quality: str(r.met), parameter: str(r.par) ?? "" });
          if (m) out.push(m);
        }
        s.measurements = out.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 50);
    });
    return log;
  },
};

export const ADAPTERS: Partial<Record<ProviderId, GroundwaterAdapter>> = { usgs: usgsAdapter, hubeau: hubeauAdapter, igrac_ggmn: ggmnAdapter };

export { lengthToM };
