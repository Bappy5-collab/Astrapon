import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EngineResult } from "@/domain/simulation/engine";
import { demandFromResult, type RunDemand } from "@/domain/water/demand";
import type { PlannerInput, PlannerResult } from "@/domain/water/plan";
import type { Database } from "@/server/database/database.types";

type Db = SupabaseClient<Database>;

export type FieldRunDemand = { runId: string; resultSha256: string; scenarioName: string; finishedAt: string | null; engineVersion: string; demand: RunDemand };

/** Finished comparisons of this field, newest first, with the demand derived from each stored result. */
export async function listFieldRunDemands(db: Db, fieldId: string, limit = 6): Promise<FieldRunDemand[]> {
  const { data: snaps, error: e1 } = await db.from("simulation_input_snapshots").select("id, scenarios(name)").eq("field_id", fieldId);
  if (e1) throw new Error(`Could not load comparisons (${e1.code})`);
  if (!snaps.length) return [];
  const names = new Map(snaps.map((s) => [s.id, (s.scenarios as unknown as { name: string } | null)?.name ?? "Comparison"]));
  const { data: runs, error: e2 } = await db
    .from("simulation_runs")
    .select("id, snapshot_id, finished_at, engine_version, simulation_results(result, result_sha256)")
    .in("snapshot_id", [...names.keys()])
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(limit);
  if (e2) throw new Error(`Could not load comparisons (${e2.code})`);
  const out: FieldRunDemand[] = [];
  for (const r of runs) {
    const res = (Array.isArray(r.simulation_results) ? r.simulation_results[0] : r.simulation_results) as { result: unknown; result_sha256: string } | null;
    if (!res) continue;
    out.push({ runId: r.id, resultSha256: res.result_sha256, scenarioName: names.get(r.snapshot_id) ?? "Comparison", finishedAt: r.finished_at, engineVersion: r.engine_version, demand: demandFromResult(res.result as EngineResult) });
  }
  return out;
}

export type WaterPlanRow = { id: string; version: number; name: string; modelVersion: string; runId: string | null; createdAt: string; inputsSha256: string; resultSha256: string; inputs: PlannerInput; evidence: Record<string, unknown>; result: PlannerResult };

export async function listWaterPlans(db: Db, fieldId: string): Promise<WaterPlanRow[]> {
  const { data, error } = await db.from("water_energy_plans").select("*").eq("field_id", fieldId).order("version", { ascending: false }).limit(30);
  if (error) throw new Error(`Could not load saved water plans (${error.code})`);
  return data.map((r) => ({ id: r.id, version: r.version, name: r.name, modelVersion: r.model_version, runId: r.run_id, createdAt: r.created_at, inputsSha256: r.inputs_sha256, resultSha256: r.result_sha256, inputs: r.inputs as unknown as PlannerInput, evidence: r.evidence as Record<string, unknown>, result: r.result as unknown as PlannerResult }));
}

export async function getWaterPlan(db: Db, planId: string): Promise<(WaterPlanRow & { fieldId: string }) | null> {
  const { data, error } = await db.from("water_energy_plans").select("*").eq("id", planId).maybeSingle();
  if (error) throw new Error(`Could not load the water plan (${error.code})`);
  if (!data) return null;
  return { id: data.id, fieldId: data.field_id, version: data.version, name: data.name, modelVersion: data.model_version, runId: data.run_id, createdAt: data.created_at, inputsSha256: data.inputs_sha256, resultSha256: data.result_sha256, inputs: data.inputs as unknown as PlannerInput, evidence: data.evidence as Record<string, unknown>, result: data.result as unknown as PlannerResult };
}
