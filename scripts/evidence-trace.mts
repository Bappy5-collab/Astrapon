/**
 * pnpm evidence:trace — LIVE end-to-end check of the evidence pipeline (separate from the
 * deterministic unit tests). Against the dev project and the real providers it:
 *  1. creates a throwaway confirmed user, a US farm and a field (the sample outline);
 *  2. queues all three sources and runs the worker once;
 *  3. traces one real NASA POWER response: raw daily values → stored monthly/annual aggregates →
 *     the "frost days" metric the UI displays → the evidence reference pinned in a saved snapshot;
 *  4. refreshes again and confirms the snapshot did not change;
 *  5. simulates a POWER outage with an empty cache and confirms an honest failure state while the
 *     earlier data stays available;
 *  6. deletes the throwaway user (rows cascade).
 * Writes data/verification/evidence-trace.json (no secrets, no emails).
 */
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { isoFromKey } from "../src/domain/evidence/aggregate";
import { powerCell } from "../src/domain/evidence/footprint";
import { buildEvidenceView, type RetrievalMeta, type StoredAggregate } from "../src/domain/evidence/view";
import { SAMPLE_FIELD } from "../src/domain/sample/sample-field";
import type { Database } from "../src/server/database/database.types";
import { cacheKey } from "../src/server/pipeline/cache";
import { POWER_PIPELINE_PARAMS, powerChunks, lastCompleteMonthEnd, POWER_START } from "../src/server/pipeline/power";
import { loadEnv, ROOT } from "./db/connect.mts";

