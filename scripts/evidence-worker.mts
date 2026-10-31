/**
 * pnpm evidence:worker [--once] [--concurrency N]
 *
 * Processes public.evidence_jobs outside the web server, so long provider downloads never run
 * inside a short-lived web request. Connects with SUPABASE_DB_URL (scripts only; the project ref
 * is verified by connect.mts) as a trusted role.
 *
 * - Claims jobs with FOR UPDATE SKIP LOCKED and a lease; a crashed worker's job is reclaimed when
 *   its lease expires. Raw chunks are cached on disk, so a reclaimed job resumes without
 *   re-downloading what it already has.
 * - Retries "unavailable" failures with backoff up to the job's max_attempts; "invalid" and
 *   "not applicable" outcomes fail at once with the reason.
 * - Writes the retrieval and its aggregates in one transaction. If nothing changed since the
 *   field's latest retrieval (same cache key and response hash), the job completes by pointing at
 *   that retrieval instead of storing a duplicate.
 * - Never prints credentials.
 */
import type postgres from "postgres";

import type { PipelineSource } from "../src/domain/evidence/catalog";
import { RUNNERS } from "../src/server/pipeline/run";
import { PipelineError, pipelineErrorKind, type PipelineOutput } from "../src/server/pipeline/types";
import { connect, runMain } from "./db/connect.mts";

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const CONCURRENCY = Math.min(4, Math.max(1, Number(args[args.indexOf("--concurrency") + 1]) || 2));
const LEASE = "3 minutes";
const POLL_MS = 3000;

type Job = { id: string; owner_id: string; field_id: string; source_id: PipelineSource; attempts: number; max_attempts: number };

const log = (...m: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...m);

async function claim(sql: postgres.Sql): Promise<Job | null> {
  const rows = await sql<Job[]>`
    update public.evidence_jobs j
       set status = 'running', attempts = j.attempts + 1, lease_until = now() + ${LEASE}::interval,
           started_at = coalesce(j.started_at, now()), error_kind = null, error_message = null,
           progress = jsonb_build_object('step', 'Starting')
     where j.id = (select q.id from public.evidence_jobs q
                    where (q.status = 'queued' and q.next_attempt_at <= now())
                       or (q.status = 'running' and q.lease_until < now())
                    order by q.next_attempt_at
                    for update skip locked limit 1)
    returning j.id, j.owner_id, j.field_id, j.source_id, j.attempts, j.max_attempts`;
  return rows[0] ?? null;
}

async function fieldContext(sql: postgres.Sql, fieldId: string) {
  const [f] = await sql<{ boundary: unknown; lon: number; lat: number; country_code: string | null }[]>`
    select extensions.st_asgeojson(f.boundary, 7)::jsonb as boundary,
           extensions.st_x(extensions.st_pointonsurface(f.boundary)) as lon,
           extensions.st_y(extensions.st_pointonsurface(f.boundary)) as lat,
           fa.country_code
      from public.fields f join public.farms fa on fa.id = f.farm_id
     where f.id = ${fieldId} and f.boundary is not null`;
  if (!f) throw new PipelineError("The field no longer exists or has no boundary.", "not_applicable");
  const g = f.boundary as { type: "MultiPolygon"; coordinates: [number, number][][][] };
  // A single-part MultiPolygon is handled as a Polygon by the domain helpers.
  const boundary = g.coordinates.length === 1 ? { type: "Polygon" as const, coordinates: g.coordinates[0]! } : g;
  return { fieldId, centroid: { lat: f.lat, lon: f.lon }, boundary, countryCode: f.country_code };
}

