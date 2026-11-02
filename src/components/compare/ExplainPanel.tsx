"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRef, useState } from "react";

import { useFmt, useIndicatorText, useOptionName } from "@/components/replay/format";
import type { CheckedDraft, ExplainOutcome, ExplainSource } from "@/domain/explain/grounding";
import type { EngineResult, PriorityKey, RunView } from "@/domain/simulation/engine";
import { differences, indicatorTable, optionsOf, reasons } from "@/domain/simulation/view";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/sim-messages";
import { color, radius, tokens } from "@/theme/tokens";

import { ActionMessage } from "./ActionMessage";

type Draft = { key: string; outcome: ExplainOutcome | { state: "auth" } };

/**
 * Deterministic explanation generated from the stored result (always available), and an optional
 * AI draft from the server. Drafts are keyed by option, weather and language; a late answer for an
 * earlier request is ignored, and suggested actions only run when the farmer clicks them.
 */
export function ExplainPanel({
  result,
  run,
  runId,
  focus,
  aiAvailable,
  draft,
  onDraft,
  onPreview,
  onOpenOption,
}: {
  result: EngineResult;
  run: RunView;
  runId: string;
  focus: string;
  aiAvailable: boolean;
  draft: (input: { runId: string; runKind: RunView["kind"]; focus: string; locale: "en" | "bn" }) => Promise<ExplainOutcome | { state: "auth" }>;
  onDraft?: () => void;
  onPreview: (priority: PriorityKey, value: number) => void;
  onOpenOption: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const lines = useDeterministic(result, run);
  const [current, setCurrent] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const key = `${runId}|${run.kind}|${focus}|${locale}`;
  const optionName = useOptionName();
  const focusOption = optionsOf(run).find((o) => o.id === focus);

  const ask = async () => {
    const mine = ++seq.current;
    setBusy(true);
    onDraft?.();
    let outcome: ExplainOutcome | { state: "auth" };
    try {
      outcome = await draft({ runId, runKind: run.kind, focus, locale });
    } catch {
      outcome = { state: "failed", reason: t("sim.err.network") };
    }
    if (mine !== seq.current) return; // a newer request superseded this one
    setCurrent({ key, outcome });
    setBusy(false);
  };

  const shown = current?.key === key ? current.outcome : null;

  return (
    <Box>
      <Box sx={{ p: 2, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surfaceRaised }}>
        <Chip size="small" label={t("sim.ai.deterministic")} sx={{ mb: 1, fontWeight: 600, bgcolor: tokens.neutral[200], color: color.ink }} />
        {lines.map((l, i) => (
          <Typography key={i} sx={{ mb: 1 }}>
            {l}
          </Typography>
        ))}
      </Box>

      <Box component="section" aria-labelledby="ai-h" sx={{ mt: 2.5 }}>
        <Typography id="ai-h" variant="h6" component="h3">
          {t("sim.ai.optional")}
          {focusOption ? ` · ${optionName(focusOption)}` : ""}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, maxWidth: 760 }}>
          {t("sim.ai.intro")}
        </Typography>
        {!aiAvailable ? (
          <Alert severity="info">{t("sim.ai.unconfigured")}</Alert>
        ) : (
          <Button variant="outlined" onClick={ask} disabled={busy}>
            {busy ? t("sim.ai.busy") : t("sim.ai.button")}
          </Button>
        )}
        {current && current.key !== key && !busy && <Alert severity="info" sx={{ mt: 1.5 }}>{t("sim.ai.stale")}</Alert>}
        {shown?.state === "auth" && <ActionMessage message={{ ok: false, text: "", auth: true }} />}
        {shown?.state === "unconfigured" && <Alert severity="info" sx={{ mt: 1.5 }}>{t("sim.ai.unconfigured")}</Alert>}
        {shown?.state === "failed" && <Alert severity="warning" sx={{ mt: 1.5 }}>{fmt(t("sim.ai.failed"), { why: shown.reason })}</Alert>}
        {shown?.state === "ok" && <DraftView draft={shown.draft} sources={shown.sources} onPreview={onPreview} onOpenOption={onOpenOption} />}
      </Box>
    </Box>
  );
}

