import { createHash } from "node:crypto";

/**
 * Minimal HTTP retrieval record used by every provider. It keeps what is needed
 * to trace a value back to the exact response: URL, time, status, and a hash of
 * the body. Provider modules here call only public, credential-free endpoints;
 * anything needing a secret must read it via `@/server/env` (server-only).
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
  | { ok: false; url: string; retrievedAt: string; durationMs: number; error: string; status?: number; bodySnippet?: string };

export async function fetchText(
  url: string,
  { timeoutMs = 60_000, headers = {} }: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const retrievedAt = new Date().toISOString();
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": "FieldShift-dev/0.1 (+verification)", ...headers }, signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.text();
    const durationMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, url, retrievedAt, durationMs, status: res.status, error: `HTTP ${res.status}`, bodySnippet: body.slice(0, 300) };
    }
    return {
      ok: true,
      body,
      retrieval: {
        url,
        retrievedAt,
        status: res.status,
        durationMs,
        contentType: res.headers.get("content-type"),
        bodySha256: createHash("sha256").update(body).digest("hex"),
        bodyBytes: Buffer.byteLength(body),
      },
    };
  } catch (err) {
    const e = err as Error;
    const reason = e.name === "TimeoutError" ? `timed out after ${timeoutMs} ms` : `${e.name}: ${e.message}`;
    return { ok: false, url, retrievedAt, durationMs: Date.now() - started, error: reason };
  }
}

/** One named validation check. Results are reported, not thrown, so callers see every failure at once. */
export type Check = { id: string; passed: boolean; detail: string };

export const check = (id: string, passed: boolean, detail: string): Check => ({ id, passed, detail });
