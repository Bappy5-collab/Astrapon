"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { BoundaryGeometry } from "@/domain/geo/boundary";
import { boundaryOrigin } from "@/domain/geo/local-frame";
import { canonicalJson } from "@/domain/reference/canonical";
import { demandFromResult } from "@/domain/water/demand";
import { computeWaterEnergy, plannerInputSchema, WATER_MODEL_VERSION } from "@/domain/water/plan";
import { WaterInputError } from "@/domain/water/pump";
import { getAuth } from "@/server/auth/session";
import { describeDbError } from "@/server/database/errors";
import { reverseCountry } from "@/server/geocode/nominatim";
import { getRun } from "@/server/simulation/queries";

import { lookupGroundwater, lookupSolar, lookupSurfaceWater, type GroundwaterLookup, type SurfaceLookup } from "./lookup";
import type { SolarOutcome } from "@/domain/water/lookup-types";

export type WaterActionError = { ok: false; message: string; auth?: boolean };
const uuid = z.uuid();

async function ownedField(fieldId: string): Promise<{ field: BoundaryGeometry; db: Extract<Awaited<ReturnType<typeof getAuth>>, { state: "signed_in" }>["supabase"] } | WaterActionError> {
  const auth = await getAuth();
  if (auth.state === "unreachable") return { ok: false, message: "The account service did not respond. Try again." };
  if (auth.state !== "signed_in") return { ok: false, message: "Your session has ended. Sign in again.", auth: true };
  if (!uuid.safeParse(fieldId).success) return { ok: false, message: "Field not found." };
  // RLS: field_geometry returns nothing for another user's field.
  const { data, error } = await auth.supabase.rpc("field_geometry", { p_field_id: fieldId });
  if (error) return { ok: false, message: describeDbError(error) };
  const boundary = (data as unknown as { boundary: BoundaryGeometry | null } | null)?.boundary ?? null;
  if (!boundary) return { ok: false, message: "Draw the field boundary first." };
  return { field: boundary, db: auth.supabase };
}

export async function findSurfaceWater(fieldId: string, radiusM: number): Promise<SurfaceLookup | WaterActionError> {
  const f = await ownedField(fieldId);
  if ("ok" in f) return f;
  if (!Number.isFinite(radiusM)) return { ok: false, message: "Choose a search radius." };
  return lookupSurfaceWater(f.field, Math.round(radiusM));
}

export async function findGroundwater(fieldId: string, radiusM: number): Promise<GroundwaterLookup | WaterActionError> {
  const f = await ownedField(fieldId);
  if ("ok" in f) return f;
  if (!Number.isFinite(radiusM)) return { ok: false, message: "Choose a search radius." };
  const [lon, lat] = boundaryOrigin(f.field);
  const hint = await reverseCountry(lat, lon);
  return lookupGroundwater(f.field, Math.round(radiusM), hint);
}

export async function loadSolar(fieldId: string): Promise<SolarOutcome | WaterActionError> {
  const f = await ownedField(fieldId);
  if ("ok" in f) return f;
  return lookupSolar(f.field);
}

const saveInput = z.object({
  name: z.string().trim().min(1, "Give this version a name").max(120),
  inputs: z.unknown(),
  evidence: z.object({ surface: z.unknown(), groundwater: z.unknown(), solar: z.unknown() }),
});

const sha = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex");

/**
 * Saves a new immutable version. The result is recomputed here from the inputs with the pure
 * model; when demand comes from a comparison, the per-option demand is re-derived from the stored
 * run result and must match, so a saved plan cannot carry demand the engine did not produce.
 */
export async function saveWaterPlan(fieldId: string, raw: unknown): Promise<{ ok: true; id: string; version: number; message: string } | WaterActionError> {
  const f = await ownedField(fieldId);
  if ("ok" in f) return f;
  const p = saveInput.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Check the plan." };
  const parsed = plannerInputSchema.safeParse(p.data.inputs);
  if (!parsed.success) return { ok: false, message: "Some planner inputs are invalid; check the highlighted values." };
  const inputs = parsed.data;
  const db = f.db;
  let runId: string | null = null;
  if (inputs.demand.mode === "run") {
    const run = await getRun(db, inputs.demand.runId);
    if (!run?.result || run.scenario?.fieldId !== fieldId) return { ok: false, message: "The comparison used for water demand was not found for this field." };
    if (run.run.resultSha256 !== inputs.demand.resultSha256) return { ok: false, message: "The comparison result changed; reload the page." };
    const expected = demandFromResult(run.result, inputs.demand.runKind).options;
    const given = inputs.demand.options;
    const same = expected.length === given.length && expected.every((e, i) => canonicalJson(e) === canonicalJson(given[i]));
    if (!same) return { ok: false, message: "The water demand does not match the stored comparison; reload the page." };
    runId = inputs.demand.runId;
  }
  let result;
  try {
    result = computeWaterEnergy(inputs);
  } catch (e) {
    return { ok: false, message: e instanceof WaterInputError ? e.message : "The calculation failed." };
  }
  const evidenceText = canonicalJson(p.data.evidence);
  if (evidenceText.length > 600_000) return { ok: false, message: "The evidence record is too large to save." };
  const { data: last } = await db.from("water_energy_plans").select("version").eq("field_id", fieldId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { data, error } = await db
    .from("water_energy_plans")
    .insert({
      field_id: fieldId,
      run_id: runId,
      version,
      name: p.data.name,
      model_version: WATER_MODEL_VERSION,
      inputs: JSON.parse(canonicalJson(inputs)),
      evidence: JSON.parse(evidenceText),
      result: JSON.parse(canonicalJson(result)),
      inputs_sha256: sha(inputs),
      result_sha256: sha(result),
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.code === "23505" ? "Another version was saved at the same time; save again." : describeDbError(error) };
  revalidatePath(`/fields/${fieldId}/water`);
  return { ok: true, id: data.id, version, message: `Saved as version ${version}.` };
}

export async function deleteWaterPlan(fieldId: string, planId: string): Promise<{ ok: true; message: string } | WaterActionError> {
  const f = await ownedField(fieldId);
  if ("ok" in f) return f;
  if (!uuid.safeParse(planId).success) return { ok: false, message: "Plan not found." };
  const { error, count } = await f.db.from("water_energy_plans").delete({ count: "exact" }).eq("id", planId).eq("field_id", fieldId);
  if (error) return { ok: false, message: describeDbError(error) };
  if (!count) return { ok: false, message: "Plan not found." };
  revalidatePath(`/fields/${fieldId}/water`);
  return { ok: true, message: "Version deleted." };
}
