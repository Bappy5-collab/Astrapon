/**
 * Builds public/data/globe-land-dots.json for the home-page globe.
 *
 * Input: Natural Earth 1:110m land polygons (public domain, "Made with Natural Earth"),
 *   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson
 * Usage: node scripts/build-globe-dots.mjs <path/to/ne_110m_land.geojson>
 *
 * Points are an even Fibonacci-sphere sample; a point is kept when it falls inside a land polygon
 * (outer ring minus holes). Output: flat [lat, lon, lat, lon, …] rounded to 0.01°. Decorative only:
 * the globe is an illustration, not a map product.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-globe-dots.mjs <ne_110m_land.geojson>");
  process.exit(2);
}
const gj = JSON.parse(readFileSync(src, "utf8"));
const polys = [];
for (const f of gj.features) {
  const g = f.geometry;
  if (g.type === "Polygon") polys.push(g.coordinates);
  else if (g.type === "MultiPolygon") polys.push(...g.coordinates);
}
const boxes = polys.map((p) => {
  let w = 180, e = -180, s = 90, n = -90;
  for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { w, e, s, n };
});
const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const onLand = (lon, lat) => polys.some((p, i) => {
  const b = boxes[i];
  return lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n && inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h));
});

const N = Number(process.argv[3] ?? 42000);
const golden = Math.PI * (3 - Math.sqrt(5));
const out = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = ((((i * golden * 180) / Math.PI) % 360) + 540) % 360 - 180;
  if (lat < -60) continue; // Antarctica would dominate the lower globe; omitted for the illustration
  if (onLand(lon, lat)) out.push(Math.round(lat * 100) / 100, Math.round(lon * 100) / 100);
}
const dir = path.join(import.meta.dirname, "..", "public", "data");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "globe-land-dots.json"), JSON.stringify({ source: "Made with Natural Earth (public domain), 1:110m land; Fibonacci sample; decorative illustration", count: out.length / 2, latLon: out }));
console.log(`${out.length / 2} land dots`);
