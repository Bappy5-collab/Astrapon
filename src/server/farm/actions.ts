"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  cropHistoryInput,
  farmInput,
  fieldConstraintsInput,
  fieldInput,
  issuesByField,
  marketPreferenceInput,
  prioritiesInput,
  soilObservationInput,
  zoneInput,
} from "@/domain/farm/records";
import { parseBoundary } from "@/domain/geo/boundary";
import { SCENARIO_SETTINGS_SCHEMA_VERSION, scenarioSettingsV1 } from "@/domain/scenario/settings";
import { ENGINE_VERSION } from "@/domain/simulation/engine-version";
import { formValues, type FormState } from "@/lib/forms/state";
import { getAuth } from "@/server/auth/session";
import { describeDbError } from "@/server/database/errors";

/*
 * Every action re-verifies the user with getClaims() and writes through the user's own
 * Supabase client, so RLS and the composite ownership foreign keys decide what is allowed.
 * Ids that arrive bound to an action are still untrusted input and are validated.
 */

const id = z.uuid();

async function user() {
  const auth = await getAuth();
  if (auth.state === "unconfigured") return { error: { status: "error", message: "Accounts are not configured on this server." } as FormState };
  if (auth.state === "unreachable") return { error: { status: "error", message: "The account service did not respond. Nothing was saved; try again." } as FormState };
  if (auth.state === "signed_out") return { error: { status: "error", message: "Your session has ended. Sign in again." } as FormState };
  return { auth };
}

const invalid = (error: z.ZodError, fd: FormData): FormState => ({
  status: "error",
  message: "Check the highlighted fields.",
  fieldErrors: issuesByField(error),
  values: formValues(fd),
});
const failed = (message: string, fd: FormData): FormState => ({ status: "error", message, values: formValues(fd) });
const fields = (fd: FormData) => Object.fromEntries(fd.entries());

// ------------------------------------------------------------------ farms ---

export async function createFarm(_: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  const p = farmInput.safeParse(fields(fd));
  if (!p.success) return invalid(p.error, fd);
  const { data, error } = await u.auth.supabase
    .from("farms")
    .insert({ name: p.data.name, country_code: p.data.countryCode, notes: p.data.notes ?? null })
    .select("id")
    .single();
  if (error) return failed(describeDbError(error), fd);
  revalidatePath("/farms");
  redirect(`/farms/${data.id}`);
}

export async function createField(farmId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(farmId).success) return failed("Unknown farm.", fd);
  const p = fieldInput.safeParse(fields(fd));
  if (!p.success) return invalid(p.error, fd);
  const { data, error } = await u.auth.supabase.from("fields").insert({ farm_id: farmId, name: p.data.name, notes: p.data.notes ?? null }).select("id").single();
  if (error) return failed(describeDbError(error), fd);
  revalidatePath(`/farms/${farmId}`);
  redirect(`/fields/${data.id}`);
}

export async function addMarketPreference(farmId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(farmId).success) return failed("Unknown farm.", fd);
  const p = marketPreferenceInput.safeParse(fields(fd));
  if (!p.success) return invalid(p.error, fd);
  const { error } = await u.auth.supabase.from("market_preferences").insert({
    farm_id: farmId, crop_name: p.data.cropName, preference: p.data.preference, has_contract: p.data.hasContract, notes: p.data.notes ?? null,
  });
  if (error) return failed(describeDbError(error), fd);
  revalidatePath(`/farms/${farmId}`);
  return { status: "success", message: "Market preference saved." };
}

// ----------------------------------------------------------------- fields ---

export async function setFieldBoundary(fieldId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(fieldId).success) return failed("Unknown field.", fd);
  const parsed = parseBoundary(String(fd.get("boundary") ?? ""));
  if (!parsed.ok) return { status: "error", fieldErrors: { boundary: parsed.error }, message: "The boundary was not saved.", values: formValues(fd) };
  const source = fd.get("source") === "farmer_uploaded" ? "farmer_uploaded" : "farmer_entered_coordinates";
  const { error } = await u.auth.supabase.rpc("set_field_boundary", { p_field_id: fieldId, p_boundary: parsed.geometry, p_source: source });
  if (error) return failed(describeDbError(error), fd);
  revalidatePath(`/fields/${fieldId}`);
  return { status: "success", message: `Boundary saved (${parsed.areaHa.toFixed(2)} ha).${parsed.notes.length ? ` ${parsed.notes.join(" ")}` : ""}` };
}

