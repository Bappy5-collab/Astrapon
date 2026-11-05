import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FieldFacts } from "@/domain/farm/progress";
import type { BoundaryGeometry } from "@/domain/geo/boundary";
import type { Database } from "@/server/database/database.types";

type Db = SupabaseClient<Database>;

/** The schema has not been applied to the configured project (PostgREST: relation not in schema cache). */
export class SchemaMissingError extends Error {}
const SCHEMA_MISSING = new Set(["PGRST205", "PGRST202", "42P01"]);

/** All reads go through the caller's RLS-scoped client; another user's id simply returns nothing. */

export async function listFarms(db: Db) {
  const { data, error } = await db.from("farms").select("id, name, country_code, created_at, fields(count)").order("created_at");
  if (error) throw SCHEMA_MISSING.has(error.code) ? new SchemaMissingError(error.code) : new Error(`Could not load farms (${error.code})`);
  return data.map((f) => ({ ...f, fieldCount: (f.fields as unknown as { count: number }[])[0]?.count ?? 0 }));
}

export async function getFarm(db: Db, farmId: string) {
  const [farm, fields, markets] = await Promise.all([
    db.from("farms").select("id, name, country_code, notes").eq("id", farmId).maybeSingle(),
    db.from("fields").select("id, name, area_ha, boundary_source").eq("farm_id", farmId).order("name"),
    db.from("market_preferences").select("id, crop_name, preference, has_contract, notes").eq("farm_id", farmId).order("crop_name"),
  ]);
  if (farm.error || fields.error || markets.error) throw new Error("Could not load farm");
  if (!farm.data) return null;
  return { ...farm.data, fields: fields.data, markets: markets.data };
}

export type FieldGeometry = { boundary: BoundaryGeometry | null; zones: { id: string; name: string; boundary: BoundaryGeometry }[] };

export async function getField(db: Db, fieldId: string) {
  const field = await db.from("fields").select("id, farm_id, name, notes, area_ha, boundary_source, farms(name, country_code)").eq("id", fieldId).maybeSingle();
  if (field.error) throw new Error("Could not load field");
  if (!field.data) return null;
  const [geometry, zones, history, soil, constraints, priorities, scenarios] = await Promise.all([
    db.rpc("field_geometry", { p_field_id: fieldId }),
    db.from("planting_zones").select("id, name, basis, area_ha, notes").eq("field_id", fieldId).order("name"),
    db.from("crop_history").select("*").eq("field_id", fieldId).order("season_year", { ascending: false }).order("season"),
    db.from("soil_observations").select("*").eq("field_id", fieldId).order("observed_on", { ascending: false }),
    db.from("field_constraints").select("*").eq("field_id", fieldId).maybeSingle(),
    db.from("farmer_priorities").select("*").eq("field_id", fieldId).maybeSingle(),
    db.from("scenarios").select("id, name, updated_at, simulation_input_snapshots(count)").eq("field_id", fieldId).order("created_at"),
  ]);
  for (const r of [geometry, zones, history, soil, constraints, priorities, scenarios]) if (r.error) throw new Error("Could not load field records");
  return {
    ...field.data,
    farmName: (field.data.farms as unknown as { name: string } | null)?.name ?? "",
    countryCode: (field.data.farms as unknown as { country_code: string | null } | null)?.country_code ?? null,
    geometry: (geometry.data as unknown as FieldGeometry | null) ?? { boundary: null, zones: [] },
    zones: zones.data!,
    history: history.data!,
    soil: soil.data!,
    constraints: constraints.data,
    priorities: priorities.data,
    scenarios: scenarios.data!.map((s) => ({ ...s, snapshotCount: (s.simulation_input_snapshots as unknown as { count: number }[])[0]?.count ?? 0 })),
  };
}

export async function getScenario(db: Db, scenarioId: string) {
  const sc = await db.from("scenarios").select("id, field_id, name, settings, settings_schema_version, updated_at, fields(name, farm_id)").eq("id", scenarioId).maybeSingle();
  if (sc.error) throw new Error("Could not load scenario");
  if (!sc.data) return null;
  const [snapshots, current] = await Promise.all([
    db.from("simulation_input_snapshots").select("id, created_at, engine_version, input_schema_version, inputs_sha256, inputs").eq("scenario_id", scenarioId).order("created_at", { ascending: false }),
    db.rpc("assemble_scenario_inputs", { p_scenario_id: scenarioId }),
  ]);
  if (snapshots.error || current.error) throw new Error("Could not load scenario snapshots");
  const field = sc.data.fields as unknown as { name: string; farm_id: string } | null;
  return { ...sc.data, fieldName: field?.name ?? "", farmId: field?.farm_id ?? "", snapshots: snapshots.data, currentInputs: current.data };
}

