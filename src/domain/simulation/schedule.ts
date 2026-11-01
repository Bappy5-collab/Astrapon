import type { CropParams } from "./catalog";
import { forwardDays, midOffset, mdOffset } from "./dates";

/**
 * Planting slots and rotation scheduling on a pseudo-calendar of 365-day cycle years. A slot is a
 * crop with a preferred planting offset (0 = 1 January), an allowed planting window and a season
 * length, all from local evidence (docs/scientific-methodology.md §4).
 */

export type SlotSource = "farmer_window" | "history" | "calendar" | "history_record";

export type Slot = {
  key: string;
  crop: CropParams | null;
  cropName: string;
  source: SlotSource;
  sourceDetail: string;
  /** Offsets from 1 January in a 365-day year. */
  preferred: number;
  windowStart: number;
  /** Forward length of the planting window in days (0 = a fixed date). */
  windowSpan: number;
  length: number;
};

export type Planting = { slot: Slot; cycleYear: number };
export type ScheduledPlanting = Planting & { start: number; end: number };

export type ScheduleFailure = { code: "overlap" | "window_missed"; detail: string };

/** Absolute pseudo-day of a cycle-year offset. */
export const abs = (cycleYear: number, offset: number) => cycleYear * 365 + offset;

export function slotFromWindow(key: string, crop: CropParams | null, cropName: string, source: SlotSource, sourceDetail: string, from: string, to: string, length: number): Slot {
  const a = mdOffset(from);
  const b = mdOffset(to);
  return { key, crop, cropName, source, sourceDetail, preferred: midOffset(a, b), windowStart: a, windowSpan: forwardDays(a, b), length };
}

/**
 * Schedules plantings in time order. Each starts at max(preferred, previous harvest + turnaround)
 * and must start inside its window. With `cyclic`, the cycle repeats and the last harvest must
 * leave room for the first planting of the next repetition.
 */
export function schedule(plantings: Planting[], cycleYears: number, turnaround: number, cyclic: boolean): { ok: true; plantings: ScheduledPlanting[] } | { ok: false; failure: ScheduleFailure; plantings: ScheduledPlanting[] } {
  const ordered = [...plantings].sort((x, y) => abs(x.cycleYear, x.slot.preferred) - abs(y.cycleYear, y.slot.preferred) || x.slot.key.localeCompare(y.slot.key));
  const out: ScheduledPlanting[] = [];
  let prevEnd = Number.NEGATIVE_INFINITY;
  let prevName = "";
  for (const p of ordered) {
    const pref = abs(p.cycleYear, p.slot.preferred);
    // The window opens on or before the preferred date (it may start in the previous year).
    const back = forwardDays(p.slot.windowStart, p.slot.preferred);
    const windowEnd = pref - back + p.slot.windowSpan;
    const start = Math.max(pref, prevEnd + turnaround);
    if (start > windowEnd) {
      const failure: ScheduleFailure = { code: "overlap", detail: `${prevName} is harvested too late to plant ${p.slot.cropName} within its planting window.` };
      return { ok: false, failure, plantings: out };
    }
    out.push({ ...p, start, end: start + p.slot.length });
    prevEnd = start + p.slot.length;
    prevName = p.slot.cropName;
  }
  if (cyclic && out.length > 0) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (last.end + turnaround > first.start + cycleYears * 365)
      return { ok: false, failure: { code: "overlap", detail: `${last.slot.cropName} is harvested after ${first.slot.cropName} must be planted again when the rotation repeats.` }, plantings: out };
  }
  return { ok: true, plantings: out };
}

/** Days in [0, 365·N) covered by at least one planting, folding the cycle. */
export function occupiedDays(plantings: ScheduledPlanting[], cycleYears: number): number {
  const n = cycleYears * 365;
  const marks = new Uint8Array(n);
  for (const p of plantings) for (let d = p.start; d < p.end; d++) marks[((d % n) + n) % n] = 1;
  let c = 0;
  for (const m of marks) c += m;
  return c;
}

/** Longest uncovered stretch in the folded cycle, with its start offset. */
export function longestGap(plantings: ScheduledPlanting[], cycleYears: number): { days: number; start: number } {
  const n = cycleYears * 365;
  const marks = new Uint8Array(n);
  for (const p of plantings) for (let d = p.start; d < p.end; d++) marks[((d % n) + n) % n] = 1;
  if (marks.every((m) => m === 0)) return { days: n, start: 0 };
  let best = { days: 0, start: 0 };
  // Walk two cycles to catch a gap that wraps the cycle boundary.
  let run = 0;
  let runStart = 0;
  for (let i = 0; i < 2 * n; i++) {
    if (marks[i % n] === 0) {
      if (run === 0) runStart = i;
      run++;
      if (run > best.days && run <= n) best = { days: run, start: runStart % n };
    } else run = 0;
  }
  return best;
}

/**
 * Year patterns: 0–3 plantings of distinct slots that can follow each other within one year
 * (non-cyclic check; the full sequence is checked cyclically). The empty pattern lets a long
 * crop span a year in which nothing new is planted.
 */
export function yearPatterns(slots: Slot[], turnaround: number, maxPerYear = 3): Slot[][] {
  const out: Slot[][] = [[]];
  const sorted = [...slots].sort((a, b) => a.key.localeCompare(b.key));
  const rec = (startIdx: number, chosen: Slot[]) => {
    if (chosen.length > 0) {
      const r = schedule(chosen.map((slot) => ({ slot, cycleYear: 0 })), 1, turnaround, false);
      if (!r.ok) return;
      out.push([...chosen]);
    }
    if (chosen.length >= maxPerYear) return;
    for (let i = startIdx; i < sorted.length; i++) rec(i + 1, [...chosen, sorted[i]!]);
  };
  rec(0, []);
  return out;
}

/** Canonical key of a cyclic sequence of year patterns (rotations of the same cycle are equal). */
export function cycleKey(years: Slot[][]): string {
  const parts = years.map((y) => y.map((s) => s.key).sort().join("+"));
  let best: string | null = null;
  for (let r = 0; r < parts.length; r++) {
    const k = [...parts.slice(r), ...parts.slice(0, r)].join(" | ");
    if (best === null || k < best) best = k;
  }
  return best ?? "";
}