async function store(sql: postgres.Sql, job: Job, out: PipelineOutput): Promise<{ retrievalId: string; reused: boolean } | null> {
  const r = out.retrieval;
  return sql.begin(async (tx) => {
    const [still] = await tx`select 1 from public.evidence_jobs where id = ${job.id} and status = 'running' for update`;
    if (!still) return null; // cancelled while running
    const [prev] = await tx<{ id: string }[]>`
      select id from public.evidence_retrievals
       where field_id = ${job.field_id} and source_id = ${r.sourceId} and cache_key = ${r.cacheKey} and response_sha256 = ${r.responseSha256}
       order by created_at desc limit 1`;
    let retrievalId: string;
    let reused = false;
    if (prev) {
      retrievalId = prev.id;
      reused = true;
    } else {
      const [ins] = await tx<{ id: string }[]>`
        insert into public.evidence_retrievals
          (owner_id, field_id, source_id, product_id, product_version, evidence_class, spatial_support, request, retrieved_at,
           response_sha256, response_bytes, outcome, checks, provenance, cache_key, processing_version, observation_start, observation_end, job_id)
        values (${job.owner_id}, ${job.field_id}, ${r.sourceId}, ${r.productId}, ${r.productVersion}, ${r.evidenceClass}, ${r.spatialSupport.slice(0, 200)},
                ${tx.json(r.request as postgres.JSONValue)}, ${r.retrievedAt}, ${r.responseSha256}, ${r.responseBytes}, ${r.outcome},
                ${tx.json(r.checks as unknown as postgres.JSONValue)}, ${tx.json(r.provenance as postgres.JSONValue)}, ${r.cacheKey}, ${r.processingVersion},
                ${r.observationStart}, ${r.observationEnd}, ${job.id})
        returning id`;
      retrievalId = ins!.id;
      const rows = out.aggregates.map((a) => ({
        owner_id: job.owner_id, field_id: job.field_id, retrieval_id: retrievalId, variable: a.variable, unit: a.unit, aggregation: a.aggregation,
        period_start: a.periodStart, period_end: a.periodEnd, value: a.value, valid_count: a.validCount, expected_count: a.expectedCount, pixel: a.pixel,
      }));
      for (let i = 0; i < rows.length; i += 1000) await tx`insert into public.evidence_aggregates ${tx(rows.slice(i, i + 1000))}`;
    }
    await tx`update public.evidence_jobs set status = 'complete', finished_at = now(), lease_until = null, retrieval_id = ${retrievalId},
               progress = ${tx.json({ step: reused ? "No change since the last retrieval" : "Saved", aggregates: out.aggregates.length })}
             where id = ${job.id}`;
    return { retrievalId, reused };
  });
}

async function fail(sql: postgres.Sql, job: Job, e: unknown) {
  const kind = pipelineErrorKind(e);
  const message = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
  const retry = (kind === "unavailable" || kind === "internal") && job.attempts < job.max_attempts;
  if (retry) {
    await sql`update public.evidence_jobs set status = 'queued', lease_until = null, error_kind = ${kind}, error_message = ${message},
               next_attempt_at = now() + make_interval(secs => ${30 * job.attempts * job.attempts}),
               progress = ${sql.json({ step: `Waiting to retry (attempt ${job.attempts} of ${job.max_attempts} failed)` })}
             where id = ${job.id} and status = 'running'`;
  } else {
    await sql`update public.evidence_jobs set status = 'failed', finished_at = now(), lease_until = null, error_kind = ${kind}, error_message = ${message},
               progress = ${sql.json({ step: "Failed" })}
             where id = ${job.id} and status = 'running'`;
  }
  log(`job ${job.id.slice(0, 8)} ${job.source_id}: ${retry ? "will retry" : "failed"} (${kind}) ${message.slice(0, 160)}`);
}

async function process1(sql: postgres.Sql, job: Job) {
  log(`job ${job.id.slice(0, 8)} ${job.source_id} attempt ${job.attempts}/${job.max_attempts}`);
  let lastBeat = 0;
  const progress = async (p: { step: string; done: number; total: number }) => {
    if (Date.now() - lastBeat < 4000) return;
    lastBeat = Date.now();
    await sql`update public.evidence_jobs set progress = ${sql.json(p)}, lease_until = now() + ${LEASE}::interval where id = ${job.id} and status = 'running'`;
  };
  try {
    const ctx = await fieldContext(sql, job.field_id);
    const out = await RUNNERS[job.source_id](ctx, progress);
    const res = await store(sql, job, out);
    log(`job ${job.id.slice(0, 8)} ${job.source_id}: ${res ? (res.reused ? "complete (unchanged)" : `complete, ${out.aggregates.length} aggregates, outcome ${out.retrieval.outcome}`) : "cancelled meanwhile"}`);
  } catch (e) {
    await fail(sql, job, e);
  }
}

runMain(async () => {
  const { sql } = connect({ max: CONCURRENCY + 1 });
  log(`evidence worker started (concurrency ${CONCURRENCY}${ONCE ? ", --once" : ""})`);
  let stop = false;
  process.on("SIGINT", () => {
    stop = true;
    log("stopping after current jobs…");
  });
  const lanes = Array.from({ length: CONCURRENCY }, async () => {
    while (!stop) {
      const job = await claim(sql);
      if (!job) {
        if (ONCE) return;
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      await process1(sql, job);
    }
  });
  await Promise.all(lanes);
  await sql.end();
  return 0;
});
