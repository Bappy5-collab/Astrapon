"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MlMap, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { BoundaryGeometry, Position } from "@/domain/geo/boundary";
import { boundaryOrigin, createLocalFrame, projectGeometry } from "@/domain/geo/local-frame";
import type { SourceGeometry } from "@/domain/water/distance";
import { OSM_ATTRIBUTION, OSM_TILES, SATELLITE_ATTRIBUTION, SATELLITE_TILES } from "@/components/map/basemaps";
import { tokens } from "@/theme/tokens";

maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

export type MapSource = { id: string; geometry: SourceGeometry; label: string };
export type MapWell = { key: string; lon: number; lat: number; label: string; tone: "recent" | "historical" | "none" };

export type WaterMapProps = {
  boundary: BoundaryGeometry;
  /** Searched distance from the field edge, metres (drawn as the searched area). */
  radiusM: number;
  sources: MapSource[];
  wells: MapWell[];
  selectedSource: string | null;
  selectedWell: string | null;
  link: { from: Position; to: Position } | null;
  basemap: "satellite" | "streets";
  onSelectSource: (id: string) => void;
  onSelectWell: (key: string) => void;
  label: string;
};

type Feat = { type: "Feature"; properties: Record<string, unknown>; geometry: SourceGeometry | { type: "Polygon"; coordinates: Position[][] } };
const fc = (features: Feat[]) => ({ type: "FeatureCollection" as const, features });
const setData = (m: MlMap, id: string, data: ReturnType<typeof fc>) => (m.getSource(id) as GeoJSONSource | undefined)?.setData(data as Parameters<GeoJSONSource["setData"]>[0]);

/** Convex hull (monotone chain) of local points. */
function hull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Outline of everything within `r` m of the field's convex hull (exact for convex fields; never smaller than the searched area). */
export function searchedArea(boundary: BoundaryGeometry, r: number): Position[] {
  const frame = createLocalFrame(boundaryOrigin(boundary));
  const pts = projectGeometry(boundary, frame).flatMap((p) => p.outer);
  const ring: [number, number][] = [];
  for (const [x, y] of pts) for (let i = 0; i < 48; i++) { const a = (i / 48) * 2 * Math.PI; ring.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
  const h = hull(ring).map((p) => frame.toLonLat(p));
  return [...h, h[0]!];
}

function style(): StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION },
      streets: { type: "raster", tiles: [OSM_TILES], tileSize: 256, maxzoom: 19, attribution: OSM_ATTRIBUTION },
      area: { type: "geojson", data: fc([]) },
      field: { type: "geojson", data: fc([]) },
      water: { type: "geojson", data: fc([]), attribution: "Water features &copy; OpenStreetMap contributors (ODbL)" },
      link: { type: "geojson", data: fc([]) },
      wells: { type: "geojson", data: fc([]) },
    },
    layers: [
      { id: "satellite", type: "raster", source: "satellite" },
      { id: "streets", type: "raster", source: "streets", layout: { visibility: "none" } },
      { id: "area-line", type: "line", source: "area", paint: { "line-color": "#FFFFFF", "line-width": 2, "line-dasharray": [2, 2] } },
      { id: "water-fill", type: "fill", source: "water", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["case", ["get", "selected"], tokens.lime[400], "#4FA3D9"], "fill-opacity": 0.45 } },
      { id: "water-line", type: "line", source: "water", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": ["case", ["get", "selected"], tokens.lime[400], "#4FA3D9"], "line-width": ["case", ["get", "selected"], 5, 3] } },
      { id: "water-point", type: "circle", source: "water", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 7, "circle-color": ["case", ["get", "selected"], tokens.lime[400], "#4FA3D9"], "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 } },
      { id: "field-fill", type: "fill", source: "field", paint: { "fill-color": tokens.lime[400], "fill-opacity": 0.2 } },
      { id: "field-line", type: "line", source: "field", paint: { "line-color": "#FFFFFF", "line-width": 3 } },
      { id: "link", type: "line", source: "link", paint: { "line-color": "#FFFFFF", "line-width": 2, "line-dasharray": [1, 1.5] } },
      { id: "wells", type: "circle", source: "wells", paint: { "circle-radius": ["case", ["get", "selected"], 9, 6], "circle-color": ["match", ["get", "tone"], "recent", tokens.forest[600], "historical", "#C08A2B", "#8D948A"], "circle-stroke-color": ["case", ["get", "selected"], tokens.lime[400], "#FFFFFF"], "circle-stroke-width": ["case", ["get", "selected"], 4, 2] } },
    ],
  };
}

export default function WaterMapGL(p: WaterMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const latest = useRef(p);
  useEffect(() => { latest.current = p; });

  useEffect(() => {
    if (!host.current) return;
    const [lon, lat] = boundaryOrigin(p.boundary);
    const m = new maplibregl.Map({ container: host.current, style: style(), center: [lon, lat], zoom: 13, attributionControl: { compact: false } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.current = m;
    m.on("load", () => {
      ready.current = true;
      sync(m, latest.current, true);
    });
    const pick = (layer: string, cb: (id: string) => void, prop: string) => {
      m.on("click", layer, (e) => { const v = e.features?.[0]?.properties?.[prop]; if (typeof v === "string") cb(v); });
      m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
    };
    for (const l of ["water-fill", "water-line", "water-point"]) pick(l, (id) => latest.current.onSelectSource(id), "id");
    pick("wells", (k) => latest.current.onSelectWell(k), "key");
    return () => { ready.current = false; m.remove(); map.current = null; };
    // The map is created once per field; later prop changes are synced below.
  }, [p.boundary]);

  const lastRadius = useRef(p.radiusM);
  useEffect(() => {
    if (!map.current || !ready.current) return;
    // A new search radius refits the view so the whole searched area stays visible.
    sync(map.current, p, lastRadius.current !== p.radiusM);
    lastRadius.current = p.radiusM;
  }, [p]);

  return <div ref={host} role="region" aria-label={p.label} style={{ position: "absolute", inset: 0 }} />;
}

function sync(m: MlMap, p: WaterMapProps, fit: boolean) {
  const area = searchedArea(p.boundary, p.radiusM);
  setData(m, "area", fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [area] } }]));
  const polys = p.boundary.type === "Polygon" ? [p.boundary.coordinates] : p.boundary.coordinates;
  setData(m, "field", fc(polys.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: c } }))));
  setData(m, "water", fc(p.sources.map((s) => ({ type: "Feature", properties: { id: s.id, selected: s.id === p.selectedSource, label: s.label }, geometry: s.geometry }))));
  setData(m, "wells", fc(p.wells.map((w) => ({ type: "Feature", properties: { key: w.key, tone: w.tone, selected: w.key === p.selectedWell, label: w.label }, geometry: { type: "Point", coordinates: [w.lon, w.lat] } }))));
  setData(m, "link", fc(p.link ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [p.link.from, p.link.to] } }] : []));
  m.setLayoutProperty("satellite", "visibility", p.basemap === "satellite" ? "visible" : "none");
  m.setLayoutProperty("streets", "visibility", p.basemap === "streets" ? "visible" : "none");
  if (fit) {
    const lons = area.map((q) => q[0]), lats = area.map((q) => q[1]);
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 24, duration: 0 });
  }
}
