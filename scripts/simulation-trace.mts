/**
 * pnpm simulation:trace — LIVE end-to-end check of the simulation engine (separate from the
 * deterministic unit tests). Against the dev project and the real providers it:
 *  1. creates a throwaway confirmed user, a US farm and field (the sample outline), dated crop
 *     history, priorities and constraints;
 *  2. fetches NASA POWER and SSURGO through the worker and traces one raw POWER daily value into
 *     the stored daily series the engine reads;
 *  3. runs a scenario (Iowa NASS calendar, rainfall −20% transformation) through request_simulation
 *     and the worker, and checks the result: baseline, distinct feasible alternatives, rejections,
 *     water indicators from SSURGO AWC, pinned reference data, sensitivity and ablation;
 *  4. re-runs the same snapshot and requires an identical result hash and input digest;
 *  5. runs a scenario with an unknown crop and a crop without a window, expecting transparent
 *     rejections rather than invented values;
 *  6. deletes the throwaway user (rows cascade).
 * Writes data/verification/simulation-trace.json (no secrets, no emails).
 */
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { powerCell } from "../src/domain/evidence/footprint";
import { SAMPLE_FIELD } from "../src/domain/sample/sample-field";
import type { EngineResult } from "../src/domain/simulation/engine";
import { ENGINE_VERSION } from "../src/domain/simulation/engine-version";
import type { Database } from "../src/server/database/database.types";
import { cacheKey } from "../src/server/pipeline/cache";
import { lastCompleteMonthEnd, POWER_PIPELINE_PARAMS, POWER_START, powerChunks } from "../src/server/pipeline/power";
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
const worker = () => {
  const r = spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, "scripts", "evidence-worker.mts"), "--once"], { cwd: ROOT, env: process.env, encoding: "utf8", timeout: 20 * 60_000 });
  return `${r.stdout}${r.stderr}`.trim();
};

const email = `astrapon-test-simtrace-${randomUUID().slice(0, 8)}@example.com`;
const password = randomBytes(18).toString("base64url");
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { astrapon_test: true } });
if (created.error) throw new Error(`createUser: ${created.error.message}`);
const userId = created.data.user.id;
const trace: Record<string, unknown> = {};

