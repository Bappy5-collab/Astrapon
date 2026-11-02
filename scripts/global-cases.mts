/**
 * pnpm global:cases — LIVE, reproducible acceptance cases in three contrasting climates, run through
 * the real application path (RLS client, request_evidence, the worker, request_simulation, stored
 * results). For each case it:
 *  1. creates a throwaway user, farm and field with a small drawn boundary;
 *  2. records dated crop history and, where no regional calendar exists, planting windows that are
 *     SUPPLIED TEST ASSUMPTIONS (labelled as such in the output, not agronomic advice);
 *  3. fetches NASA POWER (and SSURGO in the US) through the worker;
 *  4. runs the scenario, re-runs the same snapshot, and requires an identical result hash;
 *  5. records the comparison, gaps and assumptions to data/verification/global-cases.json.
 * The throwaway users are deleted afterwards. Three cases are software acceptance checks across
 * climates; they are not validation of agronomic advice anywhere.
 */
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import type { EngineResult } from "../src/domain/simulation/engine";
import { ENGINE_VERSION } from "../src/domain/simulation/engine-version";
import type { Database } from "../src/server/database/database.types";
import { loadEnv, ROOT } from "./db/connect.mts";

loadEnv();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!, PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, SECRET = process.env.SUPABASE_SECRET_KEY!;
if (!URL_ || !PUB || !SECRET) {
  console.error("SETUP REQUIRED: Supabase URL, publishable and secret keys are needed for the live cases.");
  process.exit(2);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(URL_, SECRET, opts);
const worker = () => {
  const r = spawnSync(process.execPath, ["--import", "tsx", path.join(ROOT, "scripts", "evidence-worker.mts"), "--once"], { cwd: ROOT, env: process.env, encoding: "utf8", timeout: 20 * 60_000 });
  return `${r.stdout}${r.stderr}`.trim();
};
const square = (lon: number, lat: number, d = 0.002) => ({ type: "Polygon", coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });

type Window = { crop: string; plantFrom: string; plantTo: string; lengthDays: number };
type Case = {
  id: string;
  place: string;
  climate: string;
  hemisphere: "north" | "south";
  country: string;
  lonLat: [number, number];
  sources: string[];
  history: { season_year: number; season: string; crop_name: string; planted_on: string; harvested_on: string }[];
  settings: { candidateCrops: string[]; rotationYears: number; calendarRegion: string | null; plantingWindows: Window[]; turnaroundDays: number };
  soilTest?: { awcCmPerCm: number; note: string };
  assumptions: string[];
};

const CASES: Case[] = [
  {
    id: "us-iowa",
    place: "Central Iowa, USA (42.0° N, 93.8° W)",
    climate: "Humid continental; summer crops; one crop per year",
    hemisphere: "north",
    country: "US",
    lonLat: [-93.8042, 42.0966],
    sources: ["nasa-power-daily", "usda-ssurgo-sda"],
    history: [
      { season_year: 2023, season: "main", crop_name: "Corn", planted_on: "2023-05-01", harvested_on: "2023-10-15" },
      { season_year: 2024, season: "main", crop_name: "Soybeans", planted_on: "2024-05-12", harvested_on: "2024-10-02" },
    ],
    settings: { candidateCrops: ["maize", "soybean", "oats", "winter wheat"], rotationYears: 2, calendarRegion: "Iowa", plantingWindows: [], turnaroundDays: 7 },
    assumptions: ["Crop history (corn 2023, soybeans 2024, with dates) is a test record, not a real farm.", "Planting windows come from the USDA NASS 2010 Iowa calendar (a published regional calendar)."],
  },
  {
    id: "bd-mymensingh",
    place: "Mymensingh, Bangladesh (24.75° N, 90.40° E)",
    climate: "Tropical monsoon; several crops per year; paddy rice",
    hemisphere: "north",
    country: "BD",
    lonLat: [90.4, 24.75],
    sources: ["nasa-power-daily"],
    history: [
      { season_year: 2024, season: "winter", crop_name: "Boro rice", planted_on: "2024-01-15", harvested_on: "2024-05-10" },
      { season_year: 2024, season: "summer", crop_name: "Aman rice", planted_on: "2024-07-20", harvested_on: "2024-11-15" },
    ],
    settings: {
      candidateCrops: ["rice", "jute", "lentil", "mustard", "wheat", "maize"],
      rotationYears: 1,
      calendarRegion: null,
      plantingWindows: [
        { crop: "jute", plantFrom: "03-20", plantTo: "04-10", lengthDays: 110 },
        { crop: "lentil", plantFrom: "11-15", plantTo: "12-05", lengthDays: 105 },
        { crop: "mustard", plantFrom: "11-01", plantTo: "11-20", lengthDays: 90 },
        { crop: "wheat", plantFrom: "11-15", plantTo: "12-05", lengthDays: 115 },
        { crop: "maize", plantFrom: "11-15", plantTo: "12-10", lengthDays: 145 },
      ],
      turnaroundDays: 10,
    },
    assumptions: [
      "No regional planting calendar is available for Bangladesh in Astrapon; every planting window here is a SUPPLIED TEST ASSUMPTION typed as a farmer would, not a sourced calendar.",
      "Crop history (Boro and Aman rice in 2024, with dates) is a test record.",
      "No soil water capacity (no SSURGO outside the US, no soil test): water results are potential demand only.",
    ],
  },
  {
    id: "au-wagga",
    place: "Wagga Wagga, New South Wales, Australia (35.1° S, 147.4° E)",
    climate: "Temperate semi-arid, Southern Hemisphere; winter cropping (autumn sowing)",
    hemisphere: "south",
    country: "AU",
    lonLat: [147.37, -35.1],
    sources: ["nasa-power-daily"],
    history: [
      { season_year: 2023, season: "winter", crop_name: "Wheat", planted_on: "2023-05-10", harvested_on: "2023-11-30" },
      { season_year: 2024, season: "winter", crop_name: "Canola", planted_on: "2024-04-25", harvested_on: "2024-11-20" },
    ],
    settings: {
      candidateCrops: ["wheat", "barley", "canola", "lentil", "field pea"],
      rotationYears: 2,
      calendarRegion: null,
      plantingWindows: [
        { crop: "wheat", plantFrom: "05-01", plantTo: "05-31", lengthDays: 195 },
        { crop: "barley", plantFrom: "05-01", plantTo: "06-05", lengthDays: 185 },
        { crop: "canola", plantFrom: "04-15", plantTo: "05-10", lengthDays: 205 },
        { crop: "lentil", plantFrom: "05-10", plantTo: "06-10", lengthDays: 170 },
        { crop: "field pea", plantFrom: "05-10", plantTo: "06-10", lengthDays: 165 },
      ],
      turnaroundDays: 14,
    },
    soilTest: { awcCmPerCm: 0.14, note: "SUPPLIED TEST ASSUMPTION entered as a farmer report (0–100 cm), not a measurement." },
    assumptions: [
      "No regional planting calendar is available for Australia in Astrapon; every planting window is a SUPPLIED TEST ASSUMPTION, not a sourced calendar.",
      "Crop history (wheat 2023, canola 2024, with dates) is a test record.",
      "Soil water capacity 0.14 cm/cm is a SUPPLIED TEST ASSUMPTION entered as a farmer report.",
    ],
  },
];

const out: Record<string, unknown>[] = [];
const users: string[] = [];
let passed = 0;
let total = 0;
const check = (c: Case, name: string, ok: boolean, detail = "") => {
  total++;
  if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"}  [${c.id}] ${name}${detail ? ` — ${detail}` : ""}`);
  return { name, ok, detail };
};

try {
  for (const c of CASES) {
    const checks: ReturnType<typeof check>[] = [];
    const email = `astrapon-test-global-${c.id}-${randomUUID().slice(0, 6)}@example.com`;
    const password = randomBytes(18).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { astrapon_test: true } });
    if (created.error) throw new Error(`createUser: ${created.error.message}`);
    users.push(created.data.user.id);
    const db = createClient<Database>(URL_, PUB, opts);
    if ((await db.auth.signInWithPassword({ email, password })).error) throw new Error("sign in failed");

    const farm = await db.from("farms").insert({ name: `Global case ${c.id}`, country_code: c.country }).select("id").single();
    const field = await db.from("fields").insert({ farm_id: farm.data!.id, name: c.place }).select("id").single();
    const fieldId = field.data!.id;
    const b = await db.rpc("set_field_boundary", { p_field_id: fieldId, p_boundary: square(...c.lonLat) as never, p_source: "farmer_drawn" });
    checks.push(check(c, "field boundary saved", !b.error, b.error?.message ?? ""));
    await db.from("crop_history").insert(c.history.map((h) => ({ field_id: fieldId, ...h })));
    await db.from("field_constraints").insert({ field_id: fieldId, irrigation: "none" });
    if (c.soilTest)
      await db.from("soil_observations").insert({ field_id: fieldId, observed_on: "2024-06-01", property: "available_water_capacity", value_numeric: c.soilTest.awcCmPerCm, unit: "cm/cm", depth_top_cm: 0, depth_bottom_cm: 100, evidence_class: "farmer_report", method: "test assumption" });

    for (const s of c.sources) await db.rpc("request_evidence", { p_field_id: fieldId, p_source_id: s });
    const t0 = Date.now();
    worker();
    const jobs = await db.from("evidence_jobs").select("source_id, status, error_message").eq("field_id", fieldId);
    checks.push(check(c, "evidence retrieved through the worker", (jobs.data ?? []).every((j) => j.status === "complete"), `${JSON.stringify(jobs.data?.map((j) => [j.source_id, j.status]))} in ${Math.round((Date.now() - t0) / 1000)} s`));
    const power = await db.from("evidence_retrievals").select("observation_start, observation_end, spatial_support, product_version").eq("field_id", fieldId).eq("source_id", "nasa-power-daily").limit(1).maybeSingle();

    const settings = { ...c.settings, replayFromYear: 2006, replayToYear: 2025, irrigationAssumption: "as_recorded", precipitationChangePct: -20, temperatureChangeC: 0, notes: "" };
    const sc = await db.from("scenarios").insert({ field_id: fieldId, name: `Global case ${c.id}`, settings, settings_schema_version: 2 }).select("id").single();
    const run = await db.rpc("request_simulation", { p_scenario_id: sc.data!.id, p_engine_version: ENGINE_VERSION });
    worker();
    const res = await db.from("simulation_results").select("result, result_sha256").eq("run_id", run.data!).maybeSingle();
    const result = res.data?.result as unknown as EngineResult | undefined;
    checks.push(check(c, "run succeeded and stored a result", Boolean(result && result.status === "ok"), result?.messages[0] ?? ""));
    if (!result) {
      out.push({ id: c.id, place: c.place, checks });
      continue;
    }
    const replay = result.runs.find((r) => r.kind === "historical_replay")!;
    const scen = result.runs.find((r) => r.kind === "scenario");
    const opts2 = [...(replay.baseline ? [replay.baseline] : []), ...replay.alternatives];
    checks.push(check(c, "existing practice built from dated history", Boolean(replay.baseline), replay.baseline?.label ?? "none"));
    checks.push(check(c, "feasible alternatives found (target two; never invented)", replay.alternatives.length >= 1, `${replay.alternatives.length}: ${replay.alternatives.map((a) => a.label).join(" | ")}`));
    checks.push(check(c, "historical replay and −20 % rainfall scenario reported separately", Boolean(scen) && scen!.transformations.length === 1));
    checks.push(check(c, "day-by-day timeline stored", Boolean(replay.timeline), replay.timeline ? `${replay.timeline.startDate}, ${replay.timeline.days} days` : (replay.timelineNote ?? "")));

    // Reproducibility: re-run the same snapshot.
    const snap = await db.from("simulation_runs").select("snapshot_id").eq("id", run.data!).single();
    const again = await db.from("simulation_runs").insert({ snapshot_id: snap.data!.snapshot_id, engine_version: ENGINE_VERSION }).select("id").single();
    worker();
    const res2 = await db.from("simulation_results").select("result_sha256").eq("run_id", again.data!.id).maybeSingle();
    checks.push(check(c, "re-run of the same snapshot is identical", res2.data?.result_sha256 === res.data!.result_sha256, `${res.data!.result_sha256.slice(0, 12)} vs ${res2.data?.result_sha256.slice(0, 12)}`));

    const ind = (o: (typeof opts2)[number], k: string) => o.indicators[k]?.value ?? null;
    out.push({
      id: c.id,
      place: c.place,
      climate: c.climate,
      hemisphere: c.hemisphere,
      evidence: { power: power.data, soil: result.soil, sources: c.sources },
      suppliedAssumptions: c.assumptions,
      plantingWindowsSupplied: c.settings.plantingWindows,
      calendarRegion: c.settings.calendarRegion ?? "none available",
      engineVersion: result.engineVersion,
      period: result.period,
      resultSha256: res.data!.result_sha256,
      ranking: replay.comparison?.ranking.map((id) => {
        const o = opts2.find((x) => x.id === id)!;
        return {
          id,
          label: o.label,
          relativeScore: replay.comparison!.scores[id],
          relativeWaterSupply: ind(o, "relative_water_supply"),
          climaticWaterBalance: ind(o, "climatic_water_balance"),
          bareDays: ind(o, "bare_days"),
          frostDays: ind(o, "frost_days"),
          hotDays: ind(o, "hot_days"),
        };
      }),
      stability: replay.comparison?.stability ?? null,
      scenarioTopUnderMinus20: scen?.comparison?.ranking[0] ?? null,
      cropRejections: result.search.cropRejections.map((r) => `${r.crop}: ${r.code}`),
      gaps: result.gaps,
      reviewQuestions: result.reviewQuestions,
      label: "Exploratory comparison for software acceptance. Not validated agronomic advice for this location.",
      checks,
    });
  }
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  console.log(`throwaway users deleted: ${users.length}`);
}
const file = path.join(ROOT, "data", "verification", "global-cases.json");
writeFileSync(file, `${JSON.stringify({ generatedAt: new Date().toISOString(), engineVersion: ENGINE_VERSION, note: "LIVE run on the development project with real NASA POWER (and SSURGO in the US). Throwaway users deleted afterwards. Supplied test assumptions are labelled. Not agronomic validation.", passed, total, cases: out }, null, 2)}\n`);
console.log(`\n${passed}/${total} passed → ${path.relative(ROOT, file)}`);
process.exitCode = passed === total ? 0 : 1;
