"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { PIPELINE_SOURCES } from "@/domain/evidence/catalog";
import { getAuth } from "@/server/auth/session";
import { describeDbError } from "@/server/database/errors";
import { dispatchWorker } from "@/server/worker/dispatch";

export type EvidenceActionResult = { ok: boolean; message: string };

const ids = z.object({ fieldId: z.uuid(), sources: z.array(z.enum(PIPELINE_SOURCES)).min(1).max(PIPELINE_SOURCES.length) });

/**
 * Queues provider retrievals for a field. Only enqueues: the separate evidence worker does the
 * download and processing, so this request returns immediately. Repeated clicks return the job
 * that is already queued or running (deduplicated in request_evidence).
 */
export async function requestEvidence(fieldId: string, sources: string[]): Promise<EvidenceActionResult> {
  const auth = await getAuth();
  if (auth.state !== "signed_in") return { ok: false, message: auth.state === "unreachable" ? "The account service did not respond. Try again." : "Sign in again." };
  const p = ids.safeParse({ fieldId, sources });
  if (!p.success) return { ok: false, message: "Unknown field or source." };
  for (const s of p.data.sources) {
    const { error } = await auth.supabase.rpc("request_evidence", { p_field_id: p.data.fieldId, p_source_id: s });
    if (error) return { ok: false, message: describeDbError(error) };
  }
  after(dispatchWorker);
  revalidatePath(`/fields/${p.data.fieldId}`, "layout");
  return { ok: true, message: p.data.sources.length > 1 ? "Refresh queued for all sources." : "Refresh queued." };
}

export async function cancelEvidenceJob(fieldId: string, jobId: string): Promise<EvidenceActionResult> {
  const auth = await getAuth();
  if (auth.state !== "signed_in") return { ok: false, message: "Sign in again." };
  if (!z.uuid().safeParse(jobId).success || !z.uuid().safeParse(fieldId).success) return { ok: false, message: "Unknown job." };
  const { data, error } = await auth.supabase.from("evidence_jobs").update({ status: "cancelled" }).eq("id", jobId).in("status", ["queued", "running"]).select("id");
  if (error) return { ok: false, message: describeDbError(error) };
  revalidatePath(`/fields/${fieldId}`, "layout");
  return data.length ? { ok: true, message: "Cancelled." } : { ok: false, message: "That job had already finished." };
}
