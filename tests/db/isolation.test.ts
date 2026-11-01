/**
 * Two-user isolation tests against the configured Astrapon DEVELOPMENT Supabase project.
 * Run with `pnpm test:db`. Creates two throwaway confirmed users through the Auth admin API,
 * exercises reads, writes, nested ownership, reference-data and storage boundaries through the
 * public (publishable-key) API exactly as the browser/app would, and deletes both users afterwards
 * (their rows cascade). Skips with a clear reason when the project is not configured.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/server/database/database.types";

const envFile = path.resolve(__dirname, "../../.env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const configured = Boolean(URL_ && PUBLISHABLE && SECRET);
if (!configured) console.warn("SKIPPED: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required.");

type Db = SupabaseClient<Database>;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

// Synthetic test geometry (~4.6 ha square and an inner zone). Not a real field.
const FIELD = { type: "Polygon", coordinates: [[[-93.625, 42.025], [-93.6225, 42.025], [-93.6225, 42.027], [-93.625, 42.027], [-93.625, 42.025]]] };
const ZONE = { type: "Polygon", coordinates: [[[-93.6249, 42.0251], [-93.6237, 42.0251], [-93.6237, 42.0269], [-93.6249, 42.0269], [-93.6249, 42.0251]]] };
const SETTINGS = { candidateCrops: ["Maize", "Soybean"], rotationYears: 2, replayFromYear: 2005, replayToYear: 2024, irrigationAssumption: "rainfed", notes: "" };

const admin = configured ? createClient<Database>(URL_!, SECRET!, opts) : (null as unknown as Db);
const users: { id: string; email: string; password: string; db: Db }[] = [];

async function makeUser(label: string) {
  const email = `astrapon-test-${label}-${randomUUID().slice(0, 8)}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { astrapon_test: true } });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const db = createClient<Database>(URL_!, PUBLISHABLE!, opts);
  const signIn = await db.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`);
  const u = { id: data.user.id, email, password, db };
  users.push(u);
  return u;
}

describe.skipIf(!configured)("two-user isolation (live development project)", () => {
  let A: Awaited<ReturnType<typeof makeUser>>;
  let B: Awaited<ReturnType<typeof makeUser>>;
  const a = {} as Record<"farm" | "field" | "zone" | "history" | "soil" | "scenario" | "snapshot", string>;
  const b = {} as typeof a;

  beforeAll(async () => {
    A = await makeUser("a");
    B = await makeUser("b");

    for (const [u, ids] of [[A, a], [B, b]] as const) {
      const farm = await u.db.from("farms").insert({ name: "Isolation test farm" }).select("id").single();
      expect(farm.error).toBeNull();
      ids.farm = farm.data!.id;
      const field = await u.db.from("fields").insert({ farm_id: ids.farm, name: "North" }).select("id").single();
      expect(field.error).toBeNull();
      ids.field = field.data!.id;
      expect((await u.db.rpc("set_field_boundary", { p_field_id: ids.field, p_boundary: FIELD, p_source: "farmer_entered_coordinates" })).error).toBeNull();
      const zone = await u.db.rpc("create_planting_zone", { p_field_id: ids.field, p_name: "West strip", p_boundary: ZONE, p_basis: "farmer_knowledge" });
      expect(zone.error).toBeNull();
      ids.zone = zone.data!;
      const hist = await u.db.from("crop_history").insert({ field_id: ids.field, zone_id: ids.zone, season_year: 2024, crop_name: "Maize" }).select("id").single();
      expect(hist.error).toBeNull();
      ids.history = hist.data!.id;
      const soil = await u.db.from("soil_observations").insert({ field_id: ids.field, observed_on: "2025-04-01", depth_top_cm: 0, depth_bottom_cm: 15, property: "ph_water", value_numeric: 6.5, unit: "pH" }).select("id").single();
      expect(soil.error).toBeNull();
      ids.soil = soil.data!.id;
      expect((await u.db.from("field_constraints").insert({ field_id: ids.field, irrigation: "none" })).error).toBeNull();
      expect((await u.db.from("farmer_priorities").insert({ field_id: ids.field, water_use: 5 })).error).toBeNull();
      expect((await u.db.from("market_preferences").insert({ farm_id: ids.farm, crop_name: "Maize", preference: "preferred" })).error).toBeNull();
      const sc = await u.db.from("scenarios").insert({ field_id: ids.field, name: "Base", settings: SETTINGS }).select("id").single();
      expect(sc.error).toBeNull();
      ids.scenario = sc.data!.id;
      const snap = await u.db.rpc("create_input_snapshot", { p_scenario_id: ids.scenario, p_engine_version: "0.0.0-pre-engine" });
      expect(snap.error).toBeNull();
      ids.snapshot = snap.data!;
    }
  }, 60_000);

  afterAll(async () => {
    // Deleting the accounts must cascade cleanly, including snapshots that pin evidence.
    const failures: string[] = [];
    for (const u of users) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) failures.push(error.message);
    }
    expect(failures).toEqual([]);
  }, 60_000);

  const OWNED = ["farms", "fields", "planting_zones", "crop_history", "soil_observations", "field_constraints", "farmer_priorities", "market_preferences", "scenarios", "simulation_input_snapshots", "snapshot_reference_datasets", "profiles"] as const;

  it("each user reads only their own rows in every user table", async () => {
    for (const t of OWNED) {
      const rows = await B.db.from(t).select("*");
      expect(rows.error, t).toBeNull();
      const ownerKey = t === "profiles" ? "id" : "owner_id";
      for (const r of rows.data as Record<string, unknown>[]) expect(r[ownerKey], t).toBe(B.id);
    }
    expect((await B.db.from("fields").select("id").eq("id", a.field)).data).toEqual([]);
    expect((await B.db.rpc("field_geometry", { p_field_id: a.field })).data).toBeNull();
    expect((await B.db.from("simulation_input_snapshots").select("inputs").eq("id", a.snapshot)).data).toEqual([]);
  });

  it("anonymous requests see no user data and cannot call RPCs", async () => {
    const anon = createClient<Database>(URL_!, PUBLISHABLE!, opts);
    for (const t of OWNED) {
      const r = await anon.from(t).select("*").limit(1);
      expect(r.data ?? [], t).toEqual([]);
    }
    expect((await anon.rpc("assemble_scenario_inputs", { p_scenario_id: a.scenario })).error).not.toBeNull();
  });

  it("updates and deletes aimed at another user's rows affect nothing", async () => {
    const upd = await B.db.from("fields").update({ name: "hijacked" }).eq("id", a.field).select("id");
    expect(upd.data).toEqual([]);
    const del = await B.db.from("farms").delete().eq("id", a.farm).select("id");
    expect(del.data).toEqual([]);
    expect((await B.db.rpc("set_field_boundary", { p_field_id: a.field, p_boundary: FIELD, p_source: "farmer_drawn" })).error?.message).toMatch(/not found/i);
    const still = await A.db.from("fields").select("name").eq("id", a.field).single();
    expect(still.data?.name).toBe("North");
  });

  it("cannot create rows owned by someone else", async () => {
    const r = await B.db.from("farms").insert({ name: "spoof", owner_id: A.id });
    expect(r.error?.code).toBe("42501");
  });

  it("cannot attach children to another user's field, zone, farm or scenario", async () => {
    const attempts = [
      B.db.from("fields").insert({ farm_id: a.farm, name: "intruder" }),
      B.db.rpc("create_planting_zone", { p_field_id: a.field, p_name: "intruder", p_boundary: ZONE, p_basis: "farmer_knowledge" }),
      B.db.from("crop_history").insert({ field_id: a.field, season_year: 2024, crop_name: "Wheat" }),
      // Own field but A's zone: the composite (zone, field, owner) key rejects it.
      B.db.from("crop_history").insert({ field_id: b.field, zone_id: a.zone, season_year: 2024, crop_name: "Wheat" }),
      B.db.from("soil_observations").insert({ field_id: a.field, observed_on: "2025-01-01", depth_top_cm: 0, depth_bottom_cm: 10, property: "clay", value_numeric: 20, unit: "%" }),
      B.db.from("field_constraints").insert({ field_id: a.field }),
      B.db.from("farmer_priorities").insert({ field_id: a.field }),
      B.db.from("market_preferences").insert({ farm_id: a.farm, crop_name: "Oats", preference: "avoid" }),
      B.db.from("scenarios").insert({ field_id: a.field, name: "intruder", settings: SETTINGS }),
      B.db.rpc("create_input_snapshot", { p_scenario_id: a.scenario, p_engine_version: "0.0.0-pre-engine" }),
      B.db.from("simulation_input_snapshots").insert({ scenario_id: a.scenario, field_id: a.field, input_schema_version: 1, engine_version: "x", inputs: {} }),
      B.db.from("simulation_runs").insert({ snapshot_id: a.snapshot, engine_version: "0.0.0-pre-engine" }),
    ];
    const results = await Promise.all(attempts);
    results.forEach((r, i) => expect(r.error, `attempt ${i}`).not.toBeNull());
    // And nothing leaked into A's data.
    expect((await A.db.from("crop_history").select("id").eq("field_id", a.field)).data).toHaveLength(1);
  });

  it("snapshots are immutable, hashed server-side and pin published reference data", async () => {
    const snap = await A.db.from("simulation_input_snapshots").select("inputs, inputs_sha256").eq("id", a.snapshot).single();
    expect(snap.data?.inputs_sha256).toMatch(/^[0-9a-f]{64}$/);
    const upd = await A.db.from("simulation_input_snapshots").update({ inputs: { tampered: true } }).eq("id", a.snapshot);
    expect(upd.error).not.toBeNull();
    const pins = await A.db.from("snapshot_reference_datasets").select("dataset_id, dataset_sha256").eq("snapshot_id", a.snapshot);
    const inputs = snap.data!.inputs as { reference_datasets: { id: string; content_sha256: string }[]; scenario: { settings: unknown } };
    expect(pins.data?.map((p) => p.dataset_id).sort()).toEqual(inputs.reference_datasets.map((d) => d.id).sort());
    expect(inputs.scenario.settings).toEqual(SETTINGS);
  });

  it("users can queue and cancel a run but not mark it succeeded or write results", async () => {
    const run = await A.db.from("simulation_runs").insert({ snapshot_id: a.snapshot, engine_version: "0.0.0-pre-engine" }).select("id, status").single();
    expect(run.error).toBeNull();
    expect(run.data?.status).toBe("queued");
    expect((await A.db.from("simulation_runs").update({ status: "succeeded" }).eq("id", run.data!.id)).error).not.toBeNull();
    expect((await A.db.from("simulation_results").insert({ run_id: run.data!.id, owner_id: A.id, engine_version: "x", result: {} })).error).not.toBeNull();
    const cancel = await A.db.from("simulation_runs").update({ status: "cancelled" }).eq("id", run.data!.id).select("status, finished_at").single();
    expect(cancel.data?.status).toBe("cancelled");
    expect(cancel.data?.finished_at).not.toBeNull();
    expect((await A.db.from("simulation_runs").insert({ snapshot_id: a.snapshot, engine_version: "9.9.9" })).error).not.toBeNull();
  });

  it("reference data is readable but not writable by users", async () => {
    const ds = await B.db.from("reference_datasets").select("id, status");
    expect(ds.error).toBeNull();
    expect(ds.data!.length).toBeGreaterThan(0);
    expect(ds.data!.every((d) => d.status !== "draft")).toBe(true);
    expect((await B.db.from("reference_datasets").insert({ kind: "crop_parameters", name: "evil", version: 1 })).error).not.toBeNull();
    expect((await B.db.from("reference_items").update({ payload: {} }).eq("dataset_id", ds.data![0]!.id).select("id")).data ?? []).toEqual([]);
    expect((await B.db.from("reference_citations").delete().neq("citation_key", "").select("id")).data ?? []).toEqual([]);
  });

  it("derived geometry and server-written evidence cannot be forged", async () => {
    const forged = await A.db.from("fields").update({ area_ha: 9999 } as never).eq("id", a.field);
    expect(forged.error).not.toBeNull();
    const ev = await A.db.from("evidence_aggregates").insert({ field_id: a.field, retrieval_id: randomUUID(), variable: "T2M", unit: "C", aggregation: "mean", period_start: "2024-01-01", period_end: "2024-12-31", value: 1, valid_count: 1, expected_count: 1 });
    expect(ev.error).not.toBeNull();
  });

  it("zones must lie within the field boundary", async () => {
    const outside = { type: "Polygon", coordinates: [[[-93.70, 42.10], [-93.69, 42.10], [-93.69, 42.11], [-93.70, 42.10]]] };
    const r = await A.db.rpc("create_planting_zone", { p_field_id: a.field, p_name: "outside", p_boundary: outside, p_basis: "farmer_knowledge" });
    expect(r.error?.message).toMatch(/within the field boundary/);
  });

  it("Storage is unused: no buckets exist and users cannot create one", async () => {
    const { data } = await admin.storage.listBuckets();
    expect(data ?? []).toEqual([]);
    expect((await A.db.storage.createBucket("astrapon-intruder")).error).not.toBeNull();
  });

  it("a saved scenario reopens with identical inputs in a fresh session", async () => {
    const fresh = createClient<Database>(URL_!, PUBLISHABLE!, opts);
    expect((await fresh.auth.signInWithPassword({ email: A.email, password: A.password })).error).toBeNull();
    const sc = await fresh.from("scenarios").select("settings").eq("id", a.scenario).single();
    expect(sc.data?.settings).toEqual(SETTINGS);
    const geom = await fresh.rpc("field_geometry", { p_field_id: a.field });
    expect((geom.data as { boundary: { type: string } }).boundary.type).toBe("MultiPolygon");
    const current = await fresh.rpc("assemble_scenario_inputs", { p_scenario_id: a.scenario });
    const snap = await fresh.from("simulation_input_snapshots").select("inputs").eq("id", a.snapshot).single();
    expect(current.data).toEqual(snap.data?.inputs);
    // Changing the scenario does not alter the frozen snapshot.
    expect((await fresh.from("scenarios").update({ settings: { ...SETTINGS, rotationYears: 3 } }).eq("id", a.scenario)).error).toBeNull();
    const after = await fresh.from("simulation_input_snapshots").select("inputs").eq("id", a.snapshot).single();
    expect(after.data?.inputs).toEqual(snap.data?.inputs);
    expect((await fresh.rpc("assemble_scenario_inputs", { p_scenario_id: a.scenario })).data).not.toEqual(snap.data?.inputs);
  });
  it("workspace save applies boundary, zones and crops atomically, and only for the owner", async () => {
    const field = await A.db.from("fields").insert({ farm_id: a.farm, name: "Workspace test" }).select("id").single();
    expect(field.error).toBeNull();
    const fid = field.data!.id;
    const first = await A.db.rpc("save_field_workspace", {
      p_field_id: fid,
      p_edits: {
        boundary: { geometry: FIELD, source: "farmer_drawn" },
        deleteZoneIds: [],
        zones: [{ id: null, ref: "new-1", name: "West", basis: "farmer_knowledge", notes: null, boundary: ZONE }],
        crops: [{ zoneRef: "new-1", seasonYear: 2024, season: "main", cropName: "maize" }, { zoneRef: null, seasonYear: 2024, season: "main", cropName: "soybean" }],
      },
    });
    expect(first.error).toBeNull();
    const zoneId = (first.data as { zoneIds: Record<string, string> }).zoneIds["new-1"]!;
    expect(zoneId).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await A.db.from("crop_history").select("zone_id, crop_name").eq("field_id", fid).order("crop_name");
    expect(rows.data).toEqual([{ zone_id: zoneId, crop_name: "maize" }, { zone_id: null, crop_name: "soybean" }]);

    // Re-assigning updates the existing record instead of adding another.
    expect((await A.db.rpc("save_field_workspace", { p_field_id: fid, p_edits: { boundary: null, deleteZoneIds: [], zones: [], crops: [{ zoneRef: zoneId, seasonYear: 2024, season: "main", cropName: "wheat" }] } })).error).toBeNull();
    expect((await A.db.from("crop_history").select("id").eq("field_id", fid)).data).toHaveLength(2);

    // Shrinking the boundary so the zone falls outside fails, and nothing in the batch is kept.
    const small = { type: "Polygon", coordinates: [[[-93.6235, 42.025], [-93.6225, 42.025], [-93.6225, 42.027], [-93.6235, 42.027], [-93.6235, 42.025]]] };
    const bad = await A.db.rpc("save_field_workspace", { p_field_id: fid, p_edits: { boundary: { geometry: small, source: "farmer_drawn" }, deleteZoneIds: [], zones: [], crops: [{ zoneRef: null, seasonYear: 2023, season: "main", cropName: "oats" }] } });
    expect(bad.error?.message).toMatch(/planting zone outside/);
    expect((await A.db.from("crop_history").select("id").eq("field_id", fid)).data).toHaveLength(2);
    // ...but shrinking while deleting that zone in the same save succeeds.
    expect((await A.db.rpc("save_field_workspace", { p_field_id: fid, p_edits: { boundary: { geometry: small, source: "farmer_drawn" }, deleteZoneIds: [zoneId], zones: [], crops: [] } })).error).toBeNull();

    // Another user can neither save to A's field nor reference A's zone from their own field.
    const intrude = await B.db.rpc("save_field_workspace", { p_field_id: fid, p_edits: { boundary: null, deleteZoneIds: [], zones: [], crops: [] } });
    expect(intrude.error?.message).toMatch(/not found/i);
    const borrow = await B.db.rpc("save_field_workspace", { p_field_id: b.field, p_edits: { boundary: null, deleteZoneIds: [], zones: [], crops: [{ zoneRef: a.zone, seasonYear: 2024, season: "main", cropName: "maize" }] } });
    expect(borrow.error?.message).toMatch(/not found/i);
    const del = await B.db.rpc("save_field_workspace", { p_field_id: b.field, p_edits: { boundary: null, deleteZoneIds: [a.zone], zones: [], crops: [] } });
    expect(del.error).toBeNull();
    expect((await A.db.from("planting_zones").select("id").eq("id", a.zone)).data).toHaveLength(1);
    expect((await A.db.from("fields").delete().eq("id", fid)).error).toBeNull();
  });
  it("evidence jobs: users can only request (deduplicated) and cancel; status changes are worker-only", async () => {
    const j1 = await A.db.rpc("request_evidence", { p_field_id: a.field, p_source_id: "nasa-power-daily" });
    expect(j1.error).toBeNull();
    const j2 = await A.db.rpc("request_evidence", { p_field_id: a.field, p_source_id: "nasa-power-daily" });
    expect(j2.data).toBe(j1.data);
    const forge = await A.db.from("evidence_jobs").update({ status: "complete" }).eq("id", j1.data!);
    expect(forge.error?.message).toMatch(/Only the evidence worker/);
    const direct = await A.db.from("evidence_jobs").insert({ field_id: a.field, source_id: "usda-ssurgo-sda", status: "complete" } as never);
    expect(direct.error).not.toBeNull();
    expect((await B.db.rpc("request_evidence", { p_field_id: a.field, p_source_id: "nasa-power-daily" })).error?.message).toMatch(/not found/i);
    expect((await B.db.from("evidence_jobs").select("id").eq("id", j1.data!)).data).toEqual([]);
    expect((await B.db.from("evidence_jobs").update({ status: "cancelled" }).eq("id", j1.data!).select("id")).data).toEqual([]);
    const cancel = await A.db.from("evidence_jobs").update({ status: "cancelled" }).eq("id", j1.data!).select("status, finished_at");
    expect(cancel.data?.[0]).toMatchObject({ status: "cancelled" });
    expect(cancel.data?.[0]?.finished_at).not.toBeNull();
    // A worker (trusted role) can complete jobs.
    const j3 = await A.db.rpc("request_evidence", { p_field_id: a.field, p_source_id: "nasa-power-daily" });
    expect(j3.data).not.toBe(j1.data);
    expect((await admin.from("evidence_jobs").update({ status: "failed", finished_at: new Date().toISOString(), error_kind: "unavailable", error_message: "test" }).eq("id", j3.data!)).error).toBeNull();
  });

  it("a saved snapshot pins its evidence: a later refresh does not change it and pinned rows cannot be deleted", async () => {
    const mkRetrieval = async (retrievedAt: string, value: number) => {
      const r = await admin.from("evidence_retrievals").insert({
        owner_id: A.id, field_id: a.field, source_id: "nasa-power-daily", product_id: "POWER/daily/point/AG", product_version: "test", evidence_class: "assimilated_model_product",
        spatial_support: "test cell", request: { test: true }, retrieved_at: retrievedAt, response_sha256: (value.toString(16).padStart(2, "0")).repeat(32), response_bytes: 1,
        outcome: "valid", checks: [], provenance: { test: true }, processing_version: "evidence-1.0.0", observation_start: "2024-01-01", observation_end: "2024-12-31",
      }).select("id").single();
      expect(r.error).toBeNull();
      const agg = await admin.from("evidence_aggregates").insert([
        { owner_id: A.id, field_id: a.field, retrieval_id: r.data!.id, variable: "frost_days", unit: "days", aggregation: "count", period_start: "2024-01-01", period_end: "2024-12-31", value, valid_count: 366, expected_count: 366 },
        { owner_id: A.id, field_id: a.field, retrieval_id: r.data!.id, variable: "T2M_MIN", unit: "°C", aggregation: "mean", period_start: "2024-01-01", period_end: "2024-01-31", value: -7.5, valid_count: 31, expected_count: 31 },
      ]);
      expect(agg.error).toBeNull();
      return r.data!.id;
    };
    const r1 = await mkRetrieval("2026-10-01T00:00:00Z", 100);
    const snap = await A.db.rpc("create_input_snapshot", { p_scenario_id: a.scenario, p_engine_version: "0.0.0-pre-engine" });
    expect(snap.error).toBeNull();
    const before = await A.db.from("simulation_input_snapshots").select("inputs, input_schema_version").eq("id", snap.data!).single();
    expect(before.data?.input_schema_version).toBe(2);
    const pinned = (before.data!.inputs as { evidence: { retrieval_id: string; aggregates_sha256: string }[] }).evidence;
    expect(pinned).toHaveLength(1);
    expect(pinned[0]!.retrieval_id).toBe(r1);
    expect((await A.db.rpc("evidence_aggregates_digest", { p_retrieval_id: r1 })).data).toBe(pinned[0]!.aggregates_sha256);

    // A refresh adds a newer retrieval with different values.
    const r2 = await mkRetrieval("2026-10-31T00:00:00Z", 90);
    const after = await A.db.from("simulation_input_snapshots").select("inputs").eq("id", snap.data!).single();
    expect(after.data?.inputs).toEqual(before.data?.inputs);
    expect((await A.db.rpc("evidence_aggregates_digest", { p_retrieval_id: r1 })).data).toBe(pinned[0]!.aggregates_sha256);
    const current = await A.db.rpc("assemble_scenario_inputs", { p_scenario_id: a.scenario });
    expect((current.data as { evidence: { retrieval_id: string }[] }).evidence[0]!.retrieval_id).toBe(r2);

    // The pinned retrieval cannot be deleted; the unpinned newer one can.
    expect((await A.db.from("evidence_retrievals").delete().eq("id", r1)).error?.message).toMatch(/pinned by a saved snapshot/);
    expect((await A.db.from("evidence_retrievals").delete().eq("id", r2)).error).toBeNull();
    // Pins are private to the owner and immutable.
    expect((await B.db.from("snapshot_evidence_retrievals").select("retrieval_id").eq("snapshot_id", snap.data!)).data).toEqual([]);
    expect((await A.db.from("snapshot_evidence_retrievals").select("retrieval_id").eq("snapshot_id", snap.data!)).data).toEqual([{ retrieval_id: r1 }]);
    expect((await B.db.rpc("evidence_aggregates_digest", { p_retrieval_id: r1 })).data).toBeNull();
    // Deleting the snapshot releases the pin; then the retrieval can be deleted.
    const r3 = await mkRetrieval("2026-10-31T01:00:00Z", 80);
    const snap2 = await A.db.rpc("create_input_snapshot", { p_scenario_id: a.scenario, p_engine_version: "0.0.0-pre-engine" });
    expect((await A.db.from("evidence_retrievals").delete().eq("id", r3)).error?.message).toMatch(/pinned/);
    expect((await A.db.from("simulation_input_snapshots").delete().eq("id", snap2.data!)).error).toBeNull();
    expect((await A.db.from("evidence_retrievals").delete().eq("id", r3)).error).toBeNull();
  });
  it("request_simulation freezes inputs and queues one run; daily series are worker-written, owner-only and immutable", async () => {
    expect((await A.db.rpc("request_simulation", { p_scenario_id: a.scenario, p_engine_version: "0.0.0-pre-engine" })).error).not.toBeNull();
    const r1 = await A.db.rpc("request_simulation", { p_scenario_id: a.scenario, p_engine_version: "1.0.0" });
    expect(r1.error).toBeNull();
    const again = await A.db.rpc("request_simulation", { p_scenario_id: a.scenario, p_engine_version: "1.0.0" });
    expect(again.data).toBe(r1.data);
    const run1 = await A.db.from("simulation_runs").select("snapshot_id, status").eq("id", r1.data!).single();
    expect(run1.data?.status).toBe("queued");
    // A second active run on the same snapshot is refused; after cancelling, a new run reuses the unchanged snapshot.
    expect((await A.db.from("simulation_runs").insert({ snapshot_id: run1.data!.snapshot_id, engine_version: "1.0.0" })).error).not.toBeNull();
    expect((await A.db.from("simulation_runs").update({ status: "cancelled" }).eq("id", r1.data!)).error).toBeNull();
    const r3 = await A.db.rpc("request_simulation", { p_scenario_id: a.scenario, p_engine_version: "1.0.0" });
    expect(r3.data).not.toBe(r1.data);
    expect((await A.db.from("simulation_runs").select("snapshot_id").eq("id", r3.data!).single()).data?.snapshot_id).toBe(run1.data!.snapshot_id);
    // Another user cannot request, read or cancel it.
    expect((await B.db.rpc("request_simulation", { p_scenario_id: a.scenario, p_engine_version: "1.0.0" })).error).not.toBeNull();
    expect((await B.db.from("simulation_runs").select("id").eq("id", r3.data!)).data).toEqual([]);
    expect((await B.db.from("simulation_runs").update({ status: "cancelled" }).eq("id", r3.data!).select("id")).data).toEqual([]);
    expect((await A.db.from("simulation_runs").update({ status: "cancelled" }).eq("id", r3.data!)).error).toBeNull();

    const ret = await admin.from("evidence_retrievals").insert({
      owner_id: A.id, field_id: a.field, source_id: "nasa-power-daily", product_id: "POWER/daily/point/AG", product_version: "test", evidence_class: "assimilated_model_product",
      spatial_support: "test cell", request: { test: true }, retrieved_at: "2026-11-01T00:00:00Z", response_sha256: "ab".repeat(32), response_bytes: 1,
      outcome: "valid", checks: [], provenance: { test: true }, processing_version: "evidence-1.1.0", observation_start: "2024-01-01", observation_end: "2024-01-03",
    }).select("id").single();
    expect(ret.error).toBeNull();
    const row = { retrieval_id: ret.data!.id, owner_id: A.id, variable: "PRECTOTCORR", unit: "mm/day", start_date: "2024-01-01", values: [0, 1.25, null] as unknown as number[] }; // generated types omit NULL array elements
    expect((await A.db.from("evidence_daily_series").insert(row)).error).not.toBeNull();
    expect((await admin.from("evidence_daily_series").insert(row)).error).toBeNull();
    const own = await A.db.from("evidence_daily_series").select("values, values_sha256").eq("retrieval_id", ret.data!.id).single();
    expect(own.data?.values).toEqual([0, 1.25, null]);
    expect(own.data?.values_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await B.db.from("evidence_daily_series").select("variable").eq("retrieval_id", ret.data!.id)).data).toEqual([]);
    expect((await admin.from("evidence_daily_series").update({ values: [9] }).eq("retrieval_id", ret.data!.id)).error).not.toBeNull();
    expect((await A.db.from("evidence_retrievals").delete().eq("id", ret.data!.id)).error).toBeNull();
  });
});

