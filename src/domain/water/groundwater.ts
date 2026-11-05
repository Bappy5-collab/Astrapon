/**
 * Normalised groundwater records from many providers, and the rules that keep them truthful.
 *
 *  - The original value and unit are kept beside the normalised metres. Feet become metres only
 *    through an explicit unit (FT_TO_M); an unknown unit gives no normalised value.
 *  - Depth below ground, depth below a measuring point, and water-level elevation are different
 *    quantities. Elevation becomes depth only with a ground elevation on the same datum, and the
 *    derivation is recorded. Negative depth (artesian) stays negative.
 *  - Borehole / constructed depth is station metadata. It is never a water level or a pumping lift.
 *  - "Latest" is the latest observation returned within the stated query scope.
 *  - A nearby well is context for the field, never a measurement at the field.
 */

import { lengthToM, parseLengthUnit } from "./units";

export type ProviderId = "usgs" | "hubeau" | "igrac_ggmn" | "bwdb" | "bom";

export type MeasurementKind =
  /** Depth to water below land surface (m; negative = above ground). */
  | "depth_below_ground"
  /** Depth below a measuring/reference point that is not stated to be the land surface. */
  | "depth_below_reference"
  /** Water-level elevation above a vertical datum (m). */
  | "level_elevation";

export type LevelState = "static" | "pumping" | "unknown";

export type GroundwaterMeasurement = {
  /** ISO timestamp as given by the provider (date-only values stay date-only). */
  time: string;
  kind: MeasurementKind;
  originalValue: number;
  originalUnit: string;
  /** Normalised to metres; null when the unit is not explicitly metres or feet. */
  valueM: number | null;
  /** Vertical datum for elevations (e.g. "NGF", "a.m.s.l."), or the reference point for depths. */
  datum: string | null;
  levelState: LevelState;
  /** Provider quality or approval flags, verbatim. */
  quality: string | null;
  parameter: string;
};

export type GroundElevation = { valueM: number; datum: string; basis: "surveyed_or_provider" | "dem" };

export type GroundwaterStation = {
  provider: ProviderId;
  /** Unique within the provider. */
  stationId: string;
  /** The data owner's own identifier (e.g. French BSS code), used for de-duplication of mirrors. */
  authorityId: string;
  /** The organisation that measured the data (not the portal that serves it). */
  authority: string;
  name: string;
  lon: number;
  lat: number;
  country: string | null;
  aquifer: string | null;
  /** Constructed well / investigation depth (m). Metadata only: not a water level, not a lift. */
  wellDepthM: number | null;
  groundElevation: GroundElevation | null;
  recordUrl: string | null;
  /** Provider-reported observation span, when given. */
  firstObservation: string | null;
  lastObservation: string | null;
  observationCount: number | null;
  /** Measurements retrieved for this station, newest first (may be empty = metadata only). */
  measurements: GroundwaterMeasurement[];
  /** Whether measurements were requested for this station (only the nearest few are). */
  measurementsRequested: boolean;
  /** Other portals that mirror this same authority record (e.g. GGMN). */
  mirrors: { provider: ProviderId; stationId: string; recordUrl: string | null }[];
  retrievedAt: string;
};

/** Converts a raw provider value to a normalised measurement; returns null for non-finite values. */
export function normaliseMeasurement(raw: { time: string; value: number | null; unit: string; kind: MeasurementKind; datum: string | null; levelState?: LevelState; quality?: string | null; parameter: string }): GroundwaterMeasurement | null {
  if (raw.value == null || !Number.isFinite(raw.value)) return null;
  const unit = parseLengthUnit(raw.unit);
  return {
    time: raw.time,
    kind: raw.kind,
    originalValue: raw.value,
    originalUnit: raw.unit,
    valueM: unit ? lengthToM(raw.value, unit) : null,
    datum: raw.datum,
    levelState: raw.levelState ?? "unknown",
    quality: raw.quality ?? null,
    parameter: raw.parameter,
  };
}

export type DepthBelowGround = { depthM: number; derived: false } | { depthM: number; derived: true; method: string } | null;

/**
 * Depth below land surface for one measurement, or null when it cannot be stated truthfully.
 * - depth_below_ground: as measured (negative kept).
 * - level_elevation: ground elevation − level, only when the station's ground elevation is on the
 *   same datum. A DEM ground elevation is allowed but labelled approximate.
 * - depth_below_reference: null (the measuring point's height above ground is not known).
 */
export function depthBelowGround(m: GroundwaterMeasurement, station: Pick<GroundwaterStation, "groundElevation">): DepthBelowGround {
  if (m.valueM == null) return null;
  if (m.kind === "depth_below_ground") return { depthM: m.valueM, derived: false };
  if (m.kind === "level_elevation" && station.groundElevation && m.datum && sameDatum(m.datum, station.groundElevation.datum)) {
    const g = station.groundElevation;
    return {
      depthM: g.valueM - m.valueM,
      derived: true,
      method: g.basis === "dem" ? `ground elevation from a terrain model (${g.valueM.toFixed(2)} m, approximate) minus water-level elevation` : `station ground elevation (${g.valueM.toFixed(2)} m ${g.datum}) minus water-level elevation`,
    };
  }
  return null;
}

