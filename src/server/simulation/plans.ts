"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { ENGINE_VERSION } from "@/domain/simulation/engine-version";
import { getAuth } from "@/server/auth/session";
import { describeDbError } from "@/server/database/errors";
import { dispatchWorker } from "@/server/worker/dispatch";

/** `auth: true` tells the client to offer sign-in with a return path; messages never contain secrets. */
export type ActionResult = { ok: boolean; message: string; auth?: boolean; id?: string };

const uuid = z.uuid();
const weights = z.object({
  water_use: z.number().int().min(0).max(5),
  soil_health: z.number().int().min(0).max(5),
  diversification: z.number().int().min(0).max(5),
  weather_risk: z.number().int().min(0).max(5),
  workload: z.number().int().min(0).max(5),
  income_stability: z.number().int().min(0).max(5),
});
const planInput = z.object({
  runId: uuid,
  runKind: z.enum(["historical_replay", "scenario"]),
  strategyId: z.string().regex(/^(baseline|alternative-[1-9])$/),
  name: z.string().trim().min(1, "Give the plan a name").max(120),
  note: z.string().max(2000).default(""),
});

async function signedIn() {
  const auth = await getAuth();
  if (auth.state === "signed_in") return { auth };
  return {
    error: (auth.state === "unreachable"
      ? { ok: false, message: "The account service did not respond. Try again." }
      : { ok: false, message: "Your session has ended. Sign in again.", auth: true }) satisfies ActionResult,
  };
}

/**
 * Explicit "save these priorities and run again": updates the field's weights (keeping its excluded
 * crops and notes), then snapshots the scenario and queues a run. Never called without a click.
 */
export async function savePrioritiesAndRun(scenarioId: string, raw: unknown): Promise<ActionResult> {
  const u = await signedIn();
  if (u.error) return u.error;
  const w = weights.safeParse(raw);
  if (!uuid.safeParse(scenarioId).success || !w.success) return { ok: false, message: "Priorities must be whole numbers from 0 to 5." };
  const db = u.auth.supabase;
  const { data: sc, error: e1 } = await db.from("scenarios").select("field_id").eq("id", scenarioId).maybeSingle();
  if (e1) return { ok: false, message: describeDbError(e1) };
  if (!sc) return { ok: false, message: "Scenario not found." };
  const { data: current } = await db.from("farmer_priorities").select("excluded_crops, notes").eq("field_id", sc.field_id).maybeSingle();
  const { error: e2 } = await db.from("farmer_priorities").upsert({ field_id: sc.field_id, ...w.data, excluded_crops: current?.excluded_crops ?? [], notes: current?.notes ?? null });
  if (e2) return { ok: false, message: describeDbError(e2) };
  const { data: runId, error: e3 } = await db.rpc("request_simulation", { p_scenario_id: scenarioId, p_engine_version: ENGINE_VERSION });
  if (e3) return { ok: false, message: describeDbError(e3) };
  after(dispatchWorker);
  revalidatePath(`/fields/${sc.field_id}`, "layout");
  revalidatePath(`/scenarios/${scenarioId}`);
  revalidatePath("/runs");
  return { ok: true, message: "Priorities saved and a new run queued.", id: runId as string };
}

/** Saves one option of a finished run as the farmer's plan, pinned to the stored result hash. */
export async function savePlan(raw: unknown): Promise<ActionResult> {
  const u = await signedIn();
  if (u.error) return u.error;
  const p = planInput.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the plan details." };
  const db = u.auth.supabase;
  const { data: res, error: e1 } = await db.from("simulation_results").select("result_sha256").eq("run_id", p.data.runId).maybeSingle();
  if (e1) return { ok: false, message: describeDbError(e1) };
  if (!res) return { ok: false, message: "Only a finished run can be saved as a plan." };
  const { data, error } = await db
    .from("saved_plans")
    .insert({ run_id: p.data.runId, run_kind: p.data.runKind, strategy_id: p.data.strategyId, name: p.data.name, note: p.data.note, result_sha256: res.result_sha256 })
    .select("id")
    .single();
  if (error) return { ok: false, message: describeDbError(error) };
  revalidatePath(`/runs/${p.data.runId}`);
  revalidatePath("/runs");
  return { ok: true, message: "Plan saved.", id: data.id };
}

export async function updatePlan(planId: string, raw: unknown): Promise<ActionResult> {
  const u = await signedIn();
  if (u.error) return u.error;
  const p = z.object({ name: planInput.shape.name, note: planInput.shape.note }).safeParse(raw);
  if (!uuid.safeParse(planId).success || !p.success) return { ok: false, message: p.success ? "Unknown plan." : (p.error.issues[0]?.message ?? "Check the plan details.") };
  const { data, error } = await u.auth.supabase.from("saved_plans").update(p.data).eq("id", planId).select("run_id");
  if (error) return { ok: false, message: describeDbError(error) };
  if (!data.length) return { ok: false, message: "Plan not found." };
  revalidatePath(`/runs/${data[0]!.run_id}`);
  revalidatePath("/runs");
  return { ok: true, message: "Plan updated." };
}

export async function deletePlan(planId: string): Promise<ActionResult> {
  const u = await signedIn();
  if (u.error) return u.error;
  if (!uuid.safeParse(planId).success) return { ok: false, message: "Unknown plan." };
  const { data, error } = await u.auth.supabase.from("saved_plans").delete().eq("id", planId).select("run_id");
  if (error) return { ok: false, message: describeDbError(error) };
  if (!data.length) return { ok: false, message: "Plan not found." };
  revalidatePath(`/runs/${data[0]!.run_id}`);
  revalidatePath("/runs");
  return { ok: true, message: "Plan deleted." };
}

/** Deletes a run, its stored result and plans saved from it (cascade). The input snapshot is kept. */
export async function deleteRun(runId: string): Promise<ActionResult> {
  const u = await signedIn();
  if (u.error) return u.error;
  if (!uuid.safeParse(runId).success) return { ok: false, message: "Unknown run." };
  const { data, error } = await u.auth.supabase.from("simulation_runs").delete().eq("id", runId).select("id");
  if (error) return { ok: false, message: describeDbError(error) };
  if (!data.length) return { ok: false, message: "Run not found." };
  revalidatePath("/runs");
  return { ok: true, message: "Run deleted." };
}
