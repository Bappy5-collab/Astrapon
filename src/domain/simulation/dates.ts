/**
 * Calendar arithmetic on an absolute day index (days since 1970-01-01, UTC). Crops that cross the
 * calendar year are just intervals on this line; nothing here assumes a hemisphere or a season.
 */

const MS_PER_DAY = 86_400_000;

export function dayIndex(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) throw new Error(`Not a calendar date: ${iso}`);
  return Math.round(t / MS_PER_DAY);
}

export function isoDate(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function yearOf(day: number): number {
  return new Date(day * MS_PER_DAY).getUTCFullYear();
}

/** Day of year, 1 = 1 January. */
export function dayOfYear(day: number): number {
  return day - dayIndex(`${yearOf(day)}-01-01`) + 1;
}

/** "MM-DD" → day index in the given year. 02-29 in a non-leap year becomes 03-01. */
export function monthDayIn(year: number, md: string): number {
  const m = /^(\d{2})-(\d{2})$/.exec(md);
  if (!m) throw new Error(`Not a month-day: ${md}`);
  const month = Number(m[1]);
  const date = Number(m[2]);
  if (month < 1 || month > 12 || date < 1 || date > 31) throw new Error(`Not a month-day: ${md}`);
  return Math.round(Date.UTC(year, month - 1, date) / MS_PER_DAY);
}

/** Validates "MM-DD" against a leap year (so 02-29 is accepted). */
export function isMonthDay(md: string): boolean {
  const m = /^(\d{2})-(\d{2})$/.exec(md);
  if (!m) return false;
  const d = new Date(Date.UTC(2000, Number(m[1]) - 1, Number(m[2])));
  return d.getUTCMonth() === Number(m[1]) - 1 && d.getUTCDate() === Number(m[2]);
}

/** Day offset of "MM-DD" from 1 January, in a non-leap reference year (0 = 1 January). */
export function mdOffset(md: string): number {
  return monthDayIn(2001, md) - monthDayIn(2001, "01-01");
}

/** Offset (0-based, non-leap reference year) → "MM-DD". */
export function offsetMd(offset: number): string {
  const o = ((Math.round(offset) % 365) + 365) % 365;
  return isoDate(monthDayIn(2001, "01-01") + o).slice(5);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(day: number): string {
  return MONTHS[new Date(day * MS_PER_DAY).getUTCMonth()]!;
}

/** "Oct–Jul": months of an interval, never a season name (hemisphere-neutral). */
export function monthSpan(start: number, endExclusive: number): string {
  return `${monthLabel(start)}–${monthLabel(Math.max(start, endExclusive - 1))}`;
}

/** Midpoint (forward, wrapping at year end) between two non-leap offsets. */
export function midOffset(a: number, b: number): number {
  const span = (((b - a) % 365) + 365) % 365;
  return (a + Math.floor(span / 2)) % 365;
}

/** Forward distance in days from offset a to offset b (0–364). */
export function forwardDays(a: number, b: number): number {
  return (((b - a) % 365) + 365) % 365;
}
