/**
 * Base map sources, terms checked 2026-10-31 (see docs/design-system.md → Map terms):
 *  - OpenStreetMap standard tiles: tile usage policy (https://operations.osmfoundation.org/policies/tiles/):
 *    visible attribution, HTTPS only, browser Referer kept, no prefetch/offline/bulk use, best effort.
 *  - Esri World Imagery: seamless satellite and aerial mosaic used as the default "Satellite" base
 *    (chosen by the owner 2026-11-05). Attribution required; Esri's terms of use apply (production
 *    use may need an ArcGIS account). Display only: never used as evidence.
 *  - NASA GIBS HLS (Harmonized Landsat Sentinel-2) 30 m reflectance, true colour: public WMTS,
 *    no key; acknowledgement requested. Tiles exist only where a satellite passed on that date;
 *    empty areas are transparent, so the seamless satellite base shows through instead of a gap.
 * URLs are configuration, so a source can be switched off or replaced without code changes.
 */

export const OSM_TILES = process.env.NEXT_PUBLIC_OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export const SATELLITE_TILES = process.env.NEXT_PUBLIC_SATELLITE_TILE_URL || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SATELLITE_ATTRIBUTION = 'Imagery &copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community';

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
export const HLS_LAYERS = ["HLS_L30_Nadir_BRDF_Adjusted_Reflectance", "HLS_S30_Nadir_BRDF_Adjusted_Reflectance"] as const;
export const HLS_MAX_NATIVE_ZOOM = 12;
export const hlsTileUrl = (layer: string, date: string) => `${GIBS}/${layer}/default/${date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png`;
export const HLS_ATTRIBUTION = (date: string) =>
  `Imagery ${date}: <a href="https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" target="_blank" rel="noreferrer">NASA GIBS</a> · HLS (Landsat 8/9, Sentinel-2), 30 m`;

/** Most recent date GIBS is likely to have processed (HLS latency is a few days). */
export function defaultImageryDate(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 5));
  return d.toISOString().slice(0, 10);
}

/** Web-mercator tile indices for a point. */
export function tileFor(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) };
}

/**
 * Looks back day by day (up to `days`) for a date whose HLS tile over the point has content.
 * An empty GIBS tile is a tiny transparent PNG; a tile with imagery is several kilobytes.
 * One small request per probed day, made only when the user presses the button.
 */
export async function findImageryDate(lat: number, lon: number, from: string, days = 30, signal?: AbortSignal): Promise<string | null> {
  const { x, y } = tileFor(lat, lon, 11);
  const start = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    for (const layer of HLS_LAYERS) {
      try {
        const res = await fetch(hlsTileUrl(layer, d).replace("{z}", "11").replace("{y}", String(y)).replace("{x}", String(x)), { signal });
        const blob = await res.blob();
        if (res.ok && blob.size > 4000) return d;
      } catch (e) {
        if ((e as Error).name === "AbortError") return null;
      }
    }
  }
  return null;
}
