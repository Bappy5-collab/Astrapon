/**
 * Distance from a field boundary to a mapped water source, in metres.
 *
 * Method: every coordinate is projected into the field's local East-North-Up tangent plane
 * (src/domain/geo/local-frame.ts, WGS84 ellipsoid), and the shortest Euclidean distance between
 * the field's outline and the source geometry is measured there. Degrees are never treated as
 * metres. Within the supported search radius (≤ 25 km) the tangent-plane distance differs from the
 * ellipsoidal geodesic by well under a metre (≈ d³/2R², 0.2 m at 25 km), far below mapping error.
 *
 * The distance is boundary-to-geometry: a source that touches or crosses the field is 0 m.
 * A river centreline is measured to the centreline, not to its bank; that is reported with the
 * result so a farmer never reads a centreline distance as the distance to the water's edge.
 * Straight-line distance is not a pipe route: route length is a separate, farmer-confirmed value.
 */

import type { BoundaryGeometry, Position } from "../geo/boundary";
import { boundaryOrigin, createLocalFrame, projectGeometry, wrapLongitude, type LocalFrame, type LocalPoint, type LocalPolygon } from "../geo/local-frame";

export type SourceGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "Polygon"; coordinates: Position[][] };

export type DistanceResult = {
  distanceM: number;
  /** True when the source touches, crosses or lies inside the field (distance 0). */
  intersects: boolean;
  /** Closest point on the field outline and on the source, for drawing the straight line. */
  fieldPoint: Position;
  sourcePoint: Position;
  method: "boundary_to_geometry";
};

/** Largest search radius the planner supports (metres). */
export const MAX_SEARCH_RADIUS_M = 25_000;

export function validPosition(p: unknown): p is Position {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1] as number) <= 90 && Math.abs(p[0] as number) <= 180;
}

export function validSourceGeometry(g: SourceGeometry): boolean {
  switch (g.type) {
    case "Point":
      return validPosition(g.coordinates);
    case "LineString":
      return g.coordinates.length >= 2 && g.coordinates.every(validPosition);
    case "MultiLineString":
      return g.coordinates.length > 0 && g.coordinates.every((l) => l.length >= 2 && l.every(validPosition));
    case "Polygon":
      return g.coordinates.length > 0 && g.coordinates.every((r) => r.length >= 4 && r.every(validPosition));
  }
}

// ------------------------------------------------------------ planar maths ---

type Seg = [LocalPoint, LocalPoint];

function closestOnSegment(p: LocalPoint, [a, b]: Seg): LocalPoint {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + t * dx, a[1] + t * dy];
}

