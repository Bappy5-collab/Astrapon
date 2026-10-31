/**
 * Native footprints of gridded sources, so maps can show what a value actually covers.
 * Footprints are drawn as provided by the source grid; nothing is resampled to look finer.
 */
import { pointInRing, type BoundaryGeometry, type Position } from "@/domain/geo/boundary";

export type Footprint = { ring: Position[]; label: string };

/**
 * NASA POWER meteorology grid (MERRA-2 native ½° lat × ⅝° lon). Cells are centred on grid
 * nodes at multiples of 0.5° latitude and 0.625° longitude. The cell index is also the cache
 * location key, so every field in one cell shares one retrieval.
 */
export const POWER_GRID = { dLat: 0.5, dLon: 0.625 } as const;

export function powerCell(lat: number, lon: number) {
  const iLat = Math.round(lat / POWER_GRID.dLat);
  const iLon = Math.round(lon / POWER_GRID.dLon);
  const cLat = iLat * POWER_GRID.dLat;
  const cLon = iLon * POWER_GRID.dLon;
  const s = cLat - POWER_GRID.dLat / 2, n = cLat + POWER_GRID.dLat / 2, w = cLon - POWER_GRID.dLon / 2, e = cLon + POWER_GRID.dLon / 2;
  return {
    key: `power:${iLat}:${iLon}`,
    centre: { lat: cLat, lon: cLon },
    footprint: { ring: [[w, s], [e, s], [e, n], [w, n], [w, s]] as Position[], label: "NASA POWER grid cell (½° × ⅝°)" },
  };
}

/** MODIS sinusoidal projection sphere radius (m), as used by the MODIS land grid. */
export const MODIS_R = 6371007.181;

export function sinusoidalToLonLat(x: number, y: number): Position {
  const lat = y / MODIS_R;
  const lon = x / (MODIS_R * Math.cos(lat));
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

export function lonLatToSinusoidal([lon, lat]: Position): [number, number] {
  const φ = (lat * Math.PI) / 180;
  return [MODIS_R * ((lon * Math.PI) / 180) * Math.cos(φ), MODIS_R * φ];
}

export type PixelGrid = { xll: number; yll: number; cellsize: number; nrows: number; ncols: number };

/**
 * Footprint of pixel (row, col) of an ORNL subset grid. ORNL lists values row by row from the
 * upper-left (north-west) pixel, so row 0 is the northernmost row.
 */
export function pixelFootprint(g: PixelGrid, row: number, col: number): Position[] {
  const x0 = g.xll + col * g.cellsize;
  const yTop = g.yll + (g.nrows - row) * g.cellsize;
  const x1 = x0 + g.cellsize;
  const y1 = yTop - g.cellsize;
  return [sinusoidalToLonLat(x0, y1), sinusoidalToLonLat(x1, y1), sinusoidalToLonLat(x1, yTop), sinusoidalToLonLat(x0, yTop), sinusoidalToLonLat(x0, y1)];
}

/**
 * Share of a pixel inside the field, sampled on a 6×6 grid laid out between the pixel's four
 * corners. Sinusoidal pixels are sheared parallelograms in longitude/latitude away from the
 * central meridian, so sampling the lon/lat bounding box would be wrong.
 */
export function fractionInside(ring: Position[], field: BoundaryGeometry): number {
  const polys = field.type === "Polygon" ? [field.coordinates] : field.coordinates;
  const [a, b, c, d] = ring as [Position, Position, Position, Position];
  let inside = 0;
  const N = 6;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const u = (i + 0.5) / N, v = (j + 0.5) / N;
      const p: Position = [
        (1 - u) * (1 - v) * a[0] + u * (1 - v) * b[0] + u * v * c[0] + (1 - u) * v * d[0],
        (1 - u) * (1 - v) * a[1] + u * (1 - v) * b[1] + u * v * c[1] + (1 - u) * v * d[1],
      ];
      if (polys.some((poly) => pointInRing(p, poly[0]!) && !poly.slice(1).some((h) => pointInRing(p, h)))) inside++;
    }
  return inside / (N * N);
}

/** A pixel counts as "in the field" when at least this share of it lies inside the boundary. */
export const PIXEL_INSIDE_MIN = 0.75;
/** Within-field variation is shown only when at least this many pixels are mostly inside the field. */
export const MIN_PIXELS_FOR_WITHIN_FIELD = 2;
/** Per-pixel results are stored for fields up to this many candidate pixels. */
export const MAX_PIXELS = 81;

export function pixelId(row: number, col: number) {
  return `r${row}c${col}`;
}
