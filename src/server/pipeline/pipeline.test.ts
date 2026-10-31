/**
 * Deterministic pipeline tests. No network: global fetch is replaced by a generator that returns
 * POWER-shaped responses (TEST DATA, synthetic) and the cache points at a temporary directory.
 * Live behaviour is checked separately by `pnpm evidence:trace` and the worker.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildEvidenceView, sourceState, type RetrievalMeta, type StoredAggregate } from "@/domain/evidence/view";
import { SAMPLE_FIELD } from "@/domain/sample/sample-field";
import { assertAllowedUrl, fetchText } from "@/server/providers/http";

const dir = mkdtempSync(path.join(tmpdir(), "fs-evidence-"));
process.env.ASTRAPON_CACHE_DIR = dir;
process.env.ASTRAPON_RETRY_BASE_MS = "1";

const { lastCompleteMonthEnd, powerChunks, runPower } = await import("./power");
const { gridKm } = await import("./modis");
const { PipelineError } = await import("./types");

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Synthetic POWER day values: cold winters, a 20-day dry spell each July, one fill day per year. */
function syntheticPower(url: URL) {
  const start = url.searchParams.get("start")!;
  const end = url.searchParams.get("end")!;
  const params = url.searchParams.get("parameters")!.split(",");
  const lat = Number(url.searchParams.get("latitude"));
  const lon = Number(url.searchParams.get("longitude"));
  const iso = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
  const days: string[] = [];
  for (let d = new Date(`${iso(start)}T00:00:00Z`); d <= new Date(`${iso(end)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10).replaceAll("-", ""));
  const units: Record<string, string> = { T2M: "C", T2M_MAX: "C", T2M_MIN: "C", PRECTOTCORR: "mm/day", GWETROOT: "1" };
  const value = (p: string, k: string) => {
    const m = Number(k.slice(4, 6)), dd = Number(k.slice(6, 8));
    if (m === 3 && dd === 3) return -999; // one missing day per year
    if (p === "T2M_MIN") return m <= 2 ? -5 : 8; // 59/60 frost days in Jan–Feb
    if (p === "T2M_MAX") return m === 7 && dd <= 3 ? 36 : 25; // 3 hot days
    if (p === "T2M") return 10;
    if (p === "PRECTOTCORR") return m === 7 && dd >= 5 && dd <= 24 ? 0 : 2; // 20-day dry spell
    return 0.5;
  };
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat, 300] },
    properties: { parameter: Object.fromEntries(params.map((p) => [p, Object.fromEntries(days.map((k) => [k, value(p, k)]))])) },
    header: { title: "TEST DATA (synthetic)", api: { version: "v2.10.1", name: "POWER Daily API" }, sources: ["MERRA2"], fill_value: -999, time_standard: "LST", start, end },
    messages: [],
    parameters: Object.fromEntries(params.map((p) => [p, { units: units[p], longname: p }])),
  };
}

let calls = 0;
let mode: "ok" | "down" = "ok";
beforeAll(() => {
  vi.stubGlobal("fetch", async (input: string) => {
    calls++;
    if (mode === "down") throw new TypeError("fetch failed");
    const url = new URL(input);
    return new Response(JSON.stringify(syntheticPower(url)), { status: 200, headers: { "content-type": "application/json" } });
  });
});
beforeEach(() => {
  calls = 0;
  mode = "ok";
});

const ctx = { fieldId: "f", centroid: { lat: 42.0985, lon: -93.8015 }, boundary: SAMPLE_FIELD.boundary, countryCode: "US" };
const NOW = new Date("2026-10-31T12:00:00Z");

describe("network guard", () => {
  it("allows only listed provider hosts over https", () => {
    expect(() => assertAllowedUrl("https://power.larc.nasa.gov/api/x")).not.toThrow();
    expect(() => assertAllowedUrl("https://evil.example.com/")).toThrow(/not an allowlisted/);
    expect(() => assertAllowedUrl("http://power.larc.nasa.gov/")).toThrow();
  });

  it("retries a failing host a bounded number of times", async () => {
    mode = "down";
    const r = await fetchText("https://power.larc.nasa.gov/api/temporal/daily/point?x=1", { attempts: 3 });
    expect(r.ok).toBe(false);
    expect(calls).toBe(3);
  });
});

describe("POWER pipeline (synthetic responses)", () => {
  it("chunks the full record into decades ending at the last complete month", () => {
    expect(lastCompleteMonthEnd(NOW)).toBe("2026-09-30");
    const c = powerChunks("1981-01-01", "2026-09-30");
    expect(c[0]).toEqual({ start: "1981-01-01", end: "1990-12-31" });
    expect(c.at(-1)).toEqual({ start: "2021-01-01", end: "2026-09-30" });
  });

  it("normalises, aggregates and computes indicators without filling gaps", async () => {
    const out = await runPower(ctx, () => {}, NOW);
    const r = out.retrieval;
    expect(r.outcome).toBe("valid");
    expect(r.observationStart).toBe("1981-01-01");
    expect(r.observationEnd).toBe("2026-09-30");
    expect(r.request).toMatchObject({ cell: "power:84:-150", latitude: 42, longitude: -93.75 });
    expect(r.responseSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.retrievedAt <= new Date().toISOString()).toBe(true);
    const find = (v: string, start: string) => out.aggregates.find((a) => a.variable === v && a.periodStart === start)!;
    // March has one fill day: 30/31 valid ≥ 90%, so the month is reported with its counts.
    expect(find("T2M_MIN", "2024-03-01")).toMatchObject({ value: 8, validCount: 30, expectedCount: 31 });
    // Precipitation sum over 30 valid days is not scaled up to 31.
    expect(find("PRECTOTCORR", "2024-03-01")).toMatchObject({ value: 60, unit: "mm" });
    expect(find("frost_days", "2024-01-01")).toMatchObject({ value: 60, aggregation: "count" });
    expect(find("heat_days", "2023-01-01").value).toBe(3);
    expect(find("dry_spell_longest", "2023-01-01").value).toBe(20);
    expect(find("dry_spells_10d", "2023-01-01").value).toBe(1);
    // The incomplete current year (2026) is not counted.
    expect(out.aggregates.find((a) => a.variable === "frost_days" && a.periodStart === "2026-01-01")).toBeUndefined();
  });

  it("reuses cached chunks (resumable) and reports an outage honestly", async () => {
    await runPower(ctx, () => {}, NOW);
    expect(calls).toBe(0); // every chunk came from the cache written by the previous test
    rmSync(dir, { recursive: true, force: true });
    mode = "down";
    await expect(runPower(ctx, () => {}, NOW)).rejects.toMatchObject({ kind: "unavailable" });
    await expect(runPower(ctx, () => {}, NOW)).rejects.toBeInstanceOf(PipelineError);
  });
});

describe("evidence view", () => {
  const meta = (source: RetrievalMeta["source_id"], retrieved: string): RetrievalMeta => ({
    id: `${source}-r`, source_id: source, product_id: "p", product_version: "1", processing_version: "evidence-1.0.0", evidence_class: "assimilated_model_product",
    spatial_support: "cell", retrieved_at: retrieved, created_at: retrieved, observation_start: "1981-01-01", observation_end: "2025-12-31", outcome: "valid",
    response_sha256: "a".repeat(64), response_bytes: 1, cache_key: null, request: {}, provenance: {}, checks: [],
  });
  const yearRow = (variable: string, year: number, value: number | null): StoredAggregate => ({ variable, unit: "days", aggregation: "count", period_start: `${year}-01-01`, period_end: `${year}-12-31`, value, valid_count: 365, expected_count: 365, pixel: "" });

  it("averages the last ten complete years and compares with 1991–2020", () => {
    const rows = Array.from({ length: 45 }, (_, i) => yearRow("frost_days", 1981 + i, 1981 + i >= 2016 ? 100 : 120));
    const v = buildEvidenceView({ retrievals: { "nasa-power-daily": { meta: meta("nasa-power-daily", "2026-10-01T00:00:00Z"), rows } } });
    const m = v.metrics.find((x) => x.indicator === "frost_days")!;
    expect(m).toMatchObject({ value: 100, period: "2016–2025 average (10 complete years)", status: "ok" });
    // The 1991–2020 baseline includes 2016–2020 (100) and 25 earlier years (120).
    expect(m.comparison).toContain("117");
  });

  it("marks stale data and keeps it visible when a refresh fails", () => {
    const old = meta("nasa-power-daily", "2026-08-01T00:00:00Z");
    expect(sourceState("nasa-power-daily", old, null, NOW).status).toBe("stale");
    const failedJob = { id: "j", status: "failed", attempts: 3, max_attempts: 3, progress: {}, error_kind: "unavailable", error_message: "down", created_at: "", started_at: "", finished_at: "", next_attempt_at: "" };
    const s = sourceState("nasa-power-daily", meta("nasa-power-daily", "2026-10-30T00:00:00Z"), failedJob, NOW);
    expect(s).toMatchObject({ status: "stale", stale: true });
    expect(s.retrieval).not.toBeNull();
    expect(sourceState("nasa-power-daily", null, failedJob, NOW).status).toBe("failed");
  });
});

describe("MODIS grid size", () => {
  it("covers the field with whole-km half widths, capped", () => {
    expect(gridKm(450)).toBe(1);
    expect(gridKm(3500)).toBe(2);
    expect(gridKm(6000)).toBe(4);
    expect(gridKm(30000)).toBe(4);
  });
});