const dist = (a: LocalPoint, b: LocalPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (o: LocalPoint, a: LocalPoint, b: LocalPoint) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segmentsIntersect([p1, p2]: Seg, [q1, q2]: Seg): boolean {
  const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (a: LocalPoint, b: LocalPoint, c: LocalPoint) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  return (d1 === 0 && on(q1, q2, p1)) || (d2 === 0 && on(q1, q2, p2)) || (d3 === 0 && on(p1, p2, q1)) || (d4 === 0 && on(p1, p2, q2));
}

/** Shortest distance between two segments, with the closest pair (segments do not intersect). */
function segmentPair(s: Seg, t: Seg): { d: number; a: LocalPoint; b: LocalPoint } {
  if (segmentsIntersect(s, t)) {
    const p = closestOnSegment(t[0], s);
    return { d: 0, a: p, b: p };
  }
  const cands: { d: number; a: LocalPoint; b: LocalPoint }[] = [];
  for (const p of t) { const c = closestOnSegment(p, s); cands.push({ d: dist(c, p), a: c, b: p }); }
  for (const p of s) { const c = closestOnSegment(p, t); cands.push({ d: dist(p, c), a: p, b: c }); }
  return cands.reduce((m, c) => (c.d < m.d ? c : m));
}

function ringInside(p: LocalPoint, ring: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const insidePolygon = (p: LocalPoint, poly: LocalPolygon) => ringInside(p, poly.outer) && !poly.holes.some((h) => ringInside(p, h));

function ringSegments(ring: LocalPoint[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < ring.length; i++) out.push([ring[i]!, ring[(i + 1) % ring.length]!]);
  return out;
}

function lineSegments(line: LocalPoint[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < line.length; i++) out.push([line[i]!, line[i + 1]!]);
  return out;
}

const openRing = (ring: Position[]) => (ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.slice(0, -1) : ring);

// --------------------------------------------------------------- public API ---

export function fieldFrame(field: BoundaryGeometry): LocalFrame {
  return createLocalFrame(boundaryOrigin(field));
}

/**
 * Nearest distance from the field outline (all parts, including holes) to a source geometry.
 * Returns 0 when the source touches, crosses or lies inside the field, or the field lies inside
 * a source polygon.
 */
export function boundaryDistance(field: BoundaryGeometry, source: SourceGeometry, frame: LocalFrame = fieldFrame(field)): DistanceResult {
  if (!validSourceGeometry(source)) throw new Error("Invalid source geometry");
  const polys = projectGeometry(field, frame);
  const fieldSegs = polys.flatMap((p) => [...ringSegments(p.outer), ...p.holes.flatMap(ringSegments)]);

  let srcSegs: Seg[] = [];
  let srcPoints: LocalPoint[] = [];
  let srcPolygon: LocalPolygon | null = null;
  if (source.type === "Point") srcPoints = [frame.toLocal(source.coordinates)];
  else if (source.type === "LineString") { const l = source.coordinates.map(frame.toLocal); srcSegs = lineSegments(l); srcPoints = l; }
  else if (source.type === "MultiLineString") { const ls = source.coordinates.map((l) => l.map(frame.toLocal)); srcSegs = ls.flatMap(lineSegments); srcPoints = ls.flat(); }
  else {
    const rings = source.coordinates.map((r) => openRing(r).map(frame.toLocal));
    srcPolygon = { outer: rings[0]!, holes: rings.slice(1) };
    srcSegs = rings.flatMap(ringSegments);
    srcPoints = rings.flat();
  }

  const zero = (p: LocalPoint): DistanceResult => ({ distanceM: 0, intersects: true, fieldPoint: frame.toLonLat(p), sourcePoint: frame.toLonLat(p), method: "boundary_to_geometry" });
  // Source vertex inside the field, or a field vertex inside the source polygon.
  for (const p of srcPoints) if (polys.some((poly) => insidePolygon(p, poly))) return zero(p);
  if (srcPolygon) for (const poly of polys) for (const p of poly.outer) if (insidePolygon(p, srcPolygon)) return zero(p);

  let best = { d: Infinity, a: [0, 0] as LocalPoint, b: [0, 0] as LocalPoint };
  if (srcSegs.length === 0) {
    for (const p of srcPoints) for (const s of fieldSegs) { const c = closestOnSegment(p, s); const d = dist(c, p); if (d < best.d) best = { d, a: c, b: p }; }
  } else {
    for (const s of fieldSegs) for (const t of srcSegs) { const r = segmentPair(s, t); if (r.d < best.d) best = r; if (best.d === 0) break; }
  }
  if (best.d === 0) return zero(best.a);
  return { distanceM: best.d, intersects: false, fieldPoint: frame.toLonLat(best.a), sourcePoint: frame.toLonLat(best.b), method: "boundary_to_geometry" };
}

/** Distance from the field's bounding-box centre to a point. Only ever shown labelled as "from the field centre". */
export function centreDistance(field: BoundaryGeometry, p: Position): number {
  const frame = fieldFrame(field);
  return Math.hypot(...frame.toLocal(p));
}

/** Length of a farmer-drawn or confirmed route (metres), along its vertices in the field's local frame. */
export function routeLengthM(route: Position[], frame: LocalFrame): number {
  if (route.length < 2 || !route.every(validPosition)) throw new Error("A route needs at least two valid points");
  const pts = route.map(frame.toLocal);
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1]!, pts[i]!);
  return s;
}

/**
 * Search box (west, south, east, north) of the field outline expanded by `radiusM`, computed in the
 * local frame. Returns null if the box would cross the 180° meridian (unsupported: provider bbox
 * queries cannot express it), so the caller can show a clear unsupported-location state.
 */
export function searchBox(field: BoundaryGeometry, radiusM: number): { west: number; south: number; east: number; north: number } | null {
  if (!(radiusM > 0 && radiusM <= MAX_SEARCH_RADIUS_M)) throw new Error(`Search radius must be between 0 and ${MAX_SEARCH_RADIUS_M} m`);
  const frame = fieldFrame(field);
  const polys = projectGeometry(field, frame);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of polys) for (const [x, y] of p.outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const corners: LocalPoint[] = [
    [minX - radiusM, minY - radiusM], [maxX + radiusM, minY - radiusM], [maxX + radiusM, maxY + radiusM], [minX - radiusM, maxY + radiusM],
    [(minX + maxX) / 2, minY - radiusM], [(minX + maxX) / 2, maxY + radiusM], [minX - radiusM, (minY + maxY) / 2], [maxX + radiusM, (minY + maxY) / 2],
  ];
  const lon0 = frame.origin[0];
  const ll = corners.map(frame.toLonLat).map(([lon, lat]) => [lon0 + wrapLongitude(lon - lon0), lat] as Position);
  const west = Math.min(...ll.map((p) => p[0])), east = Math.max(...ll.map((p) => p[0]));
  const south = Math.max(-90, Math.min(...ll.map((p) => p[1]))), north = Math.min(90, Math.max(...ll.map((p) => p[1])));
  if (west < -180 || east > 180) return null;
  return { west, south, east, north };
}
