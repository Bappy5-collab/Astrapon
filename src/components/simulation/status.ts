import type { RunSummary } from "@/domain/simulation/runs";
import { color, tokens } from "@/theme/tokens";

/** Run status chips, shared by server pages and the client run panel. */
export const RUN_STATUS: Record<RunSummary["status"], { label: string; bg: string; fg: string }> = {
  queued: { label: "Queued", bg: "#E5EEF6", fg: "#12344F" },
  running: { label: "Running", bg: "#E5EEF6", fg: "#12344F" },
  succeeded: { label: "Finished", bg: tokens.lime[200], fg: tokens.forest[950] },
  failed: { label: "Failed", bg: "#F6DED6", fg: "#6E2A1A" },
  cancelled: { label: "Cancelled", bg: tokens.neutral[200], fg: color.ink },
};
