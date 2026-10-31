import { DATA_SOURCES } from "./registry";
import type { DataSource } from "./types";

/**
 * Compares each selected source's native grid with the size of a field. This is arithmetic on
 * documented resolutions (registry `spatialSupport`), not retrieved data: it tells the farmer
 * whether a source *could* tell their zones apart, before any value is fetched.
 */

const KM_PER_DEG_LAT = 111.32;

/** Native cell size in metres [north-south, east-west] at a latitude, or null for non-grid sources. */
type CellFn = (lat: number) => [number, number] | null;

const deg = (dLat: number, dLon: number): CellFn => (lat) => [dLat * KM_PER_DEG_LAT * 1000, dLon * KM_PER_DEG_LAT * 1000 * Math.cos((lat * Math.PI) / 180)];
const metres = (m: number): CellFn => () => [m, m];

const CELLS: Record<string, { cell: CellFn; latRange?: [number, number]; region?: "US" }> = {
  "nasa-power-daily": { cell: deg(0.5, 0.625) },
  "gpm-imerg-late-daily": { cell: deg(0.1, 0.1) },
  "smap-l3-enhanced": { cell: metres(9000) },
  "modis-mod13q1-ornl": { cell: metres(231.66) },
  "nasadem-opentopography": { cell: metres(30), latRange: [-56, 60] },
  "isric-soilgrids-v2": { cell: metres(250) },
  "usda-ssurgo-sda": { cell: () => null, region: "US" },
  "hls-v2": { cell: metres(30) },
};

export type CoverageVerdict = "single_value" | "coarse" | "may_resolve" | "polygon_survey" | "outside";

export type SourceCoverage = {
  id: string;
  name: string;
  evidenceClass: DataSource["evidenceClass"];
  status: DataSource["status"];
  spatialSupport: string;
  cellM: [number, number] | null;
  /** Native cells spanning the field's larger extent. */
  cellsAcross: number | null;
  verdict: CoverageVerdict;
  note: string;
};

export function fieldCoverage(lat: number, extentM: number, countryCode: string | null): SourceCoverage[] {
  return DATA_SOURCES.filter((s) => s.decision === "selected_initial" || s.decision === "selected_pending_access" || s.id === "hls-v2").map((s) => {
    const spec = CELLS[s.id];
    const cellM = spec?.cell(lat) ?? null;
    const base = { id: s.id, name: s.name, evidenceClass: s.evidenceClass, status: s.status, spatialSupport: s.spatialSupport, cellM };
    if (spec?.latRange && (lat < spec.latRange[0] || lat > spec.latRange[1]))
      return { ...base, cellsAcross: null, verdict: "outside", note: `Covers latitudes ${spec.latRange[0]}° to ${spec.latRange[1]}° only; this field is outside.` };
    if (spec?.region === "US") {
      if (countryCode && countryCode !== "US") return { ...base, cellsAcross: null, verdict: "outside", note: "United States soil survey; not available for this country." };
      return { ...base, cellsAcross: null, verdict: "polygon_survey", note: countryCode === "US" ? "Survey map units can split a field where mapped soils differ." : "United States only. Set the farm's country to confirm coverage." };
    }
    if (!cellM) return { ...base, cellsAcross: null, verdict: "coarse", note: "Native support is not a regular grid." };
    const cell = Math.max(cellM[0], cellM[1]);
    const cellsAcross = extentM / cell;
    if (cellsAcross < 1)
      return { ...base, cellsAcross, verdict: "single_value", note: `One ${fmt(cellM)} cell is larger than the whole field, so every zone gets the same value. It cannot tell zones apart.` };
    if (cellsAcross < 3)
      return { ...base, cellsAcross, verdict: "coarse", note: `About ${cellsAcross.toFixed(1)} cells across the field: too coarse to describe differences between zones.` };
    return { ...base, cellsAcross, verdict: "may_resolve", note: `About ${Math.round(cellsAcross)} cells across the field: fine enough to show patterns inside it, subject to quality flags.` };
  });
}

function fmt([ns, ew]: [number, number]): string {
  const f = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);
  return Math.abs(ns - ew) / Math.max(ns, ew) < 0.05 ? f(ns) : `${f(ns)} × ${f(ew)}`;
}
