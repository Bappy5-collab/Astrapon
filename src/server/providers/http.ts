import { createHash } from "node:crypto";

/**
 * Minimal HTTP retrieval record used by every provider. It keeps what is needed
 * to trace a value back to the exact response: URL, time, status, and a hash of
 * the body. Provider modules here call only public, credential-free endpoints;
 * anything needing a secret must read it via `@/server/env` (server-only).
 *
 * Every request goes through `fetchText`, which enforces:
 *  - an allowlist of provider hosts (requests are built from parameters, never from user URLs);
 *  - a per-host concurrency limit;
 *  - bounded retries with backoff for timeouts, network errors, 429 and 5xx;
 *  - a timeout per attempt.
 */
export type Retrieval = {
  url: string;
  retrievedAt: string;
  status: number;
  durationMs: number;
  contentType: string | null;
  bodySha256: string;
  bodyBytes: number;
};

export type FetchResult =
  | { ok: true; retrieval: Retrieval; body: string }
  | { ok: false; url: string; retrievedAt: string; durationMs: number; error: string; status?: number; bodySnippet?: string; attempts?: number };

export const ALLOWED_HOSTS = new Set([
  "power.larc.nasa.gov",
  "modis.ornl.gov",
  "sdmdataaccess.sc.egov.usda.gov",
  "rest.isric.org",
  "cmr.earthdata.nasa.gov",
  // Water & Energy planner (Phase 10): bounded, user-triggered lookups; see docs/water-energy-providers.md.
  "overpass-api.de", // OpenStreetMap water geometry (public instance; 1 request at a time)
  "overpass.private.coffee", // listed public Overpass instance, used only when overpass-api.de is busy
  "api.waterdata.usgs.gov", // USGS groundwater stations and field measurements
  "hubeau.eaufrance.fr", // French groundwater levels (ADES)
  "ggis.un-igrac.org", // IGRAC GGMN shared groundwater network
]);

/**
 * Polite per-host limits. ORNL's subset service returned 502s under heavier parallel load in
 * Phase 4; on 2026-11-04 four and six parallel subset requests all answered 200 in ≈10–15 s, about
 * the time of one. Four in flight, with retries on 5xx, keeps a first greenness fetch to minutes.
 */
const PER_HOST_CONCURRENCY: Record<string, number> = { "modis.ornl.gov": 4, "overpass-api.de": 1, "overpass.private.coffee": 1 };
const DEFAULT_CONCURRENCY = 2;
const limitFor = (host: string) => PER_HOST_CONCURRENCY[host] ?? DEFAULT_CONCURRENCY;
const DEFAULT_ATTEMPTS = 3;
const USER_AGENT = "Astrapon/0.4 (crop-rotation decision support; development build)";

export class DisallowedHostError extends Error {}

export function assertAllowedUrl(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname)) throw new DisallowedHostError(`Refusing request to ${u.protocol}//${u.hostname}: not an allowlisted provider`);
  return u;
}

// ----------------------------------------------------- per-host semaphore ---

const active = new Map<string, number>();
const waiting = new Map<string, (() => void)[]>();

async function acquire(host: string) {
  if ((active.get(host) ?? 0) < limitFor(host)) {
    active.set(host, (active.get(host) ?? 0) + 1);
    return;
  }
  await new Promise<void>((resolve) => waiting.set(host, [...(waiting.get(host) ?? []), resolve]));
  active.set(host, (active.get(host) ?? 0) + 1);
}

function release(host: string) {
  active.set(host, Math.max(0, (active.get(host) ?? 1) - 1));
  const next = waiting.get(host)?.shift();
  next?.();
}

/**
 * Test hook: hosts listed in ASTRAPON_SIMULATE_OUTAGE (comma-separated) behave as unreachable.
 * Used by the outage checks; has no effect unless the variable is set.
 */
function simulatedOutage(host: string): boolean {
  return (process.env.ASTRAPON_SIMULATE_OUTAGE ?? "").split(",").map((s) => s.trim()).includes(host);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (status?: number) => status === undefined || status === 429 || status >= 500;

export async function fetchText(
  url: string,
  {
    timeoutMs = 60_000,
    headers = {},
    method = "GET",
    body,
    attempts = DEFAULT_ATTEMPTS,
  }: { timeoutMs?: number; headers?: Record<string, string>; method?: "GET" | "POST"; body?: string; attempts?: number } = {},
): Promise<FetchResult> {
  const host = assertAllowedUrl(url).hostname;
  const retrievedAt = new Date().toISOString();
  const started = Date.now();
  let last: Extract<FetchResult, { ok: false }> | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await acquire(host);
    try {
      if (simulatedOutage(host)) throw Object.assign(new Error(`simulated outage of ${host}`), { name: "SimulatedOutage" });
      const res = await fetch(url, { method, body, headers: { "User-Agent": USER_AGENT, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      const durationMs = Date.now() - started;
      if (!res.ok) {
        last = { ok: false, url, retrievedAt, durationMs, status: res.status, error: `HTTP ${res.status}`, bodySnippet: text.slice(0, 300), attempts: attempt };
        if (!retryable(res.status)) return last;
        const retryAfter = Number(res.headers.get("retry-after"));
        if (attempt < attempts) await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : backoff(attempt));
        continue;
      }
      return {
        ok: true,
        body: text,
        retrieval: {
          url,
          retrievedAt,
          status: res.status,
          durationMs,
          contentType: res.headers.get("content-type"),
          bodySha256: createHash("sha256").update(text).digest("hex"),
          bodyBytes: Buffer.byteLength(text),
        },
      };
    } catch (err) {
      const e = err as Error;
      const reason = e.name === "TimeoutError" ? `timed out after ${timeoutMs} ms` : `${e.name}: ${e.message}`;
      last = { ok: false, url, retrievedAt, durationMs: Date.now() - started, error: reason, attempts: attempt };
      if (attempt < attempts) await sleep(backoff(attempt));
    } finally {
      release(host);
    }
  }
  return last!;
}

/** 1 s, 4 s, 9 s … with ±20% jitter, capped at 20 s. */
function backoff(attempt: number) {
  // ASTRAPON_RETRY_BASE_MS lets deterministic tests run retries without real waiting.
  const unit = Number(process.env.ASTRAPON_RETRY_BASE_MS ?? 1000);
  const base = Math.min(20_000, unit * attempt * attempt);
  return base * (0.8 + Math.random() * 0.4);
}

/** One named validation check. Results are reported, not thrown, so callers see every failure at once. */
export type Check = { id: string; passed: boolean; detail: string };

export const check = (id: string, passed: boolean, detail: string): Check => ({ id, passed, detail });
