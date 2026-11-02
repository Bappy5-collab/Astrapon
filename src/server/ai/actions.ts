"use server";

import { z } from "zod";

import type { EngineResult } from "@/domain/simulation/engine";
import { getAuth } from "@/server/auth/session";

import { explainRun, type ExplainOutcome } from "./explain";

const input = z.object({
  runId: z.uuid(),
  runKind: z.enum(["historical_replay", "scenario"]),
  focus: z.string().regex(/^(baseline|alternative-[1-9])$/),
  locale: z.enum(["en", "bn"]),
});

/** Drafts an AI explanation of the caller's own stored run (RLS), never of anyone else's. */
export async function draftExplanation(raw: unknown): Promise<ExplainOutcome | { state: "auth" }> {
  const auth = await getAuth();
  if (auth.state === "unreachable") return { state: "failed", reason: "the account service did not respond" };
  if (auth.state !== "signed_in") return { state: "auth" };
  const p = input.safeParse(raw);
  if (!p.success) return { state: "failed", reason: "the request was not valid" };
  const { data, error } = await auth.supabase.from("simulation_results").select("result, result_sha256").eq("run_id", p.data.runId).maybeSingle();
  if (error || !data) return { state: "failed", reason: "the stored result could not be loaded" };
  const result = data.result as unknown as EngineResult;
  const run = result.runs?.find((r) => r.kind === p.data.runKind);
  if (!run || !run.indicatorDefinitions) return { state: "failed", reason: "this run has no comparison to explain" };
  return explainRun({ userId: auth.userId, result, resultSha256: data.result_sha256, run, focus: p.data.focus, locale: p.data.locale });
}