try {
  const db = createClient<Database>(URL_, PUB, opts);
  if ((await db.auth.signInWithPassword({ email, password })).error) throw new Error("sign in failed");
  const farm = await db.from("farms").insert({ name: "Simulation trace farm", country_code: "US" }).select("id").single();
  const field = await db.from("fields").insert({ farm_id: farm.data!.id, name: "Simulation trace field" }).select("id").single();
  const fieldId = field.data!.id;
  await db.rpc("set_field_boundary", { p_field_id: fieldId, p_boundary: SAMPLE_FIELD.boundary as never, p_source: "farmer_drawn" });
  await db.from("crop_history").insert([
    { field_id: fieldId, season_year: 2023, season: "main", crop_name: "Corn", planted_on: "2023-05-01", harvested_on: "2023-10-15" },
    { field_id: fieldId, season_year: 2024, season: "main", crop_name: "Soybeans", planted_on: "2024-05-12", harvested_on: "2024-10-02" },
  ]);
  await db.from("field_constraints").insert({ field_id: fieldId, irrigation: "none" });
  await db.from("farmer_priorities").insert({ field_id: fieldId, water_use: 4, soil_health: 4, diversification: 3, weather_risk: 3, workload: 2, income_stability: 3 });

  // --- evidence --------------------------------------------------------------------------------
  for (const s of ["nasa-power-daily", "usda-ssurgo-sda"]) await db.rpc("request_evidence", { p_field_id: fieldId, p_source_id: s });
  const t0 = Date.now();
  const log1 = worker();
  console.log(log1.split("\n").map((l) => `  worker: ${l}`).join("\n"));
  const jobs = await db.from("evidence_jobs").select("source_id, status, error_kind").eq("field_id", fieldId);
  step("worker fetched POWER and SSURGO", (jobs.data ?? []).every((j) => j.status === "complete"), `${JSON.stringify(jobs.data?.map((j) => [j.source_id, j.status, j.error_kind]))} in ${Math.round((Date.now() - t0) / 1000)} s`);

  const ret = await db.from("evidence_retrievals").select("*").eq("field_id", fieldId).eq("source_id", "nasa-power-daily").order("created_at", { ascending: false }).limit(1).single();
  const r = ret.data!;
  const series = await db.from("evidence_daily_series").select("variable, unit, start_date, values, values_sha256").eq("retrieval_id", r.id);
  step("daily series stored with the retrieval", series.data?.length === 3 && r.processing_version === "evidence-1.1.0", `${series.data?.map((s) => `${s.variable} ${s.values.length} days from ${s.start_date}`).join("; ")}`);

  // Raw → stored daily value for one day.
  const req = r.request as { latitude: number; longitude: number };
  const end = lastCompleteMonthEnd(new Date(r.created_at));
  const day = "2015-07-15";
  const chunkRange = powerChunks(POWER_START, end).find((c) => c.start <= day && day <= c.end)!;
  const key = cacheKey({ product: "POWER/daily/point/AG", location: powerCell(req.latitude, req.longitude).key, start: chunkRange.start, end: chunkRange.end, params: POWER_PIPELINE_PARAMS.join(","), timeStandard: "LST" });
  const chunk = JSON.parse(readFileSync(path.join(process.env.ASTRAPON_CACHE_DIR || path.join(ROOT, ".cache", "evidence"), `${key}.json`), "utf8")) as { retrieval: { bodySha256: string }; body: string };
  const raw = JSON.parse(chunk.body) as { properties: { parameter: Record<string, Record<string, number>> } };
  const k = day.replaceAll("-", "");
  const idx = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${series.data![0]!.start_date}T00:00:00Z`)) / 86_400_000);
  const compare = ["T2M_MAX", "T2M_MIN", "PRECTOTCORR"].map((v) => ({ v, raw: raw.properties.parameter[v]![k], stored: series.data!.find((s) => s.variable === v)!.values[idx] }));
  step(`raw POWER ${day} values = stored daily series`, compare.every((c) => c.raw === c.stored), compare.map((c) => `${c.v} raw ${c.raw} stored ${c.stored}`).join(", "));
  trace.weather = { retrievalId: r.id, responseSha256: r.response_sha256, chunkSha256: chunk.retrieval.bodySha256, day, compare };

  // --- scenario run -----------------------------------------------------------------------------
  const settings = {
    candidateCrops: ["maize", "soybean", "oats", "winter wheat"], rotationYears: 2, replayFromYear: 2001, replayToYear: 2024, irrigationAssumption: "as_recorded",
    calendarRegion: "Iowa", plantingWindows: [], turnaroundDays: 7, precipitationChangePct: -20, temperatureChangeC: 0, notes: "",
  };
  const sc = await db.from("scenarios").insert({ field_id: fieldId, name: "Trace rotation", settings, settings_schema_version: 2 }).select("id").single();
  const run = await db.rpc("request_simulation", { p_scenario_id: sc.data!.id, p_engine_version: ENGINE_VERSION });
  step("run queued through request_simulation", !run.error && typeof run.data === "string", run.error?.message ?? String(run.data).slice(0, 8));
  const log2 = worker();
  console.log(log2.split("\n").filter((l) => l.includes("run ")).map((l) => `  worker: ${l}`).join("\n"));
  const runRow = await db.from("simulation_runs").select("id, status, snapshot_id, compute_ms, input_digest, error_message, simulation_results(result, result_sha256)").eq("id", run.data!).single();
  type Res = { result: EngineResult; result_sha256: string };
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const res = one(runRow.data?.simulation_results as unknown as Res | Res[] | null);
  step("run succeeded and stored an immutable result", runRow.data?.status === "succeeded" && Boolean(res), `${runRow.data?.status} in ${runRow.data?.compute_ms} ms ${runRow.data?.error_message ?? ""}`);
  const result = res!.result;
  const h = result.runs.find((x) => x.kind === "historical_replay")!;
  const scen = result.runs.find((x) => x.kind === "scenario");
  step("existing practice compared with ≥ 2 distinct feasible alternatives", Boolean(h.baseline) && h.alternatives.length >= 2 && h.alternatives.every((a) => a.violations.length === 0),
    `${h.baseline?.label} vs ${h.alternatives.map((a) => a.label).join(" | ")}`);
  step("water indicators use the SSURGO soil water capacity", result.soil.source.includes("SSURGO") && h.baseline?.indicators.relative_water_supply?.value != null,
    `AWC ${result.soil.awcMmPerM} mm/m; baseline relative water supply ${h.baseline?.indicators.relative_water_supply?.value}`);
  step("reference data pinned (crop parameters, NASS calendar)", result.datasets.some((d) => d.name === "crop-parameters") && result.datasets.some((d) => d.name === "usda-nass-usual-dates-2010"), result.datasets.map((d) => `${d.name} v${d.version}`).join(", "));
  step("historical replay and transformed scenario reported separately", Boolean(scen) && JSON.stringify(scen!.transformations) === JSON.stringify([{ kind: "precipitation_scale", percent: -20 }]) && h.transformations.length === 0,
    `baseline water supply ${h.baseline?.indicators.relative_water_supply?.value} → ${scen?.baseline?.indicators.relative_water_supply?.value} under −20% rainfall`);
  step("ranking explained (contributions, ablation, sensitivity, stability)", Boolean(h.comparison && h.comparison.groupsUsed.length && h.comparison.cases.length && h.comparison.ablation.length), `${h.comparison?.stability}; cases ${h.comparison?.cases.map((c) => c.id).join(",")}`);
  trace.run = { id: runRow.data!.id, computeMs: runRow.data!.compute_ms, inputDigest: runRow.data!.input_digest, resultSha256: res!.result_sha256, search: result.search, historical: { baseline: h.baseline, alternatives: h.alternatives, comparison: h.comparison }, gaps: result.gaps, assumptions: result.assumptions };

  // --- reproducibility -----------------------------------------------------------------------
  const again = await db.from("simulation_runs").insert({ snapshot_id: runRow.data!.snapshot_id, engine_version: ENGINE_VERSION }).select("id").single();
  worker();
  // A worker that could not reach the database exits without claiming; one more pass covers that.
  if ((await db.from("simulation_runs").select("status").eq("id", again.data!.id).single()).data?.status === "queued") worker();
  const rerun = await db.from("simulation_runs").select("status, input_digest, compute_ms, simulation_results(result_sha256)").eq("id", again.data!.id).single();
  const rerunSha = one(rerun.data?.simulation_results as unknown as Res | Res[] | null)?.result_sha256;
  step("re-running the same snapshot reproduces the identical result", rerun.data?.status === "succeeded" && rerunSha === res!.result_sha256 && rerun.data?.input_digest === runRow.data!.input_digest, `result ${rerunSha?.slice(0, 16)} vs ${res!.result_sha256.slice(0, 16)}`);
  trace.reproduction = { runId: again.data!.id, resultSha256: rerunSha, inputDigest: rerun.data?.input_digest, computeMs: rerun.data?.compute_ms };

  // --- transparent rejection / insufficient evidence -------------------------------------------
  const sc2 = await db.from("scenarios").insert({ field_id: fieldId, name: "Trace gaps", settings: { ...settings, candidateCrops: ["dragon fruit", "lentil", "maize"], precipitationChangePct: 0 }, settings_schema_version: 2 }).select("id").single();
  const run2 = await db.rpc("request_simulation", { p_scenario_id: sc2.data!.id, p_engine_version: ENGINE_VERSION });
  worker();
  const r2 = await db.from("simulation_results").select("result").eq("run_id", run2.data!).single();
  const rej = (r2.data?.result as unknown as EngineResult | undefined)?.search.cropRejections ?? [];
  step("unknown and window-less crops are rejected transparently", rej.some((c) => c.code === "unknown_crop") && rej.some((c) => c.code === "no_window"), rej.map((c) => `${c.crop}: ${c.code}`).join("; "));
  trace.rejections = rej;
} catch (e) {
  step("trace completed", false, (e as Error).message);
} finally {
  const del = await admin.auth.admin.deleteUser(userId);
  step("throwaway user deleted", !del.error, del.error?.message ?? "");
}

const out = path.join(ROOT, "data", "verification", "simulation-trace.json");
writeFileSync(out, `${JSON.stringify({ generatedAt: new Date().toISOString(), engineVersion: ENGINE_VERSION, note: "LIVE trace on the development project; throwaway user deleted afterwards. Ids refer to rows that no longer exist.", results, trace }, null, 2)}\n`);
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed → ${path.relative(ROOT, out)}`);
process.exitCode = results.every((x) => x.ok) ? 0 : 1;
