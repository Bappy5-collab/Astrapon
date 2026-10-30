/**
 * Canonical JSON: object keys sorted, no whitespace, `undefined` members dropped. Two values
 * with the same content always serialise identically, so their hashes can be compared to
 * decide whether a reference dataset changed.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite numbers have no canonical JSON form");
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : normalise(v)));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = normalise(v);
  }
  return out;
}