/** Datums are compared by normalised name only; unknown or different names are incompatible. */
export function sameDatum(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return n(a).length > 0 && n(a) === n(b);
}

export type StationRecency = "recent" | "historical" | "metadata_only" | "not_requested";

/** Recent = latest returned observation within `recentYears` of `asOf`. */
export function stationRecency(s: GroundwaterStation, asOf: Date, recentYears = 3): StationRecency {
  if (!s.measurementsRequested) return "not_requested";
  const latest = s.measurements[0];
  if (!latest) return "metadata_only";
  const ageYears = (asOf.getTime() - Date.parse(latest.time)) / (365.25 * 86_400_000);
  return ageYears <= recentYears ? "recent" : "historical";
}

export type RankedStation = GroundwaterStation & { distanceM: number; recency: StationRecency; reasons: string[] };

/**
 * Orders stations for display: those with returned water-level observations first, recent before
 * historical, then by distance. Reasons are stated in words; no confidence percentage is invented.
 */
export function rankStations(stations: (GroundwaterStation & { distanceM: number })[], asOf: Date): RankedStation[] {
  const order: Record<StationRecency, number> = { recent: 0, historical: 1, not_requested: 2, metadata_only: 3 };
  return stations
    .map((s) => {
      const recency = stationRecency(s, asOf);
      const reasons: string[] = [`${(s.distanceM / 1000).toFixed(1)} km from the field edge`];
      if (recency === "recent") reasons.push(`latest observation ${s.measurements[0]!.time.slice(0, 10)}`);
      else if (recency === "historical") reasons.push(`only older observations (latest ${s.measurements[0]!.time.slice(0, 10)})`);
      else if (recency === "metadata_only") reasons.push("no water-level observations returned");
      else reasons.push("observations not requested (farther than the nearest stations)");
      if (s.aquifer) reasons.push(`aquifer: ${s.aquifer}`);
      else reasons.push("aquifer not stated");
      return { ...s, recency, reasons };
    })
    .sort((a, b) => order[a.recency] - order[b.recency] || a.distanceM - b.distanceM);
}

/**
 * Removes records that are the same authority station served by several portals. The match is
 * on the authority's own identifier and organisation, never on proximity: two different wells a
 * few metres apart stay separate. The direct-authority record is kept; mirrors are listed on it.
 */
export function dedupeStations<T extends GroundwaterStation>(stations: T[], preferred: ProviderId[]): T[] {
  const rank = (p: ProviderId) => { const i = preferred.indexOf(p); return i < 0 ? preferred.length : i; };
  const key = (s: GroundwaterStation) => `${authorityKey(s.authority)}|${s.authorityId.trim().toUpperCase()}`;
  const groups = new Map<string, T[]>();
  for (const s of stations) groups.set(key(s), [...(groups.get(key(s)) ?? []), s]);
  const out: T[] = [];
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => rank(a.provider) - rank(b.provider));
    const [keep, ...rest] = sorted;
    out.push({ ...keep!, mirrors: [...keep!.mirrors, ...rest.map((r) => ({ provider: r.provider, stationId: r.stationId, recordUrl: r.recordUrl }))] });
  }
  return out;
}

/** Normalises organisation names so that "BRGM" served by Hub'Eau and by GGMN compare equal. */
export function authorityKey(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("brgm") || n.includes("french geological survey")) return "fr-brgm-ades";
  if (n.includes("bureau of meteorology")) return "au-bom";
  if (n.includes("u.s. geological survey") || n === "usgs") return "us-usgs";
  return n.replace(/[^a-z0-9]/g, "");
}

/** Outcome of one provider for one search, reported separately so partial results survive. */
export type ProviderOutcome =
  | "records_available"
  | "historical_only"
  | "metadata_only"
  | "no_stations"
  | "not_covered"
  | "not_integrated"
  | "credential_required"
  | "access_restricted"
  | "error";

export const OUTCOME_TEXT: Record<ProviderOutcome, string> = {
  records_available: "Recent water-level records found",
  historical_only: "Only older water-level records found",
  metadata_only: "Wells found, but no water-level observations returned",
  no_stations: "No monitoring wells in the searched area",
  not_covered: "Outside this provider's coverage",
  not_integrated: "Not integrated yet",
  credential_required: "Needs an access key",
  access_restricted: "Data available only on request",
  error: "Provider did not answer (temporary error, not “no groundwater”)",
};

export function outcomeFor(stations: GroundwaterStation[], asOf: Date): ProviderOutcome {
  if (!stations.length) return "no_stations";
  const rec = stations.map((s) => stationRecency(s, asOf));
  if (rec.includes("recent")) return "records_available";
  if (rec.includes("historical")) return "historical_only";
  return "metadata_only";
}
