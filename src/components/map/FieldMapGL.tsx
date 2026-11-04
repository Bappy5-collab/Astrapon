"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatLike, Map as MlMap, MapGeoJSONFeature, MapMouseEvent, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { BoundaryGeometry, Position } from "@/domain/geo/boundary";
import type { DrawState } from "@/domain/geo/drawing";
import { createLocalFrame } from "@/domain/geo/local-frame";
import { useReducedMotion } from "@/lib/preferences";
import { tokens } from "@/theme/tokens";

import { HLS_ATTRIBUTION, HLS_LAYERS, HLS_MAX_NATIVE_ZOOM, hlsTileUrl, OSM_ATTRIBUTION, OSM_TILES, SATELLITE_ATTRIBUTION, SATELLITE_TILES } from "./basemaps";

export type MapShape = { key: string; geometry: BoundaryGeometry; kind: "field" | "zone"; selected?: boolean; label?: string };
export type MapFocus = { lat: number; lon: number; zoom?: number; bbox?: [number, number, number, number] | null; nonce: number };
/** "satellite": seamless Esri imagery (default). "streets": OpenStreetMap. "imagery": dated NASA HLS over the satellite base. */
export type Basemap = "satellite" | "streets" | "imagery";
/** Native data footprints (observed/model grids), drawn beneath the field and zones in a distinct style. */
export type MapOverlay = { ring: Position[]; kind: "power_cell" | "modis_pixel"; fill?: string | null; label: string };

export type FieldMapProps = {
  shapes: MapShape[];
  draw: DrawState | null;
  onAddVertex?: (p: Position) => void;
  onMoveVertex?: (ring: number, index: number, p: Position) => void;
  onInsertVertex?: (ring: number, index: number, p: Position) => void;
  onSelectVertex?: (ring: number, index: number) => void;
  onCloseRing?: () => void;
  onSelectShape?: (key: string) => void;
  onCenter?: (p: Position) => void;
  focus: MapFocus | null;
  /** Fit to these shapes once when the map first loads (and when the key changes). */
  fitKey?: string;
  basemap: Basemap;
  imageryDate: string;
  located?: { lat: number; lon: number; accuracyM: number } | null;
  label: string;
  overlays?: MapOverlay[];
};

// The bundler cannot resolve MapLibre's own worker lookup; the file is copied by scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

type Geom = { type: "Polygon"; coordinates: Position[][] } | { type: "LineString"; coordinates: Position[] } | { type: "Point"; coordinates: Position };
type Feat = { type: "Feature"; properties: Record<string, unknown>; geometry: Geom };
type FC = { type: "FeatureCollection"; features: Feat[] };
const EMPTY: FC = { type: "FeatureCollection", features: [] };
const ringsOf = (g: BoundaryGeometry) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

/** Below this zoom a tap would place a corner kilometres wide, so drawing waits until the farmer zooms in. */
export const MIN_DRAW_ZOOM = 13;

/** The opening view: the whole Earth as a globe. */
const START = { center: [80, 18] as [number, number], zoom: 1.35 };

function baseStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    sky: {
      "sky-color": "#0A1D16",
      "horizon-color": "#9FC7E8",
      "fog-color": "#DCE4DF",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.6,
      "fog-ground-blend": 0.9,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.6, 9, 0],
    },
    sources: {
      satellite: { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION },
      streets: { type: "raster", tiles: [OSM_TILES], tileSize: 256, maxzoom: 19, attribution: OSM_ATTRIBUTION },
      ...Object.fromEntries(HLS_LAYERS.map((l) => [l, { type: "raster" as const, tiles: [hlsTileUrl(l, "2024-01-01")], tileSize: 256, maxzoom: HLS_MAX_NATIVE_ZOOM, attribution: HLS_CREDIT }])),
      overlays: { type: "geojson", data: EMPTY },
      shapes: { type: "geojson", data: EMPTY },
      located: { type: "geojson", data: EMPTY },
      draw: { type: "geojson", data: EMPTY },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0A1D16" } },
      { id: "satellite", type: "raster", source: "satellite", paint: { "raster-fade-duration": 200 } },
      { id: "streets", type: "raster", source: "streets", layout: { visibility: "none" } },
      ...HLS_LAYERS.map((l) => ({ id: l, type: "raster" as const, source: l, layout: { visibility: "none" as const } })),
      { id: "overlay-fill", type: "fill", source: "overlays", paint: { "fill-color": ["coalesce", ["get", "fill"], "#1F7FB0"], "fill-opacity": ["case", ["has", "fill"], 0.55, ["==", ["get", "kind"], "power_cell"], 0.06, 0] } },
      { id: "overlay-line", type: "line", source: "overlays", paint: { "line-color": ["case", ["==", ["get", "kind"], "power_cell"], "#7CC4F0", "#E8F1F8"], "line-width": ["case", ["==", ["get", "kind"], "power_cell"], 2.5, 1], "line-dasharray": [3, 2] } },
      { id: "shape-fill", type: "fill", source: "shapes", paint: { "fill-color": ["case", ["==", ["get", "kind"], "field"], tokens.lime[400], tokens.forest[500]], "fill-opacity": ["case", ["==", ["get", "kind"], "field"], 0.16, ["get", "selected"], 0.38, 0.22] } },
      { id: "shape-halo", type: "line", source: "shapes", filter: ["==", ["get", "kind"], "field"], paint: { "line-color": "#FFFFFF", "line-width": ["case", ["get", "selected"], 8, 7], "line-opacity": 0.9 } },
      { id: "shape-line", type: "line", source: "shapes", paint: { "line-color": ["case", ["get", "selected"], tokens.lime[400], ["==", ["get", "kind"], "field"], tokens.forest[800], tokens.forest[900]], "line-width": ["case", ["get", "selected"], 4, ["==", ["get", "kind"], "field"], 3, 2] } },
      { id: "zone-dash", type: "line", source: "shapes", filter: ["==", ["get", "kind"], "zone"], paint: { "line-color": "#FFFFFF", "line-width": 1, "line-dasharray": [3, 3] } },
      { id: "located-fill", type: "fill", source: "located", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": tokens.lime[400], "fill-opacity": 0.12 } },
      { id: "located-line", type: "line", source: "located", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": tokens.lime[400], "line-width": 1.5 } },
      { id: "located-dot", type: "circle", source: "located", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 7, "circle-color": tokens.forest[600], "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2.5 } },
      { id: "draw-fill", type: "fill", source: "draw", filter: ["all", ["==", ["geometry-type"], "Polygon"], ["==", ["get", "outer"], true]], paint: { "fill-color": tokens.lime[400], "fill-opacity": 0.22 } },
      { id: "draw-halo", type: "line", source: "draw", paint: { "line-color": tokens.forest[950], "line-width": 5, "line-opacity": 0.5 } },
      { id: "draw-line", type: "line", source: "draw", paint: { "line-color": tokens.lime[400], "line-width": 3, "line-dasharray": ["case", ["==", ["geometry-type"], "LineString"], ["literal", [2, 1.5]], ["literal", [1, 0]]] } },
    ],
  };
}

function vertexEl(kind: "vertex" | "first" | "selected" | "mid", title: string) {
  const size = kind === "mid" ? 12 : 16;
  const bg = kind === "selected" ? tokens.lime[400] : kind === "mid" ? "rgba(255,255,255,0.85)" : tokens.neutral[0];
  const border = kind === "first" ? tokens.clay : tokens.forest[800];
  // The visible dot sits inside a 36px transparent hit area for touch.
  const el = document.createElement("div");
  el.className = "fs-vertex";
  el.title = title;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", title);
  el.tabIndex = 0;
  el.style.cssText = "width:36px;height:36px;display:grid;place-items:center;cursor:grab";
  el.innerHTML = `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:${kind === "mid" ? 1.5 : 2.5}px solid ${border};box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>`;
  return el;
}

/** A ring of points approximating a circle, built in the field's local metric frame (never degrees as metres). */
function circleRing(lon: number, lat: number, radiusM: number, steps = 64): Position[] {
  const f = createLocalFrame([lon, lat]);
  const out: Position[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push(f.toLonLat([Math.cos(a) * radiusM, Math.sin(a) * radiusM]));
  }
  return out;
}

/** The date is shown beside the imagery controls; MapLibre credits a source only while its layer is visible. */
const HLS_CREDIT = HLS_ATTRIBUTION("dated").replace(/^Imagery dated: /, "Imagery: ");

const setData = (m: MlMap, id: string, data: FC) => (m.getSource(id) as GeoJSONSource | undefined)?.setData(data as Parameters<GeoJSONSource["setData"]>[0]);

/**
 * MapLibre map: a 3D globe at low zoom that flattens as you zoom in, a seamless satellite base,
 * optional dated NASA HLS imagery on top, field and zone outlines, data footprints, and the
 * drawing handles. Searched places are reached with a fly-to animation (a jump with reduced motion).
 */
export default function FieldMapGL(props: FieldMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [far, setFar] = useState(true);
  const markers = useRef<maplibregl.Marker[]>([]);
  const suppressClick = useRef(0);
  const spinning = useRef(true);
  const latest = useRef(props);
  // Device setting or Settings → "Always reduce motion": no spinning globe, no flights.
  const reduced = useReducedMotion();
  const still = useRef(reduced);
  useEffect(() => {
    latest.current = props;
    still.current = reduced;
  });
  const reducedMotion = () => still.current;

  // Create the map once.
  useEffect(() => {
    if (!host.current || map.current) return;
    const m = new maplibregl.Map({
      container: host.current,
      style: baseStyle(),
      center: START.center,
      zoom: START.zoom,
      maxZoom: 19.5,
      attributionControl: { compact: true },
      dragRotate: true,
      pitchWithRotate: false,
      renderWorldCopies: false,
      fadeDuration: 150,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: true }), "top-left");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.current = m;

    // A slowly turning Earth until the person interacts or a place is chosen.
    let raf = 0;
    let last = performance.now();
    const spin = (now: number) => {
      const dt = now - last;
      last = now;
      if (spinning.current && !reducedMotion() && m.getZoom() < 3 && !m.isMoving()) {
        const c = m.getCenter();
        m.jumpTo({ center: [c.lng - (dt / 1000) * 4, c.lat] });
      }
      raf = requestAnimationFrame(spin);
    };
    const stopSpin = () => {
      spinning.current = false;
    };
    for (const ev of ["mousedown", "touchstart", "wheel", "keydown"] as const) m.getCanvasContainer().addEventListener(ev, stopSpin, { passive: true });

    m.on("load", () => {
      ready.current = true;
      raf = requestAnimationFrame(spin);
      // The effects below re-run now and apply everything that arrived before the style was ready.
      setLoaded(true);
    });
    m.on("click", (e: MapMouseEvent) => {
      if (Date.now() - suppressClick.current < 400) return;
      const p = latest.current;
      if (p.onSelectShape && !p.draw) {
        const hit = m.queryRenderedFeatures(e.point, { layers: ["shape-fill"] });
        // Zones are drawn after the field, so prefer the topmost zone.
        const zone = hit.find((f: MapGeoJSONFeature) => f.properties?.kind === "zone") ?? hit[0];
        if (zone) {
          p.onSelectShape(String(zone.properties!.key));
          return;
        }
      }
      if (!p.onAddVertex) return;
      if (m.getZoom() < MIN_DRAW_ZOOM) {
        // Too far out to place a corner: zoom towards the tap instead.
        m.easeTo({ center: e.lngLat, zoom: Math.min(MIN_DRAW_ZOOM + 2, m.getZoom() + 3), duration: reducedMotion() ? 0 : 900 });
        return;
      }
      p.onAddVertex([e.lngLat.lng, e.lngLat.lat]);
    });
    m.on("zoomend", () => setFar(m.getZoom() < MIN_DRAW_ZOOM));
    // Dated NASA tiles are often missing (no satellite pass, or GIBS answers 500); the satellite base
    // shows through, so those errors are expected and not logged.
    m.on("error", (e: { error?: { message?: string }; sourceId?: string }) => {
      if (e.sourceId && (HLS_LAYERS as readonly string[]).includes(e.sourceId)) return;
      if (/gibs.earthdata.nasa.gov/.test(e.error?.message ?? "")) return;
      console.warn("Map:", e.error?.message ?? e);
    });
    m.on("moveend", () => {
      const c = m.getCenter();
      latest.current.onCenter?.([c.lng, c.lat]);
    });

    // Hover labels for shapes and data footprints.
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "fs-tip", offset: 12, maxWidth: "280px" });
    const hover = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const label = e.features?.find((f) => f.properties?.label)?.properties?.label as string | undefined;
      if (!label || latest.current.draw) return popup.remove();
      popup.setLngLat(e.lngLat).setText(label).addTo(m);
    };
    m.on("mousemove", "shape-fill", hover);
    m.on("mousemove", "overlay-fill", hover);
    m.on("mouseleave", "shape-fill", () => popup.remove());
    m.on("mouseleave", "overlay-fill", () => popup.remove());
    m.on("mouseenter", "shape-fill", () => {
      if (latest.current.onSelectShape && !latest.current.draw) m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", "shape-fill", () => {
      m.getCanvas().style.cursor = latest.current.draw && latest.current.draw.active >= 0 ? "crosshair" : "";
    });

    const ro = new ResizeObserver(() => m.resize());
    ro.observe(host.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      markers.current.forEach((k) => k.remove());
      markers.current = [];
      m.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  // ---------------------------------------------------------------- appliers ---

  const applyBasemap = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const { basemap, imageryDate } = latest.current;
    m.setLayoutProperty("satellite", "visibility", basemap === "streets" ? "none" : "visible");
    m.setLayoutProperty("streets", "visibility", basemap === "streets" ? "visible" : "none");
    for (const l of HLS_LAYERS) {
      const src = m.getSource(l) as maplibregl.RasterTileSource | undefined;
      if (basemap === "imagery") src?.setTiles([hlsTileUrl(l, imageryDate)]);
      m.setLayoutProperty(l, "visibility", basemap === "imagery" ? "visible" : "none");
    }
  };

  const applyShapes = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const { shapes } = latest.current;
    // Fields first, zones after, so zones draw on top.
    const sorted = [...shapes].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "field" ? -1 : 1));
    setData(m, "shapes", {
      type: "FeatureCollection",
      features: sorted.flatMap((s) => ringsOf(s.geometry).map((poly) => ({ type: "Feature" as const, properties: { key: s.key, kind: s.kind, selected: Boolean(s.selected), label: s.label ?? "" }, geometry: { type: "Polygon" as const, coordinates: poly } }))),
    });
  };

  const applyOverlays = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    setData(m, "overlays", {
      type: "FeatureCollection",
      features: (latest.current.overlays ?? []).map((o) => ({ type: "Feature" as const, properties: { kind: o.kind, label: o.label, ...(o.fill ? { fill: o.fill } : {}) }, geometry: { type: "Polygon" as const, coordinates: [o.ring] } })),
    });
  };

  const applyLocated = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const p = latest.current.located;
    setData(
      m,
      "located",
      p
        ? {
            type: "FeatureCollection",
            features: [
              { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circleRing(p.lon, p.lat, Math.max(5, p.accuracyM))] } },
              { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } },
            ],
          }
        : EMPTY,
    );
  };

  const applyDraw = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    markers.current.forEach((k) => k.remove());
    markers.current = [];
    const d = latest.current.draw;
    m.getCanvas().style.cursor = d && d.active >= 0 ? "crosshair" : "";
    if (!d) {
      setData(m, "draw", EMPTY);
      return;
    }
    const ringFeature = (ring: Position[], ri: number): Feat =>
      d.closed[ri] && ring.length >= 3
        ? { type: "Feature", properties: { outer: ri === 0 }, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]!]] } }
        : { type: "Feature", properties: { outer: false }, geometry: { type: "LineString", coordinates: ring.length === 1 ? [ring[0]!, ring[0]!] : ring } };
    const render = (rings: Position[][]) => setData(m, "draw", { type: "FeatureCollection", features: rings.map(ringFeature).filter((f, i) => rings[i]!.length > 0) });
    render(d.rings);

    const block = () => {
      suppressClick.current = Date.now();
    };
    d.rings.forEach((ring, ri) => {
      if (ring.length === 0) return;
      const closed = d.closed[ri];
      ring.forEach((p, vi) => {
        const isSel = d.selected?.ring === ri && d.selected.index === vi;
        const isFirst = !closed && vi === 0 && ring.length >= 3;
        const el = vertexEl(isSel ? "selected" : isFirst ? "first" : "vertex", isFirst ? "First point: click to close the shape" : `Point ${vi + 1}`);
        el.addEventListener("pointerdown", block);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          block();
          if (isFirst && d.active === ri) latest.current.onCloseRing?.();
          else latest.current.onSelectVertex?.(ri, vi);
        });
        el.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            if (isFirst && d.active === ri) latest.current.onCloseRing?.();
            else latest.current.onSelectVertex?.(ri, vi);
          }
        });
        const mk = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(p as LngLatLike).addTo(m);
        mk.on("dragstart", block);
        mk.on("drag", () => {
          const pos = mk.getLngLat();
          const rings = d.rings.map((r) => [...r]);
          rings[ri]![vi] = [pos.lng, pos.lat];
          render(rings);
        });
        mk.on("dragend", () => {
          block();
          const pos = mk.getLngLat();
          latest.current.onMoveVertex?.(ri, vi, [pos.lng, pos.lat]);
        });
        markers.current.push(mk);
      });
      if (closed)
        ring.forEach((p, vi) => {
          const q = ring[(vi + 1) % ring.length]!;
          const mid: Position = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          const el = vertexEl("mid", "Add a point here");
          el.addEventListener("pointerdown", block);
          el.addEventListener("click", (ev) => {
            ev.stopPropagation();
            block();
            latest.current.onInsertVertex?.(ri, vi, mid);
          });
          const mk = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(mid as LngLatLike).addTo(m);
          mk.on("dragstart", block);
          mk.on("dragend", () => {
            block();
            const pos = mk.getLngLat();
            latest.current.onInsertVertex?.(ri, vi, [pos.lng, pos.lat]);
          });
          markers.current.push(mk);
        });
    });
  };

  const fitShapes = (animate: boolean) => {
    const m = map.current;
    if (!m || !ready.current) return false;
    const pts = latest.current.shapes.flatMap((s) => ringsOf(s.geometry).flatMap((p) => p[0]!));
    if (!pts.length) return false;
    spinning.current = false;
    const b = new maplibregl.LngLatBounds(pts[0] as [number, number], pts[0] as [number, number]);
    for (const p of pts) b.extend(p as [number, number]);
    m.fitBounds(b, { padding: 40, maxZoom: 18, duration: animate && !reducedMotion() ? 3500 : 0, essential: true });
    return true;
  };

  const flyToFocus = () => {
    const m = map.current, f = latest.current.focus;
    if (!m || !ready.current || !f) return;
    spinning.current = false;
    const still = reducedMotion();
    if (f.bbox) {
      const [s, n, w, e] = f.bbox;
      m.fitBounds([[w, s], [e, n]], { maxZoom: f.zoom ?? 16, padding: 24, duration: still ? 0 : 5000, essential: true, linear: false });
    } else if (still) m.jumpTo({ center: [f.lon, f.lat], zoom: f.zoom ?? 16 });
    // A high arc from the current view down to the place: the "flight over the Earth".
    else m.flyTo({ center: [f.lon, f.lat], zoom: f.zoom ?? 16, speed: 0.9, curve: 1.6, essential: true });
  };

  const fitted = useRef<string | undefined>(undefined);

  useEffect(() => applyBasemap(), [loaded, props.basemap, props.imageryDate]);
  useEffect(() => applyOverlays(), [loaded, props.overlays]);
  useEffect(() => applyShapes(), [loaded, props.shapes]);
  useEffect(() => applyLocated(), [loaded, props.located]);
  useEffect(() => applyDraw(), [loaded, props.draw]);
  useEffect(() => {
    if (props.fitKey && fitted.current !== props.fitKey && fitShapes(fitted.current === undefined)) fitted.current = props.fitKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appliers read the latest props from a ref
  }, [loaded, props.fitKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- appliers read the latest props from a ref
  useEffect(() => flyToFocus(), [loaded, props.focus]);

  return (
    <>
      <div ref={host} role="application" aria-label={props.label} style={{ position: "absolute", inset: 0, background: tokens.forest[950] }} />
      {far && props.onAddVertex && props.draw && props.draw.active >= 0 && (
        <div
          role="status"
          style={{ position: "absolute", left: "50%", bottom: 40, transform: "translateX(-50%)", zIndex: 4, padding: "8px 14px", borderRadius: 999, background: "rgba(10,29,22,.88)", color: tokens.neutral[0], fontSize: "0.875rem", fontWeight: 600, boxShadow: "0 8px 24px -10px rgba(0,0,0,.6)", pointerEvents: "none", whiteSpace: "nowrap" }}
        >
          Zoom in to your field to start drawing
        </div>
      )}
    </>
  );
}
