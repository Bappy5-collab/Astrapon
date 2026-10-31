/**
 * Field and zone boundary validation for farmer-supplied GeoJSON (WGS84 lon/lat).
 * The database re-validates with PostGIS (ST_IsValid, containment); this module gives
 * the farmer specific, early messages and never "repairs" a geometry silently, except
 * closing a ring whose first and last points differ.
 */

import { MAX_SUPPORTED_EXTENT_M, projectField } from "./local-frame";

export type Position = [number, number];
export type PolygonCoords = Position[][];
export type BoundaryGeometry = { type: "Polygon"; coordinates: PolygonCoords } | { type: "MultiPolygon"; coordinates: PolygonCoords[] };

export const MIN_FIELD_HA = 0.01;
export const MAX_FIELD_HA = 20000;
const MAX_VERTICES = 5000;
const EARTH_RADIUS_M = 6378137;
/** Web-map and local-frame limit; no cropland exists beyond it. */
export const MAX_ABS_LATITUDE = 85;

export const ANTIMERIDIAN_MESSAGE =
  "crosses the 180° meridian. FieldShift does not support fields that straddle it yet: draw the parts on each side as separate fields.";

export type BoundaryResult =
  | { ok: true; geometry: BoundaryGeometry; areaHa: number; vertexCount: number; notes: string[] }
  | { ok: false; error: string };

export function parseBoundary(input: unknown): BoundaryResult {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, error: "Boundary is not valid JSON." };
    }
  }
  const geom = unwrap(value);
  if (typeof geom === "string") return { ok: false, error: geom };

  const notes: string[] = [];
  const polygons: PolygonCoords[] = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0) return { ok: false, error: "Boundary has no polygons." };

  let vertexCount = 0;
  const cleaned: PolygonCoords[] = [];
  for (const [pi, poly] of polygons.entries()) {
    if (!Array.isArray(poly) || poly.length === 0) return { ok: false, error: `Polygon ${pi + 1} has no rings.` };
    const rings: Position[][] = [];
    for (const [ri, ring] of poly.entries()) {
      const label = `${polygons.length > 1 ? `Polygon ${pi + 1}, ` : ""}${ri === 0 ? "outer ring" : `hole ${ri}`}`;
      if (!Array.isArray(ring)) return { ok: false, error: `${label} is not a list of positions.` };
      const pts: Position[] = [];
      for (const p of ring) {
        if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== "number" || typeof p[1] !== "number" || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
          return { ok: false, error: `${label} has a position that is not [longitude, latitude].` };
        }
        const [lon, lat] = p;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          return { ok: false, error: `${label} has a coordinate outside longitude −180…180 / latitude −90…90 (${lon}, ${lat}).` };
        }
        if (Math.abs(lat) > MAX_ABS_LATITUDE) return { ok: false, error: `${label} is beyond latitude ±${MAX_ABS_LATITUDE}°, which FieldShift does not support.` };
        const prev = pts[pts.length - 1];
        if (prev && Math.abs(lon - prev[0]) > 180) return { ok: false, error: `${label} ${ANTIMERIDIAN_MESSAGE}` };
        pts.push([lon, lat]);
      }
      const first = pts[0];
      if (first && pts.length > 1 && Math.abs(first[0] - pts[pts.length - 1]![0]) > 180) return { ok: false, error: `${label} ${ANTIMERIDIAN_MESSAGE}` };
      if (first && !samePoint(first, pts[pts.length - 1]!)) {
        pts.push([first[0], first[1]]);
        notes.push(`${label} was not closed; its first point was repeated at the end.`);
      }
      const distinct = new Set(pts.slice(0, -1).map((q) => `${q[0]},${q[1]}`)).size;
      if (pts.length < 4 || distinct < 3) return { ok: false, error: `${label} needs at least 3 distinct corners.` };
      vertexCount += pts.length - 1;
      if (vertexCount > MAX_VERTICES) return { ok: false, error: `Boundary has more than ${MAX_VERTICES} vertices; simplify it first.` };
      const crossing = findSelfIntersection(pts);
      if (crossing) return { ok: false, error: `${label} crosses itself near (${crossing[0].toFixed(6)}, ${crossing[1].toFixed(6)}).` };
      rings.push(pts);
    }
    cleaned.push(rings);
  }

  const topology = checkTopology(cleaned);
  if (topology) return { ok: false, error: topology };

  const areaM2 = cleaned.reduce((sum, rings) => sum + Math.abs(ringAreaM2(rings[0]!)) - rings.slice(1).reduce((h, r) => h + Math.abs(ringAreaM2(r)), 0), 0);
  const areaHa = areaM2 / 10000;
  if (!(areaHa >= MIN_FIELD_HA)) return { ok: false, error: `Boundary encloses ${areaHa.toFixed(4)} ha; the minimum is ${MIN_FIELD_HA} ha. Check that coordinates are [longitude, latitude].` };
  if (areaHa > MAX_FIELD_HA) return { ok: false, error: `Boundary encloses ${Math.round(areaHa)} ha; the maximum for one field is ${MAX_FIELD_HA} ha.` };

  const geometry: BoundaryGeometry = cleaned.length === 1 ? { type: "Polygon", coordinates: cleaned[0]! } : { type: "MultiPolygon", coordinates: cleaned };
  const { extentM } = projectField(geometry);
  if (extentM > MAX_SUPPORTED_EXTENT_M) return { ok: false, error: `Boundary spans ${(extentM / 1000).toFixed(1)} km; one field may span at most ${MAX_SUPPORTED_EXTENT_M / 1000} km.` };
  return { ok: true, geometry, areaHa, vertexCount, notes };
}

