/**
 * Parses a typed location such as "23.81, 90.41", "23.81N 90.41E" or
 * 23°48'36"N 90°24'36"E. The order is always latitude then longitude. Values are never
 * swapped silently; an out-of-range latitude gets a hint instead.
 */

export type LatLon = { lat: number; lon: number };
export type CoordinateResult = { ok: true; value: LatLon } | { ok: false; error: string };

const PART = String.raw`([+-]?\d+(?:[.,]\d+)?)\s*(?:°|º|d|\s)?\s*(?:(\d+(?:[.,]\d+)?)\s*(?:'|′|m|\s)\s*(?:(\d+(?:[.,]\d+)?)\s*(?:"|″|''|s)?)?)?\s*([NSEW])?`;
const PAIR = new RegExp(String.raw`^\s*([NSEW])?\s*${PART}\s*[,;/\s]\s*([NSEW])?\s*${PART}\s*$`, "i");

function toDecimal(d: string, m: string | undefined, s: string | undefined): number | null {
  const num = (v: string) => Number(v.replace(",", "."));
  const deg = num(d);
  const min = m ? num(m) : 0;
  const sec = s ? num(s) : 0;
  if (![deg, min, sec].every(Number.isFinite) || min >= 60 || sec >= 60) return null;
  const sign = deg < 0 || Object.is(deg, -0) || d.trim().startsWith("-") ? -1 : 1;
  return sign * (Math.abs(deg) + min / 60 + sec / 3600);
}

export function parseCoordinates(input: string): CoordinateResult {
  const text = input.trim();
  if (!text) return { ok: false, error: "Enter latitude and longitude, for example 23.81, 90.41." };
  // A decimal comma inside each number ("23,81 90,41") is ambiguous with the separator; require a dot then.
  const m = PAIR.exec(text);
  if (!m) return { ok: false, error: "Could not read that. Use latitude, longitude in decimal degrees (23.81, 90.41) or with N/S/E/W." };
  const [, preA, dA, mA, sA, postA, preB, dB, mB, sB, postB] = m;
  const hemA = (preA ?? postA)?.toUpperCase();
  const hemB = (preB ?? postB)?.toUpperCase();
  let a = toDecimal(dA!, mA, sA);
  let b = toDecimal(dB!, mB, sB);
  if (a === null || b === null) return { ok: false, error: "Minutes and seconds must be below 60." };

  let latV: number, lonV: number;
  if (hemA && "EW".includes(hemA) && hemB && "NS".includes(hemB)) {
    // Explicit hemispheres given in lon, lat order: honour the letters.
    [a, b] = [b, a];
    latV = hemB === "S" ? -Math.abs(a) : a;
    lonV = hemA === "W" ? -Math.abs(b) : b;
  } else {
    if (hemA && !"NS".includes(hemA)) return { ok: false, error: "The first value is latitude; use N or S with it." };
    if (hemB && !"EW".includes(hemB)) return { ok: false, error: "The second value is longitude; use E or W with it." };
    latV = hemA === "S" ? -Math.abs(a) : a;
    lonV = hemB === "W" ? -Math.abs(b) : b;
  }
  if (latV < -90 || latV > 90) {
    const hint = Math.abs(lonV) <= 90 ? " It looks like longitude came first; enter latitude first." : "";
    return { ok: false, error: `Latitude must be between −90 and 90.${hint}` };
  }
  if (lonV < -180 || lonV > 180) return { ok: false, error: "Longitude must be between −180 and 180." };
  return { ok: true, value: { lat: latV, lon: lonV } };
}

/** "23.8100° N, 90.4100° E" */
export function formatLatLon({ lat, lon }: LatLon, digits = 4): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(digits)}° ${lon >= 0 ? "E" : "W"}`;
}
