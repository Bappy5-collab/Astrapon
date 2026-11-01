"use client";

import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { SOURCE_LABELS, type PipelineSource } from "@/domain/evidence/catalog";
import type { SourceState } from "@/domain/evidence/view";
import { color, numeric, radius, tokens } from "@/theme/tokens";

import { EvidenceClassChip } from "./EvidenceInspector";

type Actions = {
  request: (sources: PipelineSource[]) => Promise<{ ok: boolean; message: string }>;
  cancel: (jobId: string) => Promise<{ ok: boolean; message: string }>;
};

const STATUS: Record<SourceState["status"], { label: string; bg: string; fg: string }> = {
  not_requested: { label: "Not fetched yet", bg: tokens.neutral[200], fg: color.ink },
  queued: { label: "Queued", bg: "#E5EEF6", fg: "#12344F" },
  running: { label: "Running", bg: "#E5EEF6", fg: "#12344F" },
  complete: { label: "Up to date", bg: tokens.lime[200], fg: tokens.forest[950] },
  failed: { label: "Failed", bg: "#F6DED6", fg: "#6E2A1A" },
  stale: { label: "Stale", bg: "#FBE7C6", fg: "#5A3A00" },
  not_applicable: { label: "Not available here", bg: tokens.neutral[200], fg: color.ink },
};

const ago = (iso: string, now: number) => {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** Per-source status with refresh / retry / cancel. Polls (by refreshing server data) while a job is active. */
export function SourcePanel({ sources, actions, compact = false, renderedAt }: { sources: SourceState[]; actions: Actions; compact?: boolean; renderedAt: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const active = sources.some((s) => s.status === "queued" || s.status === "running");

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message });
      router.refresh();
    });

  const waitingForWorker = sources.some((s) => s.job?.status === "queued" && !s.job.started_at && renderedAt - Date.parse(s.job.created_at) > 45_000);

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Typography variant="subtitle2" component="h3">
          Data sources for this field
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshRoundedIcon />}
          disabled={pending || active}
          onClick={() => run(() => actions.request(sources.filter((s) => s.status !== "not_applicable").map((s) => s.source)))}
        >
          Refresh all
        </Button>
      </Stack>
      {waitingForWorker && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Jobs are queued and waiting for the background worker. Downloads run outside the website: the worker usually starts within a few minutes, and otherwise checks the queue about every 10 minutes. In local development, start one with <code>pnpm evidence:worker</code>.
        </Alert>
      )}
      <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>
        {sources.map((s) => {
          const st = STATUS[s.status];
          const info = SOURCE_LABELS[s.source];
          const p = s.job?.progress as { step?: string; done?: number; total?: number } | undefined;
          return (
            <Box component="li" key={s.source} sx={{ p: 1.5, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surfaceRaised }} aria-busy={s.status === "running"}>
              <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {info.short}
                </Typography>
                <EvidenceClassChip value={info.evidenceClass} />
                <Chip size="small" label={st.label} sx={{ height: 22, bgcolor: st.bg, color: st.fg, fontWeight: 700 }} />
              </Stack>
              {!compact && (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                  {info.plain}
                </Typography>
              )}
              <Typography variant="caption" component="p" sx={{ mt: 0.5, ...numeric }}>
                {s.retrieval
                  ? `Fetched ${new Date(s.retrieval.retrieved_at).toISOString().slice(0, 10)} (${ago(s.retrieval.retrieved_at, renderedAt)}) · observations ${s.retrieval.observation_start} to ${s.retrieval.observation_end}${s.stale ? " · older than the refresh interval" : ""}`
                  : "No data stored for this field yet."}
              </Typography>
              {(s.status === "queued" || s.status === "running") && (
                <Box sx={{ mt: 1 }}>
                  <LinearProgress
                    variant={p?.total ? "determinate" : "indeterminate"}
                    value={p?.total ? Math.round(((p.done ?? 0) / p.total) * 100) : undefined}
                    aria-label={`${info.short} progress`}
                    sx={{ height: 6, borderRadius: 3 }}
                  />
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, ...numeric }}>
                    {s.status === "queued" ? (s.job?.error_message ? `Retry scheduled after: ${s.job.error_message}` : "Waiting for the worker…") : `${p?.step ?? "Working"}${p?.total ? ` (${p.done}/${p.total})` : ""}`}
                  </Typography>
                </Box>
              )}
              {(s.status === "failed" || (s.status === "stale" && s.job?.status === "failed")) && s.job?.error_message && (
                <Alert severity={s.retrieval ? "warning" : "error"} sx={{ mt: 1, py: 0 }}>
                  Last refresh failed{s.job.finished_at ? ` ${ago(s.job.finished_at, renderedAt)}` : ""}: {s.job.error_message}
                  {s.retrieval ? " Showing the earlier data, marked stale." : ""}
                </Alert>
              )}
              {s.status === "not_applicable" && s.job?.error_message && (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                  {s.job.error_message}
                </Typography>
              )}
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                {s.status === "queued" || s.status === "running" ? (
                  <Button size="small" disabled={pending} onClick={() => run(() => actions.cancel(s.job!.id))}>
                    Cancel
                  </Button>
                ) : s.status !== "not_applicable" ? (
                  <Button size="small" disabled={pending} onClick={() => run(() => actions.request([s.source]))}>
                    {s.status === "failed" ? "Retry" : s.retrieval ? "Refresh" : "Fetch"}
                  </Button>
                ) : null}
              </Stack>
            </Box>
          );
        })}
      </Box>
      <Box aria-live="polite">{message && <Alert severity={message.ok ? "success" : "error"} sx={{ mt: 1.5 }} onClose={() => setMessage(null)}>{message.text}</Alert>}</Box>
    </Box>
  );
}
