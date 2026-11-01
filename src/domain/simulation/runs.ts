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
