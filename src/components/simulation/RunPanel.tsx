"use client";

import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { TextLink } from "@/components/links";
import type { RunSummary } from "@/domain/simulation/runs";
import { color, numeric, radius } from "@/theme/tokens";

import { RUN_STATUS } from "./status";

type Result = { ok: boolean; message: string; runId?: string };
type Actions = { request: () => Promise<Result>; reproduce: (runId: string) => Promise<Result>; cancel: (runId: string) => Promise<Result> };

const stamp = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

/**
 * Queues runs and shows their state. Polls (by refreshing server data) while a run is active.
 * Reproducibility: runs of the same snapshot are compared by their stored result hash.
 */
export function RunPanel({ runs, actions, renderedAt, canRun, blockedReason }: { runs: RunSummary[]; actions: Actions; renderedAt: number; canRun: boolean; blockedReason?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const active = runs.some((r) => r.status === "queued" || r.status === "running");

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);

  const act = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message });
      router.refresh();
    });

  const waiting = runs.some((r) => r.status === "queued" && renderedAt - Date.parse(r.queuedAt) > 45_000);
  // Group finished runs by snapshot to show reproducibility.
  const bySnapshot = new Map<string, string[]>();
  for (const r of runs) if (r.status === "succeeded" && r.resultSha256) bySnapshot.set(r.snapshotId, [...(bySnapshot.get(r.snapshotId) ?? []), r.resultSha256]);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
        <Button variant="contained" startIcon={<PlayArrowRoundedIcon />} disabled={pending || active || !canRun} onClick={() => act(actions.request)}>
          Run simulation
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 640 }}>
          Freezes the current inputs into a snapshot (reused when nothing changed) and queues the run. The background worker computes it; this page updates by itself.
        </Typography>
      </Stack>
      {!canRun && blockedReason && <Alert severity="info">{blockedReason}</Alert>}
      {active && <LinearProgress aria-label="Run in progress" />}
      {waiting && (
        <Alert severity="warning">
          This run has been queued for over a minute. The background worker may not be running: start it with <code>pnpm evidence:worker</code>.
        </Alert>
      )}
      {message && <Alert severity={message.ok ? "success" : "error"}>{message.text}</Alert>}
      {runs.length > 0 && (
        <Box component="ul" aria-label="Runs" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>
          {runs.slice(0, 8).map((r) => {
            const st = RUN_STATUS[r.status];
            const same = bySnapshot.get(r.snapshotId) ?? [];
            const reproduced = same.length > 1 ? (new Set(same).size === 1 ? "identical" : "different") : null;
            return (
              <Box component="li" key={r.id} sx={{ p: 1.5, border: `1px solid ${color.line}`, borderRadius: `${radius.md}px`, bgcolor: color.surfaceRaised }}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                    <Chip size="small" label={st.label} sx={{ bgcolor: st.bg, color: st.fg, fontWeight: 600 }} />
                    <Typography variant="body2" sx={numeric}>
                      {stamp(r.queuedAt)} · engine {r.engineVersion}
                      {r.computeMs != null ? ` · ${r.computeMs} ms` : ""}
                      {r.resultSha256 ? ` · result ${r.resultSha256.slice(0, 10)}…` : ""}
                    </Typography>
                    {reproduced === "identical" && <Chip size="small" variant="outlined" label="Re-run gave an identical result" />}
                    {reproduced === "different" && <Chip size="small" color="error" label="Re-runs differ" />}
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    {r.status === "succeeded" && <TextLink href={`/runs/${r.id}`}>Open result</TextLink>}
                    {r.status === "succeeded" && (
                      <Button size="small" disabled={pending || active} onClick={() => act(() => actions.reproduce(r.id))}>
                        Re-run and compare
                      </Button>
                    )}
                    {(r.status === "queued" || r.status === "running") && (
                      <Button size="small" disabled={pending} onClick={() => act(() => actions.cancel(r.id))}>
                        Cancel
                      </Button>
                    )}
                  </Stack>
                </Stack>
                {r.status === "failed" && r.errorMessage && (
                  <Typography variant="body2" sx={{ mt: 1, color: "#6E2A1A" }}>
                    {r.errorMessage}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}