/** Every scenario the user owns, with snapshot counts (saved-runs page). */
export async function listScenarios(db: Db) {
  const { data, error } = await db
    .from("scenarios")
    .select("id, name, updated_at, field_id, fields(name), simulation_input_snapshots(count)")
    .order("updated_at", { ascending: false });
  if (error) throw SCHEMA_MISSING.has(error.code) ? new SchemaMissingError(error.code) : new Error(`Could not load scenarios (${error.code})`);
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    updatedAt: s.updated_at,
    fieldId: s.field_id,
    fieldName: (s.fields as unknown as { name: string } | null)?.name ?? "",
    snapshots: (s.simulation_input_snapshots as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

/**
 * What is recorded for each field, for the step guide (domain/farm/progress). One batched read per
 * table, so a list of fields costs the same number of queries as one field.
 */
export async function fieldFacts(db: Db, fieldIds: string[]): Promise<Map<string, FieldFacts>> {
  const out = new Map<string, FieldFacts>();
  if (!fieldIds.length) return out;
  const [fields, history, soil, water, prio, retr, jobs, scen, wplans] = await Promise.all([
    db.from("fields").select("id, area_ha").in("id", fieldIds),
    db.from("crop_history").select("field_id, planted_on, harvested_on").in("field_id", fieldIds),
    db.from("soil_observations").select("field_id").in("field_id", fieldIds),
    db.from("field_constraints").select("field_id").in("field_id", fieldIds),
    db.from("farmer_priorities").select("field_id").in("field_id", fieldIds),
    db.from("evidence_retrievals").select("field_id, source_id").in("field_id", fieldIds).in("source_id", ["nasa-power-daily", "usda-ssurgo-sda"]),
    db.from("evidence_jobs").select("field_id").in("field_id", fieldIds).eq("source_id", "nasa-power-daily").in("status", ["queued", "running"]),
    db.from("scenarios").select("id, field_id").in("field_id", fieldIds),
    db.from("water_energy_plans").select("field_id").in("field_id", fieldIds),
  ]);
  for (const r of [fields, history, soil, water, prio, retr, jobs, scen, wplans]) if (r.error) throw new Error("Could not load field progress");
  const scenarioField = new Map(scen.data!.map((s) => [s.id, s.field_id]));
  const latestRun = new Map<string, { id: string; at: string }>();
  if (scenarioField.size) {
    const snaps = await db.from("simulation_input_snapshots").select("id, scenario_id").in("scenario_id", [...scenarioField.keys()]);
    if (snaps.error) throw new Error("Could not load field progress");
    const snapField = new Map(snaps.data.map((s) => [s.id, scenarioField.get(s.scenario_id)!]));
    if (snapField.size) {
      const runs = await db.from("simulation_runs").select("id, snapshot_id, queued_at").in("snapshot_id", [...snapField.keys()]).eq("status", "succeeded");
      if (runs.error) throw new Error("Could not load field progress");
      for (const r of runs.data) {
        const f = snapField.get(r.snapshot_id)!;
        const cur = latestRun.get(f);
        if (!cur || r.queued_at > cur.at) latestRun.set(f, { id: r.id, at: r.queued_at });
      }
    }
  }
  const count = (rows: { field_id: string }[], id: string) => rows.filter((r) => r.field_id === id).length;
  for (const f of fields.data!) {
    const h = history.data!.filter((r) => r.field_id === f.id);
    out.set(f.id, {
      hasBoundary: f.area_ha !== null,
      historyCount: h.length,
      datedHistoryCount: h.filter((r) => r.planted_on && r.harvested_on).length,
      soilCount: count(soil.data!, f.id),
      hasSoilSurvey: retr.data!.some((r) => r.field_id === f.id && r.source_id === "usda-ssurgo-sda"),
      waterSaved: count(water.data!, f.id) > 0,
      prioritiesSaved: count(prio.data!, f.id) > 0,
      hasWeather: retr.data!.some((r) => r.field_id === f.id && r.source_id === "nasa-power-daily"),
      weatherPending: count(jobs.data!, f.id) > 0,
      scenarioCount: scen.data!.filter((s) => s.field_id === f.id).length,
      latestRunId: latestRun.get(f.id)?.id ?? null,
      waterPlanCount: count(wplans.data!, f.id),
    });
  }
  return out;
}
