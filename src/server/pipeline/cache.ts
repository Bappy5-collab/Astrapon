import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Retrieval } from "@/server/providers/http";

/**
 * On-disk cache of raw provider responses, one file per request chunk. Raw responses never go
 * into PostgreSQL. Keys include product, location key, period and request parameters, so a
 * cached chunk is only reused for exactly the same request. Writes are atomic (temp + rename),
 * which makes jobs resumable: a restarted job skips chunks it already downloaded.
 */

const DIR = process.env.ASTRAPON_CACHE_DIR || path.join(process.cwd(), ".cache", "evidence");

export type CachedChunk = { key: string; retrieval: Retrieval; body: string; cachedAt: string };

export const cacheKey = (parts: Record<string, string | number>) =>
  createHash("sha256")
    .update(JSON.stringify(Object.entries(parts).sort(([a], [b]) => a.localeCompare(b))))
    .digest("hex");

export async function readChunk(key: string, maxAgeMs: number): Promise<CachedChunk | null> {
  try {
    const c = JSON.parse(await readFile(path.join(DIR, `${key}.json`), "utf8")) as CachedChunk;
    if (Date.now() - Date.parse(c.cachedAt) > maxAgeMs) return null;
    // Integrity: the body must still match the hash recorded at retrieval time.
    if (createHash("sha256").update(c.body).digest("hex") !== c.retrieval.bodySha256) return null;
    return c;
  } catch {
    return null;
  }
}

export async function writeChunk(key: string, retrieval: Retrieval, body: string): Promise<void> {
  await mkdir(DIR, { recursive: true });
  const file = path.join(DIR, `${key}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify({ key, retrieval, body, cachedAt: new Date().toISOString() } satisfies CachedChunk));
  await rename(tmp, file);
}

/** Historical chunks are stable; the chunk containing recent dates is refreshed after a day. */
export function chunkMaxAge(chunkEnd: string, now = new Date()): number {
  const ageDays = (now.getTime() - Date.parse(`${chunkEnd}T00:00:00Z`)) / 86_400_000;
  return ageDays > 120 ? 365 * 86_400_000 : 86_400_000;
}

export function combinedSha(shas: string[]): string {
  return createHash("sha256").update(shas.join("\n")).digest("hex");
}