export async function createZone(fieldId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(fieldId).success) return failed("Unknown field.", fd);
  const p = zoneInput.safeParse(fields(fd));
  if (!p.success) return invalid(p.error, fd);
  const geom = parseBoundary(String(fd.get("boundary") ?? ""));
  if (!geom.ok) return { status: "error", fieldErrors: { boundary: geom.error }, message: "The zone was not saved.", values: formValues(fd) };
  const { error } = await u.auth.supabase.rpc("create_planting_zone", {
    p_field_id: fieldId, p_name: p.data.name, p_boundary: geom.geometry, p_basis: p.data.basis, p_notes: p.data.notes ?? undefined,
  });
  if (error) return failed(describeDbError(error), fd);
  revalidatePath(`/fields/${fieldId}`);
  return { status: "success", message: "Zone saved." };
}

export async function addCropHistory(fieldId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(fieldId).success) return failed("Unknown field.", fd);
  const p = cropHistoryInput.safeParse(fields(fd));
  if (!p.success) return invalid(p.error, fd);
  const d = p.data;
  const { error } = await u.auth.supabase.from("crop_history").insert({
    field_id: fieldId, zone_id: d.zoneId, season_year: d.seasonYear, season: d.season, crop_name: d.cropName,
    planted_on: d.plantedOn, harvested_on: d.harvestedOn, tillage: d.tillage,
    reported_yield: d.reportedYield, reported_yield_unit: d.reportedYieldUnit ?? null, notes: d.notes ?? null,
  });
  if (error) return failed(describeDbError(error), fd);
  revalidatePath(`/fields/${fieldId}`);
  return { status: "success", message: "Crop history saved." };
}

export async function addSoilObservation(fieldId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(fieldId).success) return failed("Unknown field.", fd);
  const p = soilObservationInput.safeParse(fields(fd));
  if (!p.success) return invalid(p.error, fd);
  const d = p.data;
  const { error } = await u.auth.supabase.from("soil_observations").insert({
    field_id: fieldId, zone_id: d.zoneId, observed_on: d.observedOn, depth_top_cm: d.depthTopCm, depth_bottom_cm: d.depthBottomCm,
    property: d.property, value_numeric: d.valueNumeric, value_text: d.valueText, unit: d.unit,
    evidence_class: d.evidenceClass, method: d.method ?? null, source: d.source ?? null,
  });
  if (error) return failed(describeDbError(error), fd);
  revalidatePath(`/fields/${fieldId}`);
  return { status: "success", message: "Soil observation saved." };
}

export async function saveFieldConstraints(fieldId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(fieldId).success) return failed("Unknown field.", fd);
  const p = fieldConstraintsInput.safeParse({ ...fields(fd), equipment: fd.getAll("equipment").map(String) });
  if (!p.success) return invalid(p.error, fd);
  const d = p.data;
  const { error } = await u.auth.supabase.from("field_constraints").upsert({
    field_id: fieldId, irrigation: d.irrigation, irrigation_method: d.irrigationMethod,
    seasonal_water_allocation_mm: d.seasonalWaterAllocationMm, water_source: d.waterSource ?? null,
    equipment: d.equipment, equipment_notes: d.equipmentNotes ?? null,
  });
  if (error) return failed(describeDbError(error), fd);
  revalidatePath(`/fields/${fieldId}`);
  return { status: "success", message: "Water and equipment saved." };
}

export async function saveFarmerPriorities(fieldId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(fieldId).success) return failed("Unknown field.", fd);
  const p = prioritiesInput.safeParse(fields(fd));
  if (!p.success) return invalid(p.error, fd);
  const { excludedCrops, notes, ...weights } = p.data;
  const { error } = await u.auth.supabase.from("farmer_priorities").upsert({ field_id: fieldId, ...weights, excluded_crops: excludedCrops, notes: notes ?? null });
  if (error) return failed(describeDbError(error), fd);
  revalidatePath(`/fields/${fieldId}`);
  return { status: "success", message: "Priorities saved." };
}

// -------------------------------------------------------------- scenarios ---

function parseScenario(fd: FormData) {
  const settings = scenarioSettingsV1(new Date().getUTCFullYear()).safeParse({
    candidateCrops: String(fd.get("candidateCrops") ?? "").split(",").map((c) => c.trim()).filter(Boolean),
    rotationYears: fd.get("rotationYears"),
    replayFromYear: fd.get("replayFromYear"),
    replayToYear: fd.get("replayToYear"),
    irrigationAssumption: fd.get("irrigationAssumption"),
    notes: String(fd.get("notes") ?? ""),
  });
  const name = z.string().trim().min(1, "Required").max(120).safeParse(fd.get("name"));
  return { settings, name };
}