function unwrap(v: unknown): BoundaryGeometry | string {
  if (!v || typeof v !== "object") return "Boundary must be a GeoJSON object.";
  const o = v as { type?: unknown; geometry?: unknown; features?: unknown; coordinates?: unknown };
  if (o.type === "Feature") return unwrap(o.geometry);
  if (o.type === "FeatureCollection") {
    if (!Array.isArray(o.features) || o.features.length !== 1) return "A FeatureCollection must contain exactly one feature for a single field.";
    return unwrap(o.features[0]);
  }
  if (o.type !== "Polygon" && o.type !== "MultiPolygon") return `Boundary must be a Polygon or MultiPolygon, not ${String(o.type ?? "an unknown type")}.`;
  if (!Array.isArray(o.coordinates)) return "Boundary has no coordinates.";
  return o as BoundaryGeometry;
}

const samePoint = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** Holes must sit inside their outer ring without crossing it or each other; separate polygons must not overlap. */
function checkTopology(polygons: PolygonCoords[]): string | null {
  const name = (pi: number) => (polygons.length > 1 ? `Polygon ${pi + 1}` : "The boundary");
  for (const [pi, rings] of polygons.entries()) {
    const shell = rings[0]!;
    for (let h = 1; h < rings.length; h++) {
      const hole = rings[h]!;
      if (ringsCross(shell, hole)) return `${name(pi)}: hole ${h} crosses the outer ring.`;
      if (!pointInRing(hole[0]!, shell)) return `${name(pi)}: hole ${h} lies outside the outer ring.`;
      for (let k = h + 1; k < rings.length; k++) {
        const other = rings[k]!;
        if (ringsCross(hole, other) || pointInRing(other[0]!, hole) || pointInRing(hole[0]!, other)) return `${name(pi)}: holes ${h} and ${k} overlap.`;
      }
    }
  }
  for (let a = 0; a < polygons.length; a++)
    for (let b = a + 1; b < polygons.length; b++) {
      const sa = polygons[a]![0]!, sb = polygons[b]![0]!;
      if (ringsCross(sa, sb) || pointInRing(sb[0]!, sa) || pointInRing(sa[0]!, sb)) return `Polygons ${a + 1} and ${b + 1} overlap. Merge them or draw separate fields.`;
    }
  return null;
}

/** Even-odd point-in-ring test in lon/lat (valid because rings never cross the antimeridian). */
export function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when any edge of ring a properly intersects any edge of ring b. */
export function ringsCross(a: Position[], b: Position[]): boolean {
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < b.length - 1; j++) if (segmentIntersection(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) return true;
  return false;
}

/** Spherical polygon area (m²), signed. Accurate to well under 1% at field scale. */
export function ringAreaM2(ring: Position[]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i]!;
    const [lon2, lat2] = ring[i + 1]!;
    total += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return (total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** Returns an approximate crossing point if two non-adjacent edges of a closed ring intersect. */
export function findSelfIntersection(ring: Position[]): Position | null {
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const hit = segmentIntersection(ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!);
      if (hit) return hit;
    }
  }
  return null;
}

function segmentIntersection(p1: Position, p2: Position, p3: Position, p4: Position): Position | null {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (d === 0) {
    // Parallel: report only genuine collinear overlap.
    const cross = (p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0]);
    if (cross !== 0) return null;
    const within = (a: Position, b: Position, c: Position) =>
      Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
    for (const [a, b, c] of [[p1, p2, p3], [p1, p2, p4], [p3, p4, p1], [p3, p4, p2]] as const) if (within(a, b, c)) return c;
    return null;
  }
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}
