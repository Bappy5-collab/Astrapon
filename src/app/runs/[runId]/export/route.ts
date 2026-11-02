import { type NextRequest } from "next/server";

import { getAuth } from "@/server/auth/session";

/**
 * Downloads a run exactly as stored: the frozen input snapshot, the pinned reference datasets and
 * evidence retrievals (ids, hashes, sources, periods), the stored result with its database hash,
 * and plans saved from it. Nothing is recomputed, so the file matches the saved version even if
 * the engine, the evidence or the farm records change later. RLS limits it to the owner.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/runs/[runId]/export">) {
  const { runId } = await ctx.params;
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return json({ error: "Unknown run." }, 404);
  const auth = await getAuth();
  if (auth.state === "unreachable") return json({ error: "The account service did not respond. Try again." }, 503);
  if (auth.state !== "signed_in") return json({ error: "Sign in to export your runs." }, 401);
  const db = auth.supabase;

  const { data: run, error } = await db
    .from("simulation_runs")
    .select("id, status, engine_version, queued_at, started_at, finished_at, compute_ms, input_digest, snapshot_id")
    .eq("id", runId)
    .maybeSingle();
  if (error) return json({ error: "Could not load the run." }, 500);
  if (!run) return json({ error: "Run not found." }, 404);
  if (run.status !== "succeeded") return json({ error: "Only finished runs can be exported." }, 409);

  const [result, snapshot, datasets, evidence, plans] = await Promise.all([
    db.from("simulation_results").select("engine_version, result, result_sha256, created_at").eq("run_id", runId).maybeSingle(),
    db.from("simulation_input_snapshots").select("id, scenario_id, field_id, input_schema_version, engine_version, inputs, inputs_sha256, created_at").eq("id", run.snapshot_id).maybeSingle(),
    db.from("snapshot_reference_datasets").select("dataset_sha256, reference_datasets(id, kind, name, version, content_sha256)").eq("snapshot_id", run.snapshot_id),
    db
      .from("snapshot_evidence_retrievals")
      .select("response_sha256, aggregates_sha256, evidence_retrievals(id, source_id, product_id, product_version, evidence_class, spatial_support, retrieved_at, observation_start, observation_end, processing_version, outcome)")
      .eq("snapshot_id", run.snapshot_id),
    db.from("saved_plans").select("id, name, note, run_kind, strategy_id, result_sha256, created_at, updated_at").eq("run_id", runId).order("created_at"),
  ]);
  if (result.error || snapshot.error || datasets.error || evidence.error || plans.error || !result.data || !snapshot.data) return json({ error: "Could not assemble the export." }, 500);

  const body = {
    format: "astrapon-run-export",
    formatVersion: 1,
    note: "Stored records exported as saved. Nothing was recalculated. Hashes: inputs_sha256 and result_sha256 are SHA-256 computed by the database over the stored JSON text.",
    run,
    snapshot: snapshot.data,
    referenceDatasets: datasets.data,
    evidenceRetrievals: evidence.data,
    result: result.data,
    plans: plans.data.map((p) => ({ ...p, matchesStoredResult: p.result_sha256 === result.data!.result_sha256 })),
  };
  const day = (run.finished_at ?? run.queued_at).slice(0, 10);
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="astrapon-run-${day}-${runId.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
