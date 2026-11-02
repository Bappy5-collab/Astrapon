import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EngineResult } from "@/domain/simulation/engine";
import { canonicalJson } from "@/domain/reference/canonical";
import type { RunSummary, SavedPlan } from "@/domain/simulation/runs";
import type { FieldGeometry } from "@/server/farm/queries";
import type { Database } from "@/server/database/database.types";

type Db = SupabaseClient<Database>;

export type { RunSummary, SavedPlan };

const COLS = "id, snapshot_id, status, engine_version, queued_at, finished_at, error_message, compute_ms, input_digest, simulation_results(result_sha256)";

type Row = { id: string; snapshot_id: string; status: string; engine_version: string; queued_at: string; finished_at: string | null; error_message: string | null; compute_ms: number | null; input_digest: string | null; simulation_results: { result_sha256: string } | { result_sha256: string }[] | null };

function summary(r: Row): RunSummary {
  const res = Array.isArray(r.simulation_results) ? r.simulation_results[0] : r.simulation_results;
  return {
    id: r.id, snapshotId: r.snapshot_id, status: r.status as RunSummary["status"], engineVersion: r.engine_version, queuedAt: r.queued_at, finishedAt: r.finished_at,
    errorMessage: r.error_message, computeMs: r.compute_ms, inputDigest: r.input_digest, resultSha256: res?.result_sha256 ?? null,
  };
}

export async function listScenarioRuns(db: Db, scenarioId: string): Promise<RunSummary[]> {
  const { data: snaps, error: e1 } = await db.from("simulation_input_snapshots").select("id").eq("scenario_id", scenarioId);
  if (e1) throw new Error(`Could not load snapshots (${e1.code})`);
  if (!snaps.length) return [];
  const { data, error } = await db.from("simulation_runs").select(COLS).in("snapshot_id", snaps.map((s) => s.id)).order("queued_at", { ascending: false }).limit(50);
  if (error) throw new Error(`Could not load runs (${error.code})`);
  return (data as unknown as Row[]).map(summary);
}

export async function getRun(db: Db, runId: string): Promise<{ run: RunSummary; result: EngineResult | null; scenario: { id: string; name: string; fieldId: string; fieldName: string } | null } | null> {
  const { data, error } = await db.from("simulation_runs").select(COLS).eq("id", runId).maybeSingle();
  if (error) throw new Error(`Could not load the run (${error.code})`);
  if (!data) return null;
  const run = summary(data as unknown as Row);
  const { data: res } = await db.from("simulation_results").select("result").eq("run_id", runId).maybeSingle();
  const { data: snap } = await db.from("simulation_input_snapshots").select("scenario_id, scenarios(name, field_id, fields(name))").eq("id", run.snapshotId).maybeSingle();
  const sc = snap as unknown as { scenario_id: string; scenarios: { name: string; field_id: string; fields: { name: string } | null } | null } | null;
  return {
    run,
    result: (res?.result as unknown as EngineResult) ?? null,
    scenario: sc?.scenarios ? { id: sc.scenario_id, name: sc.scenarios.name, fieldId: sc.scenarios.field_id, fieldName: sc.scenarios.fields?.name ?? "" } : null,
  };
}

export async function listAllRuns(db: Db): Promise<(RunSummary & { scenarioId: string | null; scenarioName: string; fieldName: string })[]> {
  const { data, error } = await db.from("simulation_runs").select(`${COLS}, simulation_input_snapshots(scenario_id, scenarios(name, fields(name)))`).order("queued_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Could not load runs (${error.code})`);
  return (data as unknown as (Row & { simulation_input_snapshots: { scenario_id: string; scenarios: { name: string; fields: { name: string } | null } | null } | null })[]).map((r) => ({
    ...summary(r),
    scenarioId: r.simulation_input_snapshots?.scenario_id ?? null,
    scenarioName: r.simulation_input_snapshots?.scenarios?.name ?? "",
    fieldName: r.simulation_input_snapshots?.scenarios?.fields?.name ?? "",
  }));
}


const planOf = (p: { id: string; run_id: string; run_kind: string; strategy_id: string; name: string; note: string; result_sha256: string; created_at: string; updated_at: string }): SavedPlan => ({
  id: p.id, runId: p.run_id, runKind: p.run_kind as SavedPlan["runKind"], strategyId: p.strategy_id, name: p.name, note: p.note, resultSha256: p.result_sha256, createdAt: p.created_at, updatedAt: p.updated_at,
});

/**
 * Everything the run page needs, under RLS: the stored result, the scenario, whether the scenario's
 * current inputs still equal the run's frozen snapshot, the field outline for the illustrative
 * scene, and plans saved from this run.
 */
export async function getRunPage(db: Db, runId: string) {
  const base = await getRun(db, runId);
  if (!base) return null;
  const { data: snap } = await db.from("simulation_input_snapshots").select("created_at, inputs").eq("id", base.run.snapshotId).maybeSingle();
  let outdated: boolean | null = null;
  let geometry: FieldGeometry | null = null;
  if (base.scenario) {
    const [current, geo] = await Promise.all([
      db.rpc("assemble_scenario_inputs", { p_scenario_id: base.scenario.id }),
      db.rpc("field_geometry", { p_field_id: base.scenario.fieldId }),
    ]);
    if (!current.error && snap) outdated = canonicalJson(current.data) !== canonicalJson(snap.inputs);
    if (!geo.error) geometry = (geo.data as unknown as FieldGeometry | null) ?? null;
  }
  const { data: plans, error } = await db.from("saved_plans").select("*").eq("run_id", runId).order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load plans (${error.code})`);
  return { ...base, snapshotCreatedAt: snap?.created_at ?? null, outdated, geometry, plans: plans.map(planOf) };
}

/** All saved plans with their run's scenario and field names (Saved runs page). */
export async function listPlans(db: Db): Promise<(SavedPlan & { scenarioName: string; fieldName: string })[]> {
  const { data, error } = await db
    .from("saved_plans")
    .select("*, simulation_runs(simulation_input_snapshots(scenarios(name, fields(name))))")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load plans (${error.code})`);
  return data.map((p) => {
    const sc = (p.simulation_runs as unknown as { simulation_input_snapshots: { scenarios: { name: string; fields: { name: string } | null } | null } | null } | null)?.simulation_input_snapshots?.scenarios;
    return { ...planOf(p), scenarioName: sc?.name ?? "", fieldName: sc?.fields?.name ?? "" };
  });
}
