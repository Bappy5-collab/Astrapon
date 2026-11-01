import "server-only";

import { getServerSecrets } from "@/server/env";

/**
 * Starts the GitHub Actions evidence worker (.github/workflows/evidence-worker.yml) right after a
 * job or run is queued, so the deployed site does not wait for the 10-minute schedule. Best
 * effort: without GITHUB_DISPATCH_TOKEN, or when GitHub refuses, nothing changes for the user —
 * the queued job is still picked up by the schedule or a local worker. Never logs the token.
 */

const REPO = process.env.GITHUB_DISPATCH_REPO?.trim() || "Bappy5-collab/Astrapon";
const WORKFLOW = "evidence-worker.yml";
const REF = "main";
/** One dispatch per server instance per minute: a running worker drains everything queued meanwhile. */
const MIN_INTERVAL_MS = 60_000;

let lastDispatchAt = 0;

export type DispatchOutcome = "dispatched" | "throttled" | "unconfigured" | "failed";

export async function dispatchWorker(): Promise<DispatchOutcome> {
  const token = getServerSecrets().githubDispatchToken;
  if (!token) return "unconfigured";
  const now = Date.now();
  if (now - lastDispatchAt < MIN_INTERVAL_MS) return "throttled";
  lastDispatchAt = now;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: REF }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.status === 204) return "dispatched";
    console.warn(`worker dispatch: GitHub answered HTTP ${res.status}`);
  } catch (e) {
    console.warn(`worker dispatch: ${e instanceof Error ? e.name : "request failed"}`);
  }
  lastDispatchAt = 0;
  return "failed";
}
