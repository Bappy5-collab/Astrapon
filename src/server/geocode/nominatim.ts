import "server-only";

/**
 * Place search through the public OpenStreetMap Nominatim service, used under its usage
 * policy (https://operations.osmfoundation.org/policies/nominatim/), which the project owner
 * accepted responsibility for on 2026-10-31:
 *  - search runs only when the user submits (no autocomplete / search-as-you-type);
 *  - all users share one server-side queue limited to 1 request per second;
 *  - results are cached (24 h, bounded) and identical queries are never repeated upstream;
 *  - requests carry an identifying User-Agent; no personal data is sent (only the typed place);
 *  - results are shown with "© OpenStreetMap contributors" (ODbL) attribution;
 *  - GEOCODER_DISABLED=1 switches the service off without a software update.
 * For production traffic, move to a commercial provider or a self-hosted instance.
 */

export type PlaceResult = {
  label: string;
  lat: number;
  lon: number;
  /** [south, north, west, east] when the provider gives one. */
  bbox: [number, number, number, number] | null;
  kind: string;
};

export type GeocodeOutcome =
  | { ok: true; results: PlaceResult[]; cached: boolean }
  | { ok: false; reason: "disabled" | "busy" | "upstream" | "invalid"; message: string };

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "FieldShift/0.3 (crop-rotation decision support; development build; NASA Space Apps 2026 project)";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const MIN_INTERVAL_MS = 1100;
const MAX_WAIT_MS = 4000;

const cache = new Map<string, { at: number; results: PlaceResult[] }>();
let nextSlot = 0;

export const normaliseQuery = (q: string) => q.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** Reserves the next 1-request-per-second slot, or reports busy if the queue is too long. */
async function waitForSlot(): Promise<boolean> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  if (slot - now > MAX_WAIT_MS) return false;
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  return true;
}

export async function searchPlaces(query: string, language: string): Promise<GeocodeOutcome> {
  if (process.env.GEOCODER_DISABLED === "1") return { ok: false, reason: "disabled", message: "Place search is switched off on this server. Enter coordinates or use your location instead." };
  const q = normaliseQuery(query);
  if (q.length < 2 || q.length > 200) return { ok: false, reason: "invalid", message: "Type a place name of 2 to 200 characters." };
  const key = `${language}|${q}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ok: true, results: hit.results, cached: true };

  if (!(await waitForSlot())) return { ok: false, reason: "busy", message: "Place search is busy. Wait a moment and try again." };

  const url = `${ENDPOINT}?${new URLSearchParams({ q, format: "jsonv2", limit: "6", addressdetails: "0" })}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": language, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.status === 429 || res.status === 403) return { ok: false, reason: "busy", message: "The place search service is refusing requests right now. Enter coordinates instead, or try later." };
    if (!res.ok) return { ok: false, reason: "upstream", message: `The place search service returned an error (HTTP ${res.status}).` };
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return { ok: false, reason: "upstream", message: "The place search service returned an unexpected response." };
    const results: PlaceResult[] = [];
    for (const r of body as Record<string, unknown>[]) {
      const lat = Number(r.lat), lon = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof r.display_name !== "string") continue;
      const bb = Array.isArray(r.boundingbox) ? (r.boundingbox as unknown[]).map(Number) : [];
      results.push({
        label: r.display_name,
        lat,
        lon,
        bbox: bb.length === 4 && bb.every(Number.isFinite) ? (bb as [number, number, number, number]) : null,
        kind: [r.category, r.type].filter((v) => typeof v === "string").join(" · "),
      });
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), results });
    return { ok: true, results, cached: false };
  } catch {
    return { ok: false, reason: "upstream", message: "The place search service did not respond. Check your connection or enter coordinates instead." };
  }
}