export async function createScenario(fieldId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(fieldId).success) return failed("Unknown field.", fd);
  const { settings, name } = parseScenario(fd);
  if (!settings.success || !name.success) {
    return {
      status: "error", message: "Check the highlighted fields.", values: formValues(fd),
      fieldErrors: { ...(settings.success ? {} : issuesByField(settings.error)), ...(name.success ? {} : { name: name.error.issues[0]?.message ?? "Required" }) },
    };
  }
  const { data, error } = await u.auth.supabase
    .from("scenarios")
    .insert({ field_id: fieldId, name: name.data, settings: settings.data, settings_schema_version: SCENARIO_SETTINGS_SCHEMA_VERSION })
    .select("id")
    .single();
  if (error) return failed(describeDbError(error), fd);
  revalidatePath(`/fields/${fieldId}`);
  redirect(`/scenarios/${data.id}`);
}

export async function updateScenario(scenarioId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(scenarioId).success) return failed("Unknown scenario.", fd);
  const { settings, name } = parseScenario(fd);
  if (!settings.success || !name.success) {
    return {
      status: "error", message: "Check the highlighted fields.", values: formValues(fd),
      fieldErrors: { ...(settings.success ? {} : issuesByField(settings.error)), ...(name.success ? {} : { name: name.error.issues[0]?.message ?? "Required" }) },
    };
  }
  const { data, error } = await u.auth.supabase
    .from("scenarios")
    .update({ name: name.data, settings: settings.data, settings_schema_version: SCENARIO_SETTINGS_SCHEMA_VERSION })
    .eq("id", scenarioId)
    .select("id");
  if (error) return failed(describeDbError(error), fd);
  if (!data.length) return failed("Scenario not found.", fd);
  revalidatePath(`/scenarios/${scenarioId}`);
  return { status: "success", message: "Scenario saved. Existing snapshots keep the inputs they were taken with." };
}

export async function createInputSnapshot(scenarioId: string): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  if (!id.safeParse(scenarioId).success) return { status: "error", message: "Unknown scenario." };
  const { error } = await u.auth.supabase.rpc("create_input_snapshot", { p_scenario_id: scenarioId, p_engine_version: ENGINE_VERSION });
  if (error) return { status: "error", message: describeDbError(error) };
  revalidatePath(`/scenarios/${scenarioId}`);
  return { status: "success", message: "Inputs frozen into a new snapshot." };
}

// ---------------------------------------------------------------- deletes ---

const DELETABLE = {
  farms: { back: () => "/farms" },
  fields: { back: (parent: string) => `/farms/${parent}` },
  planting_zones: { back: (parent: string) => `/fields/${parent}` },
  crop_history: { back: (parent: string) => `/fields/${parent}` },
  soil_observations: { back: (parent: string) => `/fields/${parent}` },
  market_preferences: { back: (parent: string) => `/farms/${parent}` },
  scenarios: { back: (parent: string) => `/fields/${parent}` },
} as const;

/** Deletes one of the caller's own rows. RLS limits the delete to rows they own. */
export async function deleteOwnedRecord(table: keyof typeof DELETABLE, recordId: string, parentId: string): Promise<void> {
  const auth = await getAuth();
  if (auth.state !== "signed_in" || !(table in DELETABLE) || !id.safeParse(recordId).success) return;
  await auth.supabase.from(table).delete().eq("id", recordId);
  const back = DELETABLE[table].back(id.safeParse(parentId).success ? parentId : "");
  revalidatePath(back);
  if (table === "farms" || table === "fields" || table === "scenarios") redirect(back);
}

// ---------------------------------------------------------------- profile ---

export async function updateProfile(_: FormState, fd: FormData): Promise<FormState> {
  const u = await user();
  if (u.error) return u.error;
  const p = z
    .object({
      displayName: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(120).nullable()),
      unitSystem: z.enum(["metric", "imperial"]),
    })
    .safeParse(fields(fd));
  if (!p.success) return invalid(p.error, fd);
  const { error } = await u.auth.supabase
    .from("profiles")
    .update({ display_name: p.data.displayName, unit_system: p.data.unitSystem })
    .eq("id", u.auth.userId);
  if (error) return failed(describeDbError(error), fd);
  revalidatePath("/account");
  return { status: "success", message: "Preferences saved." };
}
