import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PIPELINE_SOURCES, type PipelineSource } from "@/domain/evidence/catalog";
import { buildEvidenceView, sourceState, type FieldEvidence, type RetrievalMeta, type SourceState, type StoredAggregate } from "@/domain/evidence/view";
import type { Database } from "@/server/database/database.types";

type Db = SupabaseClient<Database>;

const PAGE = 1000;

async function allAggregates(db: Db, retrievalId: string): Promise<StoredAggregate[]> {
  const out: StoredAggregate[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("evidence_aggregates")
      .select("variable, unit, aggregation, period_start, period_end, value, valid_count, expected_count, pixel")
      .eq("retrieval_id", retrievalId)
      .order("variable")
      .order("period_start")
      .order("pixel")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load evidence values (${error.code})`);
    out.push(...(data as StoredAggregate[]));
    if (data.length < PAGE) return out;
  }
}

/**
 * Evidence state for a field: per source, the newest usable retrieval (valid or partial) and the
 * newest job. A failed refresh never hides the previous retrieval; the view marks it stale instead.
 * Each source is loaded independently, so one failing source does not break the others.
 */
export async function getFieldEvidence(db: Db, fieldId: string, now = new Date()): Promise<FieldEvidence> {
  const [retrievals, jobs] = await Promise.all([
    db
      .from("evidence_retrievals")
      .select("id, source_id, product_id, product_version, processing_version, evidence_class, spatial_support, retrieved_at, created_at, observation_start, observation_end, outcome, response_sha256, response_bytes, cache_key, request, provenance, checks")
      .eq("field_id", fieldId)
      .in("outcome", ["valid", "partial"])
      .order("retrieved_at", { ascending: false })
      .order("created_at", { ascending: false }),
    db
      .from("evidence_jobs")
      .select("id, source_id, status, attempts, max_attempts, progress, error_kind, error_message, created_at, started_at, finished_at, next_attempt_at")
      .eq("field_id", fieldId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (retrievals.error || jobs.error) throw new Error("Could not load evidence status");

  const latest = new Map<PipelineSource, RetrievalMeta>();
  for (const r of retrievals.data as unknown as RetrievalMeta[]) if (!latest.has(r.source_id)) latest.set(r.source_id, r);
  const latestJob = new Map<string, SourceState["job"]>();
  for (const j of jobs.data) if (!latestJob.has(j.source_id)) latestJob.set(j.source_id, j as unknown as SourceState["job"]);

  const loaded: Partial<Record<PipelineSource, { meta: RetrievalMeta; rows: StoredAggregate[] }>> = {};
  const loadErrors: Partial<Record<PipelineSource, string>> = {};
  await Promise.all(
    [...latest].map(async ([source, meta]) => {
      try {
        loaded[source] = { meta, rows: await allAggregates(db, meta.id) };
      } catch (e) {
        loadErrors[source] = (e as Error).message;
      }
    }),
  );

  const sources = PIPELINE_SOURCES.map((s) => sourceState(s, latest.get(s) ?? null, latestJob.get(s) ?? null, now));
  return { sources, view: buildEvidenceView({ retrievals: loaded }), loadErrors };
}
