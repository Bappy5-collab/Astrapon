/** A simulation run as shown in the UI (status from public.simulation_runs, hash from its result). */
export type RunSummary = {
  id: string;
  snapshotId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  engineVersion: string;
  queuedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  computeMs: number | null;
  inputDigest: string | null;
  resultSha256: string | null;
};

/** A farmer-chosen option of one finished run, pinned to the stored result hash (saved_plans). */
export type SavedPlan = { id: string; runId: string; runKind: "historical_replay" | "scenario"; strategyId: string; name: string; note: string; resultSha256: string; createdAt: string; updatedAt: string };
