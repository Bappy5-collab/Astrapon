/**
 * Turns a saved (or sample) field into scene data: local metric coordinates from the domain
 * local frame, scaled uniformly so the field spans SCENE_SIZE units. One uniform scale keeps
 * proportions true; nothing is stretched, and no terrain is invented (the ground is flat).
 */
import type { CropForm } from "@/domain/farm/crops";
import type { BoundaryGeometry } from "@/domain/geo/boundary";
import {
  createLocalFrame,
  dominantEdgeBearing,
  localPolygonArea,
  pointInLocalPolygon,
  projectField,
  projectGeometry,
  type LocalPoint,
  type LocalPolygon,
} from "@/domain/geo/local-frame";
import { mulberry32 } from "@/components/scene/random";

export const SCENE_SIZE = 100;
export const FIELD_KEY = "__field";

export type SceneZone = { key: string; name: string; polygons: LocalPolygon[]; centroid: LocalPoint };

export type SceneData = {
  /** Field polygons in scene units (x = east, y = north). */
  field: LocalPolygon[];
  zones: SceneZone[];
  /** Metres per scene unit. */
  metresPerUnit: number;
  extentM: number;
  /** Row direction, degrees clockwise from north (illustrative only). */
  bearing: number;
  areaUnits: number;
};

const scalePoly = (p: LocalPolygon, k: number, cx: number, cy: number): LocalPolygon => ({
  outer: p.outer.map(([x, y]) => [(x - cx) * k, (y - cy) * k]),
  holes: p.holes.map((h) => h.map(([x, y]) => [(x - cx) * k, (y - cy) * k] as LocalPoint)),
});

function centroidOf(polys: LocalPolygon[]): LocalPoint {
  let sx = 0, sy = 0, n = 0;
  for (const p of polys) for (const [x, y] of p.outer) { sx += x; sy += y; n++; }
  return n ? [sx / n, sy / n] : [0, 0];
}

export function buildSceneData(boundary: BoundaryGeometry, zones: { key: string; name: string; boundary: BoundaryGeometry }[]): SceneData {
  const projected = projectField(boundary);
  const frame = createLocalFrame(projected.origin);
  const { minX, maxX, minY, maxY } = projected.bounds;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const k = SCENE_SIZE / Math.max(projected.extentM, 1);
  const field = projected.polygons.map((p) => scalePoly(p, k, cx, cy));
  const sceneZones = zones.map((z) => {
    const polygons = projectGeometry(z.boundary, frame).map((p) => scalePoly(p, k, cx, cy));
    return { key: z.key, name: z.name, polygons, centroid: centroidOf(polygons) };
  });
  const largest = [...field].sort((a, b) => localPolygonArea(b) - localPolygonArea(a))[0]!;
  return {
    field,
    zones: sceneZones,
    metresPerUnit: 1 / k,
    extentM: projected.extentM,
    bearing: dominantEdgeBearing(largest),
    areaUnits: field.reduce((s, p) => s + localPolygonArea(p), 0),
  };
}

export type Placement = { x: number; z: number; yaw: number; jitter: number };

/**
 * Plant positions on rows aligned with the field's main axis, thinned to `budget` plants.
 * Each position is assigned to the zone containing it, else to the whole field.
 */
export function plantPlacements(data: SceneData, budget: number): Map<string, Placement[]> {
  const out = new Map<string, Placement[]>();
  if (budget <= 0 || data.areaUnits <= 0) return out;
  const spacing = Math.sqrt(data.areaUnits / budget);
  const rowGap = spacing * 1.25;
  const step = spacing * 0.8;
  const θ = (data.bearing * Math.PI) / 180;
  // Row axis (along rows) and cross axis in the x/y plane.
  const ax = Math.sin(θ), ay = Math.cos(θ);
  const bx = ay, by = -ax;
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of data.field)
    for (const [x, y] of p.outer) {
      const u = x * ax + y * ay, v = x * bx + y * by;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
  const rand = mulberry32(7);
  for (let v = minV + rowGap / 2; v <= maxV; v += rowGap) {
    for (let u = minU + step / 2; u <= maxU; u += step) {
      const x = u * ax + v * bx + (rand() - 0.5) * step * 0.25;
      const y = u * ay + v * by + (rand() - 0.5) * rowGap * 0.12;
      if (!data.field.some((p) => pointInLocalPolygon([x, y], p))) continue;
      const zone = data.zones.find((z) => z.polygons.some((p) => pointInLocalPolygon([x, y], p)));
      const key = zone?.key ?? FIELD_KEY;
      let list = out.get(key);
      if (!list) out.set(key, (list = []));
      list.push({ x, z: -y, yaw: rand() * Math.PI * 2, jitter: 0.85 + rand() * 0.3 });
    }
  }
  return out;
}

export type RegionCrop = { form: CropForm; cropName: string | null };