function DraftView({ draft, sources, onPreview, onOpenOption }: { draft: CheckedDraft; sources: ExplainSource[]; onPreview: (p: PriorityKey, v: number) => void; onOpenOption: (id: string) => void }) {
  const t = useT();
  const optionName = useOptionName();
  const label = (id: string) => sources.find((s) => s.id === id)?.label ?? id;
  return (
    <Box sx={{ mt: 1.5, p: 2, borderRadius: `${radius.md}px`, border: `1px dashed ${tokens.forest[400]}` }}>
      <Chip size="small" label={t("sim.ai.label")} sx={{ mb: 1, fontWeight: 700, bgcolor: "#F6E7C8", color: tokens.forest[950] }} />
      {draft.paragraphs.map((p, i) => (
        <Box key={i} sx={{ mb: 1.25 }}>
          <Typography>{p.text}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t("sim.ai.sources")}: {p.sources.map(label).join("; ")}
          </Typography>
        </Box>
      ))}
      {draft.questions.length > 0 && (
        <>
          <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
            {t("sim.why.questions")}
          </Typography>
          <Box component="ul" sx={{ mt: 0.5, pl: 2.5 }}>
            {draft.questions.map((q) => (
              <li key={q}>
                <Typography variant="body2">{q}</Typography>
              </li>
            ))}
          </Box>
        </>
      )}
      {draft.actions.length > 0 && (
        <>
          <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
            {t("sim.ai.actions")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 1 }}>
            {draft.actions.map((a, i) =>
              a.kind === "open_option" ? (
                <Button key={i} size="small" variant="outlined" onClick={() => onOpenOption(a.option)}>
                  {t("sim.ai.openOption")}: {optionName({ id: a.option, kind: a.option === "baseline" ? "baseline" : "alternative" })}
                </Button>
              ) : (
                <Button key={i} size="small" variant="outlined" onClick={() => onPreview(a.priority, a.value)}>
                  {t("sim.ai.applyPreview")}: {t(`sim.prio.p.${a.priority}` as "sim.prio.p.water_use")} = {a.value}
                </Button>
              ),
            )}
          </Stack>
        </>
      )}
      {draft.discarded > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {fmt(t("sim.ai.discarded"), { n: draft.discarded })}
        </Typography>
      )}
    </Box>
  );
}

/** Plain-language summary built only from stored values, in the reader's language. */
function useDeterministic(result: EngineResult, run: RunView): string[] {
  const t = useT();
  const f = useFmt();
  const optionName = useOptionName();
  const ind = useIndicatorText();
  const options = optionsOf(run);
  const cmp = run.comparison;
  if (!options.length || !cmp) return [t("sim.ex.noOptions")];
  const lines = [fmt(t("sim.ex.compared"), { n: f.int(options.length), from: result.period.fromYear, to: result.period.toYear })];
  const top = options.find((o) => o.id === cmp.ranking[0])!;
  lines.push(fmt(t("sim.ex.top"), { name: optionName(top), label: top.label, s: f.num(cmp.scores[top.id], 3) }));
  const main = reasons(cmp, top.id).slice(0, 2);
  if (main.length) lines.push(fmt(t("sim.ex.main"), { list: main.map((r) => t(`sim.prio.p.${r.priority}` as "sim.prio.p.water_use")).join(", ") }));
  if (run.baseline) {
    const table = indicatorTable(run);
    for (const a of run.alternatives) {
      const d = differences(run.indicatorDefinitions, table, run.baseline.id, a.id).filter((x) => x.scored);
      const list = (better: boolean) => d.filter((x) => x.better === better).map((x) => ind.label(x.key, x.label)).join(", ") || t("sim.ex.none");
      lines.push(fmt(t("sim.ex.vs"), { name: optionName(a), better: list(true), worse: list(false) }));
    }
  }
  if (cmp.stability === "stable") lines.push(t("sim.ex.stable"));
  if (cmp.stability === "fragile") lines.push(t("sim.ex.fragile"));
  if (result.gaps.length) lines.push(fmt(t("sim.ex.gaps"), { n: f.int(result.gaps.length) }));
  return lines;
}
