/**
 * Pure state for drawing and editing one polygon (an outer ring plus optional holes) on a map.
 * Rings are stored open (no repeated closing point). Every operation returns a new state so the
 * caller can keep an undo stack.
 */
import { parseBoundary, type BoundaryGeometry, type BoundaryResult, type Position } from "./boundary";
import { wrapLongitude } from "./local-frame";

export type DrawState = {
  rings: Position[][];
  /** Ring that receives new clicks; -1 when every ring is closed. */
  active: number;
  closed: boolean[];
  selected: { ring: number; index: number } | null;
};

export const emptyDraw = (): DrawState => ({ rings: [[]], active: 0, closed: [false], selected: null });

export function fromGeometry(g: BoundaryGeometry): DrawState {
  const poly = g.type === "Polygon" ? g.coordinates : g.coordinates[0]!;
  const rings = poly.map((r) => r.slice(0, -1).map(([x, y]) => [x, y] as Position));
  return { rings, active: -1, closed: rings.map(() => true), selected: null };
}

/** Keeps longitudes continuous with the ring's first point (map panning can yield lon > 180). */
function continuous(ring: Position[], p: Position): Position {
  const ref = ring[0] ?? p;
  return [ref[0] + wrapLongitude(p[0] - ref[0]), p[1]];
}

export function addVertex(s: DrawState, p: Position): DrawState {
  if (s.active < 0) return s;
  const rings = s.rings.map((r, i) => (i === s.active ? [...r, continuous(r, p)] : r));
  return { ...s, rings, selected: { ring: s.active, index: rings[s.active]!.length - 1 } };
}

export function canClose(s: DrawState): boolean {
  return s.active >= 0 && (s.rings[s.active]?.length ?? 0) >= 3;
}

export function closeActive(s: DrawState): DrawState {
  if (!canClose(s)) return s;
  const closed = s.closed.map((c, i) => (i === s.active ? true : c));
  return { ...s, closed, active: -1, selected: null };
}

export function moveVertex(s: DrawState, ring: number, index: number, p: Position): DrawState {
  const rings = s.rings.map((r, i) => (i === ring ? r.map((q, j) => (j === index ? continuous(r.filter((_, k) => k !== index), p) : q)) : r));
  return { ...s, rings, selected: { ring, index } };
}

/** Inserts a vertex after `index` (used by the midpoint handles of a closed ring). */
export function insertVertex(s: DrawState, ring: number, index: number, p: Position): DrawState {
  const rings = s.rings.map((r, i) => (i === ring ? [...r.slice(0, index + 1), continuous(r, p), ...r.slice(index + 1)] : r));
  return { ...s, rings, selected: { ring, index: index + 1 } };
}

/** Deletes the selected vertex. A closed ring keeps at least 3; a hole that would drop below 3 is removed. */
export function deleteSelected(s: DrawState): DrawState {
  if (!s.selected) return s;
  const { ring, index } = s.selected;
  const r = s.rings[ring]!;
  if (s.closed[ring] && r.length <= 3) {
    if (ring === 0) return s;
    return { rings: s.rings.filter((_, i) => i !== ring), closed: s.closed.filter((_, i) => i !== ring), active: -1, selected: null };
  }
  const rings = s.rings.map((x, i) => (i === ring ? x.filter((_, j) => j !== index) : x));
  return { ...s, rings, selected: null };
}

/** Starts a new hole (an area inside the field that is not cropped, e.g. a pond). */
export function startHole(s: DrawState): DrawState {
  if (!s.closed[0] || s.active >= 0) return s;
  return { rings: [...s.rings, []], closed: [...s.closed, false], active: s.rings.length, selected: null };
}

/** Drops an unfinished ring (or the whole drawing if the outer ring is unfinished). */
export function cancelActive(s: DrawState): DrawState {
  if (s.active < 0) return s;
  if (s.active === 0) return emptyDraw();
  return { rings: s.rings.filter((_, i) => i !== s.active), closed: s.closed.filter((_, i) => i !== s.active), active: -1, selected: null };
}

export const isComplete = (s: DrawState) => s.active < 0 && s.closed[0] === true && (s.rings[0]?.length ?? 0) >= 3;

export function toGeometry(s: DrawState): BoundaryGeometry | null {
  if (!isComplete(s)) return null;
  const rings = s.rings.filter((r, i) => s.closed[i] && r.length >= 3).map((r) => [...r, r[0]!].map(([x, y]) => [wrapLongitude(x), y] as Position));
  return { type: "Polygon", coordinates: rings };
}

/**
 * Validates the drawing. Longitudes are wrapped back into [-180, 180]; a ring that then jumps
 * across the meridian is reported by parseBoundary with the antimeridian explanation.
 */
export function validateDrawing(s: DrawState): BoundaryResult | null {
  const g = toGeometry(s);
  return g ? parseBoundary(g) : null;
}