loadEnv();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!, PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, SECRET = process.env.SUPABASE_SECRET_KEY!;
if (!URL_ || !PUB || !SECRET) {
  console.error("SETUP REQUIRED: Supabase URL, publishable and secret keys are needed for the live trace.");
  process.exit(2);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(URL_, SECRET, opts);
const results: { step: string; ok: boolean; detail: string }[] = [];
const step = (s: string, ok: boolean, detail = "") => {
  results.push({ step: s, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${s}${detail ? ` — ${detail}` : ""}`);
};
const worker = (env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, "scripts", "evidence-worker.mts"), "--once"], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", timeout: 45 * 60_000 });
  return `${r.stdout}${r.stderr}`.trim();
};

const email = `astrapon-test-trace-${randomUUID().slice(0, 8)}@example.com`;
const password = randomBytes(18).toString("base64url");
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { astrapon_test: true } });
if (created.error) throw new Error(`createUser: ${created.error.message}`);
const userId = created.data.user.id;
const trace: Record<string, unknown> = {};

try {
  const db = createClient<Database>(URL_, PUB, opts);
  if ((await db.auth.signInWithPassword({ email, password })).error) throw new Error("sign in failed");
  const farm = await db.from("farms").insert({ name: "Trace farm", country_code: "US" }).select("id").single();
  const field = await db.from("fields").insert({ farm_id: farm.data!.id, name: "Trace field" }).select("id").single();
  const fieldId = field.data!.id;
  await db.rpc("set_field_boundary", { p_field_id: fieldId, p_boundary: SAMPLE_FIELD.boundary as never, p_source: "farmer_drawn" });
  for (const s of ["nasa-power-daily", "modis-mod13q1-ornl", "usda-ssurgo-sda"]) await db.rpc("request_evidence", { p_field_id: fieldId, p_source_id: s });
  const t0 = Date.now();
  const log1 = worker();
  console.log(log1.split("\n").map((l) => `  worker: ${l}`).join("\n"));
  const jobs = await db.from("evidence_jobs").select("source_id, status, error_kind, error_message, attempts").eq("field_id", fieldId);
  step("worker processed every queued source", (jobs.data ?? []).every((j) => j.status !== "queued" && j.status !== "running"), JSON.stringify(jobs.data?.map((j) => [j.source_id, j.status, j.error_kind])) + ` in ${Math.round((Date.now() - t0) / 1000)} s`);
  trace.jobs = jobs.data;

  // --- trace one real POWER response ------------------------------------------------------
  const ret = await db.from("evidence_retrievals").select("*").eq("field_id", fieldId).eq("source_id", "nasa-power-daily").order("created_at", { ascending: false }).limit(1).single();
  step("POWER retrieval stored", Boolean(ret.data) && ret.data!.outcome === "valid", `${ret.data?.outcome}, observations ${ret.data?.observation_start}–${ret.data?.observation_end}, fetched ${ret.data?.retrieved_at}`);
  const r = ret.data!;
  const req = r.request as { latitude: number; longitude: number; cell: string };
  const end = lastCompleteMonthEnd(new Date(r.created_at));
  const lastChunk = powerChunks(POWER_START, end).at(-1)!;
  const key = cacheKey({ product: "POWER/daily/point/AG", location: powerCell(req.latitude, req.longitude).key, start: lastChunk.start, end: lastChunk.end, params: POWER_PIPELINE_PARAMS.join(","), timeStandard: "LST" });
  const chunk = JSON.parse(readFileSync(path.join(process.env.ASTRAPON_CACHE_DIR || path.join(ROOT, ".cache", "evidence"), `${key}.json`), "utf8")) as { retrieval: { url: string; bodySha256: string; retrievedAt: string }; body: string };
  const raw = JSON.parse(chunk.body) as { properties: { parameter: Record<string, Record<string, number>> }; header: { api: { version: string }; fill_value: number } };
  const tmin = raw.properties.parameter.T2M_MIN!;
  const traceYear = Number(end.slice(0, 4)) - 1;
  const days = Object.entries(tmin).filter(([k]) => k.startsWith(String(traceYear)));
  const rawFrost = days.filter(([, v]) => v !== raw.header.fill_value && v <= 0).length;
  const jan = days.filter(([k]) => k.slice(4, 6) === "01").map(([, v]) => v).filter((v) => v !== raw.header.fill_value);
  const rawJanMean = Math.round((jan.reduce((a, b) => a + b, 0) / jan.length) * 1000) / 1000;
  const allRows: StoredAggregate[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await db.from("evidence_aggregates").select("variable, unit, aggregation, period_start, period_end, value, valid_count, expected_count, pixel").eq("retrieval_id", r.id).order("variable").order("period_start").range(from, from + 999);
    allRows.push(...((page.data ?? []) as StoredAggregate[]));
    if ((page.data ?? []).length < 1000) break;
  }
  const storedFrost = allRows.find((a) => a.variable === "frost_days" && a.period_start === `${traceYear}-01-01`);
  const storedJan = allRows.find((a) => a.variable === "T2M_MIN" && a.period_start === `${traceYear}-01-01`);
  step("chunk hash is part of the stored response hash", (r.provenance as { chunkSha256: string[] }).chunkSha256.includes(chunk.retrieval.bodySha256), chunk.retrieval.bodySha256.slice(0, 16));
  step(`raw ${traceYear} frost days = stored annual aggregate`, storedFrost?.value === rawFrost, `raw ${rawFrost} (from ${days.length} daily values), stored ${storedFrost?.value} (${storedFrost?.valid_count}/${storedFrost?.expected_count} valid)`);
  step(`raw January ${traceYear} mean T2M_MIN = stored monthly aggregate`, Number(storedJan?.value) === rawJanMean, `raw ${rawJanMean} °C, stored ${storedJan?.value} °C`);
  const view = buildEvidenceView({ retrievals: { "nasa-power-daily": { meta: r as unknown as RetrievalMeta, rows: allRows } } });
  const metric = view.metrics.find((m) => m.indicator === "frost_days")!;
  const recomputed = allRows.filter((a) => a.variable === "frost_days" && Number(a.period_start.slice(0, 4)) >= traceYear - 9 && Number(a.period_start.slice(0, 4)) <= traceYear && a.value !== null).map((a) => Number(a.value));
  const mean = Math.round((recomputed.reduce((a, b) => a + b, 0) / recomputed.length) * 10) / 10;
  step("displayed metric = mean of the stored annual values", metric.value === mean, `${metric.label}: ${metric.display} (${metric.period})`);
  trace.power = {
    request: { url: chunk.retrieval.url, cell: req.cell, cellCentre: [req.latitude, req.longitude] },
    rawChunk: { sha256: chunk.retrieval.bodySha256, fetchedAt: chunk.retrieval.retrievedAt, apiVersion: raw.header.api.version, sample: Object.fromEntries(days.slice(0, 5).map(([k, v]) => [isoFromKey(k), v])) },
    normalised: { januaryT2M_MIN: storedJan, frostDays: storedFrost, rawFrostDays: rawFrost, rawJanuaryMean: rawJanMean },
    retrieval: { id: r.id, responseSha256: r.response_sha256, productVersion: r.product_version, processingVersion: r.processing_version, observation: [r.observation_start, r.observation_end], retrievedAt: r.retrieved_at, aggregates: allRows.length },
    displayed: { indicator: metric.indicator, label: metric.label, display: metric.display, period: metric.period, comparison: metric.comparison },
  };

  // --- pin in a saved snapshot, refresh, confirm the snapshot is unchanged --------------------
  const sc = await db.from("scenarios").insert({ field_id: fieldId, name: "Trace scenario", settings: { candidateCrops: ["maize"], rotationYears: 2, replayFromYear: 2005, replayToYear: 2024, irrigationAssumption: "rainfed", notes: "" } }).select("id").single();
  const snap = await db.rpc("create_input_snapshot", { p_scenario_id: sc.data!.id, p_engine_version: "0.0.0-pre-engine" });
  const s1 = await db.from("simulation_input_snapshots").select("inputs").eq("id", snap.data!).single();
  const pin = (s1.data!.inputs as { evidence: { source_id: string; retrieval_id: string; response_sha256: string; aggregates_sha256: string }[] }).evidence.find((e) => e.source_id === "nasa-power-daily")!;
  step("snapshot pins the traced retrieval", pin.retrieval_id === r.id && pin.response_sha256 === r.response_sha256, `retrieval ${pin.retrieval_id.slice(0, 8)}, aggregates sha ${pin.aggregates_sha256.slice(0, 16)}`);
  trace.snapshot = { id: snap.data, evidence: (s1.data!.inputs as { evidence: unknown }).evidence };

  await db.rpc("request_evidence", { p_field_id: fieldId, p_source_id: "nasa-power-daily" });
  const log2 = worker();
  const s2 = await db.from("simulation_input_snapshots").select("inputs").eq("id", snap.data!).single();
  const digest = await db.rpc("evidence_aggregates_digest", { p_retrieval_id: r.id });
  step("refresh does not alter the saved snapshot", JSON.stringify(s2.data!.inputs) === JSON.stringify(s1.data!.inputs) && digest.data === pin.aggregates_sha256, log2.split("\n").filter((l) => l.includes("job")).at(-1) ?? "");

  // --- simulated outage --------------------------------------------------------------------
  const empty = mkdtempSync(path.join(tmpdir(), "fs-outage-"));
  await db.rpc("request_evidence", { p_field_id: fieldId, p_source_id: "nasa-power-daily" });
  const log3 = worker({ ASTRAPON_SIMULATE_OUTAGE: "power.larc.nasa.gov", ASTRAPON_CACHE_DIR: empty, ASTRAPON_RETRY_BASE_MS: "50" });
  rmSync(empty, { recursive: true, force: true });
  const oj = await db.from("evidence_jobs").select("status, error_kind, error_message, attempts").eq("field_id", fieldId).eq("source_id", "nasa-power-daily").order("created_at", { ascending: false }).limit(1).single();
  const still = await db.from("evidence_retrievals").select("id").eq("id", r.id).single();
  step("outage gives an honest unavailable state and keeps the earlier data", oj.data?.error_kind === "unavailable" && oj.data.status === "queued" && Boolean(still.data), `${oj.data?.status} (retry scheduled), ${oj.data?.error_message}`);
  trace.outage = { job: oj.data, worker: log3.split("\n").filter((l) => l.includes("job")) };
  await db.from("evidence_jobs").update({ status: "cancelled" }).eq("field_id", fieldId).in("status", ["queued", "running"]);
} catch (e) {
  step("trace completed", false, (e as Error).message);
} finally {
  const del = await admin.auth.admin.deleteUser(userId);
  step("throwaway user deleted", !del.error, del.error?.message ?? "");
}

const out = path.join(ROOT, "data", "verification", "evidence-trace.json");
writeFileSync(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), note: "LIVE trace on the development project; throwaway user deleted afterwards. Ids refer to rows that no longer exist.", results, trace }, null, 2)}\n`);
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed → ${path.relative(ROOT, out)}`);
process.exitCode = results.every((x) => x.ok) ? 0 : 1;
