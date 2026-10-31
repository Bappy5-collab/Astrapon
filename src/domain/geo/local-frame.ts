/**
 * Local metric frame for one field.
 *
 * Longitude/latitude degrees are never treated as metres. Positions are converted
 * through WGS84 Earth-centred coordinates (ECEF) into a local East-North-Up tangent
 * plane at the field's origin. At field scale (≤ 30 km across) the flattening error of
 * the tangent plane is below a few centimetres, far under GPS/digitising error.
 *
 * Longitudes are unwrapped relative to the origin, so a field next to the 180° meridian
 * still gets continuous local coordinates. Rings that actually cross the meridian are
 * rejected earlier by `parseBoundary` (see ANTIMERIDIAN_MESSAGE).
 */

import type { BoundaryGeometry, Position } from "./boundary";

const A = 6378137; // WGS84 semi-major axis (m)
const F = 1 / 298.257223563;
const E2 = F * (2 - F);

/** Largest field extent (either axis) the 3D workspace supports, in metres. */
export const MAX_SUPPORTED_EXTENT_M = 30_000;

export type LocalPoint = [east: number, north: number];
export type LocalPolygon = { outer: LocalPoint[]; holes: LocalPoint[][] };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Wraps a longitude into [-180, 180). */
export function wrapLongitude(lon: number): number {
  const w = ((((lon + 180) % 360) + 360) % 360) - 180;
  return w === -180 && lon > 0 ? 180 : w;
}

function toEcef(lon: number, lat: number): [number, number, number] {
  const φ = rad(lat);
  const λ = rad(lon);
  const n = A / Math.sqrt(1 - E2 * Math.sin(φ) ** 2);
  return [n * Math.cos(φ) * Math.cos(λ), n * Math.cos(φ) * Math.sin(λ), n * (1 - E2) * Math.sin(φ)];
}

function fromEcef(x: number, y: number, z: number): Position {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2));
  for (let i = 0; i < 6; i++) {
    const n = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
    lat = Math.atan2(z + E2 * n * Math.sin(lat), p);
  }
  return [deg(lon), deg(lat)];
}

export type LocalFrame = {
  origin: Position;
  toLocal: (p: Position) => LocalPoint;
  toLonLat: (p: LocalPoint) => Position;
};

export function createLocalFrame(origin: Position): LocalFrame {
  const [lon0, lat0] = origin;
  const φ = rad(lat0);
  const λ = rad(lon0);
  const [x0, y0, z0] = toEcef(lon0, lat0);
  const sinφ = Math.sin(φ), cosφ = Math.cos(φ), sinλ = Math.sin(λ), cosλ = Math.cos(λ);
  return {
    origin,
    toLocal([lon, lat]) {
      // Unwrap so a point at 179.99° next to an origin at -179.99° stays nearby.
      const [x, y, z] = toEcef(lon0 + wrapLongitude(lon - lon0), lat);
      const dx = x - x0, dy = y - y0, dz = z - z0;
      return [-sinλ * dx + cosλ * dy, -sinφ * cosλ * dx - sinφ * sinλ * dy + cosφ * dz];
    },
    toLonLat([e, n]) {
      // Inverse of the tangent-plane rotation, with the point placed on the ellipsoid surface (up ≈ 0).
      const dx = -sinλ * e - sinφ * cosλ * n;
      const dy = cosλ * e - sinφ * sinλ * n;
      const dz = cosφ * n;
      const [lon, lat] = fromEcef(x0 + dx, y0 + dy, z0 + dz);
      return [wrapLongitude(lon), lat];
    },
  };
}

export type ProjectedField = {
  origin: Position;
  polygons: LocalPolygon[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Larger of the east-west and north-south extents, metres. */
  extentM: number;
};

/** Centre of the longitude/latitude bounding box, with longitudes unwrapped around the first vertex. */
export function boundaryOrigin(geometry: BoundaryGeometry): Position {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const ref = polys[0]?.[0]?.[0];
  if (!ref) throw new Error("Empty geometry");
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const poly of polys)
    for (const [lon, lat] of poly[0] ?? []) {
      const u = ref[0] + wrapLongitude(lon - ref[0]);
      minLon = Math.min(minLon, u); maxLon = Math.max(maxLon, u);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
  return [wrapLongitude((minLon + maxLon) / 2), (minLat + maxLat) / 2];
}

/** Drops the closing duplicate of a GeoJSON ring. */
const open = (ring: Position[]) => (ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.slice(0, -1) : ring);

export function projectGeometry(geometry: BoundaryGeometry, frame: LocalFrame): LocalPolygon[] {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polys.map((rings) => ({
    outer: open(rings[0] ?? []).map(frame.toLocal),
    holes: rings.slice(1).map((r) => open(r).map(frame.toLocal)),
  }));
}

export function projectField(geometry: BoundaryGeometry): ProjectedField {
  const origin = boundaryOrigin(geometry);
  const frame = createLocalFrame(origin);
  const polygons = projectGeometry(geometry, frame);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of polygons)
    for (const [x, y] of p.outer) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  return { origin, polygons, bounds: { minX, maxX, minY, maxY }, extentM: Math.max(maxX - minX, maxY - minY) };
}

/** Shoelace area of a local ring (m²), unsigned. */
export function localRingArea(ring: LocalPoint[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function localPolygonArea(p: LocalPolygon): number {
  return localRingArea(p.outer) - p.holes.reduce((h, r) => h + localRingArea(r), 0);
}

/**
 * Bearing (degrees from local north, clockwise) of the longest edge of the outer ring.
 * Used only to orient illustrative crop rows along the field's main axis.
 */
export function dominantEdgeBearing(polygon: LocalPolygon): number {
  let best = 0, bearing = 0;
  const r = polygon.outer;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i]!;
    const [x2, y2] = r[(i + 1) % r.length]!;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > best) {
      best = len;
      bearing = (deg(Math.atan2(x2 - x1, y2 - y1)) + 360) % 180;
    }
  }
  return bearing;
}

export function pointInLocalRing([x, y]: LocalPoint, ring: LocalPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInLocalPolygon(p: LocalPoint, poly: LocalPolygon): boolean {
  return pointInLocalRing(p, poly.outer) && !poly.holes.some((h) => pointInLocalRing(p, h));
}
