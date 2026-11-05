/**
 * Mapped surface-water features (OpenStreetMap, via Overpass) classified for the planner.
 *
 * A mapped feature shows that someone drew water there; it does not show today's water, how
 * much may be taken, dry-season flow, quality, ownership or abstraction permission. Line
 * waterways are centrelines: distance to them is distance to the drawn centre, not the bank.
 * A mapped well (man_made=water_well) is a location only, never a groundwater level.
 */

import type { BoundaryGeometry, Position } from "../geo/boundary";
import { boundaryDistance, fieldFrame, validSourceGeometry, type SourceGeometry } from "./distance";

export type SurfaceCategory = "river" | "stream" | "canal" | "drain_ditch" | "lake_pond" | "reservoir" | "river_area" | "mapped_well" | "spring" | "other_water";
export type GeometryRole = "centreline" | "outline" | "point";

export const CATEGORY_LABEL: Record<SurfaceCategory, string> = {
  river: "River",
  stream: "Stream",
  canal: "Canal",
  drain_ditch: "Drain or ditch",
  lake_pond: "Lake or pond",
  reservoir: "Reservoir",
  river_area: "River water area",
  mapped_well: "Mapped well (location only)",
  spring: "Spring",
  other_water: "Water body",
};

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
  timestamp?: string;
  version?: number;
};

export type MappedSource = {
  id: string;
  provider: "osm";
  name: string | null;
  category: SurfaceCategory;
  role: GeometryRole;
  geometry: SourceGeometry;
  /** Last edit of the OSM element (mapping date), not an observation date. */
  lastEdited: string | null;
  url: string;
  distanceM: number;
  intersects: boolean;
  fieldPoint: Position;
  sourcePoint: Position;
  tags: Record<string, string>;
};

const KEEP_TAGS = ["name", "waterway", "natural", "water", "landuse", "man_made", "intermittent", "seasonal", "salt", "usage", "irrigation", "access", "operator", "width"];

export function classify(tags: Record<string, string>, type: OsmElement["type"]): SurfaceCategory | null {
  const ww = tags.waterway;
  if (type === "node") {
    if (tags.man_made === "water_well") return "mapped_well";
    if (tags.natural === "spring") return "spring";
    return null;
  }
  if (ww === "river") return "river";
  if (ww === "stream") return "stream";
  if (ww === "canal") return "canal";
  if (ww === "drain" || ww === "ditch") return "drain_ditch";
  if (ww === "riverbank" || (tags.natural === "water" && (tags.water === "river" || tags.water === "canal" || tags.water === "stream"))) return "river_area";
  if (tags.landuse === "reservoir" || tags.water === "reservoir" || tags.water === "basin") return "reservoir";
  if (tags.natural === "water") return tags.water === "pond" || tags.water === "lake" || tags.water === "oxbow" || !tags.water ? "lake_pond" : "other_water";
  return null;
}

const closed = (pts: Position[]) => pts.length >= 4 && pts[0]![0] === pts[pts.length - 1]![0] && pts[0]![1] === pts[pts.length - 1]![1];
const toPos = (g: { lat: number; lon: number }[]) => g.map((p) => [p.lon, p.lat] as Position);

/** Geometry for one element: centreline for waterway lines, outline polygon/lines for areas, point for nodes. */
export function elementGeometry(el: OsmElement, category: SurfaceCategory): { geometry: SourceGeometry; role: GeometryRole } | null {
  if (el.type === "node") return el.lat != null && el.lon != null ? { geometry: { type: "Point", coordinates: [el.lon, el.lat] }, role: "point" } : null;
  const linear = category === "river" || category === "stream" || category === "canal" || category === "drain_ditch";
  if (el.type === "way" && el.geometry && el.geometry.length >= 2) {
    const pts = toPos(el.geometry);
    if (!linear && closed(pts)) return { geometry: { type: "Polygon", coordinates: [pts] }, role: "outline" };
    return { geometry: { type: "LineString", coordinates: pts }, role: linear ? "centreline" : "outline" };
  }
  if (el.type === "relation" && el.members) {
    const outers = el.members.filter((m) => m.role !== "inner" && m.geometry && m.geometry.length >= 2).map((m) => toPos(m.geometry!));
    if (!outers.length) return null;
    if (outers.length === 1 && closed(outers[0]!)) return { geometry: { type: "Polygon", coordinates: [outers[0]!] }, role: "outline" };
    return { geometry: { type: "MultiLineString", coordinates: outers }, role: "outline" };
  }
  return null;
}

/**
 * Turns Overpass elements into classified sources measured from the field boundary, keeps those
 * within the radius, nearest first. Invalid geometry is dropped and counted.
 */
export function measureSources(elements: OsmElement[], field: BoundaryGeometry, radiusM: number): { sources: MappedSource[]; dropped: number; beyondRadius: number } {
  const frame = fieldFrame(field);
  const out: MappedSource[] = [];
  let dropped = 0, beyond = 0;
  for (const el of elements) {
    const tags = el.tags ?? {};
    const category = classify(tags, el.type);
    if (!category) continue;
    const g = elementGeometry(el, category);
    if (!g || !validSourceGeometry(g.geometry)) { dropped++; continue; }
    const d = boundaryDistance(field, g.geometry, frame);
    if (d.distanceM > radiusM) { beyond++; continue; }
    out.push({
      id: `osm:${el.type}/${el.id}`,
      provider: "osm",
      name: tags.name ?? null,
      category,
      role: g.role,
      geometry: g.geometry,
      lastEdited: el.timestamp ?? null,
      url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      distanceM: Math.round(d.distanceM * 10) / 10,
      intersects: d.intersects,
      fieldPoint: d.fieldPoint,
      sourcePoint: d.sourcePoint,
      tags: Object.fromEntries(Object.entries(tags).filter(([k]) => KEEP_TAGS.includes(k))),
    });
  }
  out.sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
  return { sources: out, dropped, beyondRadius: beyond };
}

/** What the distance means, in words, for a source's geometry role. */
export function distanceMeaning(role: GeometryRole): string {
  if (role === "centreline") return "to the mapped centreline (the bank is closer by about half the channel width)";
  if (role === "outline") return "to the mapped water outline";
  return "to the mapped point";
}
