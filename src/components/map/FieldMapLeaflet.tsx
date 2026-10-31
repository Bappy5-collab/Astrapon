"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import type { BoundaryGeometry, Position } from "@/domain/geo/boundary";
import type { DrawState } from "@/domain/geo/drawing";
import { tokens } from "@/theme/tokens";

import { HLS_ATTRIBUTION, HLS_LAYERS, HLS_MAX_NATIVE_ZOOM, hlsTileUrl, OSM_ATTRIBUTION, OSM_TILES } from "./basemaps";

export type MapShape = { key: string; geometry: BoundaryGeometry; kind: "field" | "zone"; selected?: boolean; label?: string };
export type MapFocus = { lat: number; lon: number; zoom?: number; bbox?: [number, number, number, number] | null; nonce: number };
export type Basemap = "streets" | "imagery";

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
  /** Fit to these shapes once when the map first loads (and when the nonce changes). */
  fitKey?: string;
  basemap: Basemap;
  imageryDate: string;
  located?: { lat: number; lon: number; accuracyM: number } | null;
  label: string;
};

const ll = ([lon, lat]: Position) => L.latLng(lat, lon);
const ringsOf = (g: BoundaryGeometry) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

function vertexIcon(kind: "vertex" | "first" | "selected" | "mid") {
  const size = kind === "mid" ? 12 : 16;
  const bg = kind === "selected" ? tokens.lime[400] : kind === "mid" ? "rgba(255,255,255,0.85)" : tokens.neutral[0];
  const border = kind === "first" ? tokens.clay : tokens.forest[800];
  // The visible dot sits inside a 36px transparent hit area for touch.
  return L.divIcon({
    className: "fs-vertex",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<span style="display:block;width:${size}px;height:${size}px;margin:${(36 - size) / 2}px;border-radius:50%;background:${bg};border:${kind === "mid" ? 1.5 : 2.5}px solid ${border};box-shadow:0 1px 3px rgba(0,0,0,.35)"></span>`,
  });
}

export default function FieldMapLeaflet(props: FieldMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ base?: L.TileLayer; imagery: L.TileLayer[]; shapes: L.LayerGroup; draw: L.LayerGroup; located: L.LayerGroup } | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // Create the map once.
  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, { zoomControl: true, worldCopyJump: false, maxZoom: 19, minZoom: 2, keyboard: true, attributionControl: true, zoomSnap: 0.5 });
    m.attributionControl.setPrefix(false);
    m.setView([20, 0], 2);
    const base = L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION, crossOrigin: false }).addTo(m);
    layers.current = { base, imagery: [], shapes: L.layerGroup().addTo(m), draw: L.layerGroup().addTo(m), located: L.layerGroup().addTo(m) };
    m.on("click", (e: L.LeafletMouseEvent) => latest.current.onAddVertex?.([e.latlng.lng, e.latlng.lat]));
    m.on("moveend", () => {
      const c = m.getCenter();
      latest.current.onCenter?.([c.lng, c.lat]);
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      layers.current = null;
    };
  }, []);

  // Imagery layers (HLS Landsat under Sentinel-2) for the chosen date.
  useEffect(() => {
    const m = map.current, ls = layers.current;
    if (!m || !ls) return;
    ls.imagery.forEach((l) => l.remove());
    ls.imagery = [];
    if (props.basemap === "imagery") {
      ls.imagery = HLS_LAYERS.map((layer, i) =>
        L.tileLayer(hlsTileUrl(layer, props.imageryDate), {
          maxNativeZoom: HLS_MAX_NATIVE_ZOOM,
          maxZoom: 19,
          attribution: i === 0 ? HLS_ATTRIBUTION(props.imageryDate) : "",
          crossOrigin: true,
        }).addTo(m),
      );
      ls.base?.setOpacity(0.55);
    } else ls.base?.setOpacity(1);
  }, [props.basemap, props.imageryDate]);

  // Saved shapes.
  useEffect(() => {
    const ls = layers.current;
    if (!ls) return;
    ls.shapes.clearLayers();
    for (const s of props.shapes) {
      for (const poly of ringsOf(s.geometry)) {
        const isField = s.kind === "field";
        // A white halo under the field edge keeps it legible on both street map and imagery.
        if (isField) L.polygon(poly.map((r) => r.map(ll)), { color: tokens.neutral[0], weight: s.selected ? 8 : 7, opacity: 0.9, fill: false, interactive: false }).addTo(ls.shapes);
        const layer = L.polygon(
          poly.map((r) => r.map(ll)),
          {
            color: s.selected ? tokens.lime[600] : isField ? tokens.forest[800] : tokens.forest[900],
            weight: s.selected ? 4 : isField ? 3 : 2,
            dashArray: isField ? undefined : "6 5",
            fillColor: isField ? tokens.lime[400] : tokens.forest[500],
            fillOpacity: isField ? 0.12 : s.selected ? 0.35 : 0.18,
            bubblingMouseEvents: false,
            interactive: Boolean(props.onSelectShape) && !props.draw,
          },
        );
        if (s.label) layer.bindTooltip(s.label, { sticky: true });
        if (props.onSelectShape && !props.draw) layer.on("click", () => latest.current.onSelectShape?.(s.key));
        layer.addTo(ls.shapes);
      }
    }
  }, [props.shapes, props.draw, props.onSelectShape]);

  // Fit to the saved shapes when asked.
  useEffect(() => {
    const m = map.current;
    if (!m || !props.fitKey) return;
    const all = latest.current.shapes.flatMap((s) => ringsOf(s.geometry).flatMap((p) => p[0]!.map(ll)));
    if (all.length) m.fitBounds(L.latLngBounds(all), { padding: [32, 32], maxZoom: 18 });
  }, [props.fitKey]);

  // Fly to a searched / typed / located position.
  useEffect(() => {
    const m = map.current, f = props.focus;
    if (!m || !f) return;
    if (f.bbox) {
      const [s, n, w, e] = f.bbox;
      m.fitBounds(L.latLngBounds([s, w], [n, e]), { maxZoom: f.zoom ?? 16, animate: false });
    } else m.setView([f.lat, f.lon], f.zoom ?? 16, { animate: false });
  }, [props.focus]);

  // Located position marker with accuracy circle.
  useEffect(() => {
    const ls = layers.current;
    if (!ls) return;
    ls.located.clearLayers();
    const p = props.located;
    if (!p) return;
    L.circle([p.lat, p.lon], { radius: p.accuracyM, color: tokens.forest[600], weight: 1, fillOpacity: 0.08, interactive: false }).addTo(ls.located);
    L.circleMarker([p.lat, p.lon], { radius: 7, color: tokens.neutral[0], weight: 2, fillColor: tokens.forest[600], fillOpacity: 1, interactive: false }).addTo(ls.located);
  }, [props.located]);

  // Drawing layer: rings, vertex handles, midpoint handles.
  useEffect(() => {
    const ls = layers.current;
    if (!ls) return;
    ls.draw.clearLayers();
    const d = props.draw;
    host.current?.classList.toggle("fs-drawing", Boolean(d && d.active >= 0));
    if (!d) return;
    d.rings.forEach((ring, ri) => {
      if (ring.length === 0) return;
      const closed = d.closed[ri];
      const line = closed
        ? L.polygon(ring.map(ll), { color: tokens.lime[400], weight: 3, fillColor: tokens.lime[400], fillOpacity: ri === 0 ? 0.2 : 0, interactive: false })
        : L.polyline(ring.map(ll), { color: tokens.lime[400], weight: 3, dashArray: "8 6", interactive: false });
      line.addTo(ls.draw);
      ring.forEach((p, vi) => {
        const isSel = d.selected?.ring === ri && d.selected.index === vi;
        const isFirst = !closed && vi === 0 && ring.length >= 3;
        const marker = L.marker(ll(p), { draggable: true, icon: vertexIcon(isSel ? "selected" : isFirst ? "first" : "vertex"), keyboard: true, title: `Point ${vi + 1}`, zIndexOffset: 1000 });
        marker.on("drag", (e) => {
          const pos = (e.target as L.Marker).getLatLng();
          const pts = ring.map(ll);
          pts[vi] = pos;
          (line as L.Polyline).setLatLngs(pts);
        });
        marker.on("dragend", (e) => {
          const pos = (e.target as L.Marker).getLatLng();
          latest.current.onMoveVertex?.(ri, vi, [pos.lng, pos.lat]);
        });
        marker.on("click", () => {
          if (isFirst && d.active === ri) latest.current.onCloseRing?.();
          else latest.current.onSelectVertex?.(ri, vi);
        });
        marker.addTo(ls.draw);
      });
      if (closed)
        ring.forEach((p, vi) => {
          const q = ring[(vi + 1) % ring.length]!;
          const mid: Position = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          const handle = L.marker(ll(mid), { draggable: true, icon: vertexIcon("mid"), title: "Add a point here", zIndexOffset: 500 });
          handle.on("click", () => latest.current.onInsertVertex?.(ri, vi, mid));
          handle.on("dragend", (e) => {
            const pos = (e.target as L.Marker).getLatLng();
            latest.current.onInsertVertex?.(ri, vi, [pos.lng, pos.lat]);
          });
          handle.addTo(ls.draw);
        });
    });
  }, [props.draw]);

  return (
    <div
      ref={host}
      role="application"
      aria-label={props.label}
      style={{ position: "absolute", inset: 0, background: tokens.neutral[150] }}
    />
  );
}
