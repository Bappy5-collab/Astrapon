"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ReplayPlayer, type ReplayGeometry } from "@/components/replay/ReplayPlayer";
import { useFmt } from "@/components/replay/format";
import type { ExplainOutcome } from "@/domain/explain/grounding";
import type { EngineResult, PriorityKey, RunView } from "@/domain/simulation/engine";
import type { SavedPlan } from "@/domain/simulation/runs";
import { optionsOf } from "@/domain/simulation/view";
import { useT } from "@/lib/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/sim-messages";
import { color } from "@/theme/tokens";

import { ActionMessage, toUiMessage, type UiMessage } from "./ActionMessage";
import { ComparePanel, type Weights } from "./ComparePanel";
import { ExplainPanel } from "./ExplainPanel";
import { PlanPanel, type PlanActions } from "./PlanPanel";
import { Glossary, WhyPanel } from "./WhyPanel";

const TABS = ["simulate", "compare", "why", "explain", "details", "save"] as const;
type TabId = (typeof TABS)[number];
type Result = { ok: boolean; message: string; auth?: boolean; id?: string };

/**
 * The run journey on one page: replay, compare, why, explanation, details, save/export. Shared
 * state (weather kind, focused option, unsaved priority preview with undo) lives here so moving
 * between sections never loses it. Nothing here recomputes the model.
 */
export function RunExplorer({
  runId,
  result,
  plans,
  geometry,
  outdated,
  snapshotDate,
  scenarioId,
  aiAvailable,
  details,
  actions,
}: {
  runId: string;
  result: EngineResult;
  plans: SavedPlan[];
  geometry: ReplayGeometry;
  outdated: boolean | null;
  snapshotDate: string | null;
  scenarioId: string | null;
  aiAvailable: boolean;
  details: ReactNode;
  actions: PlanActions & {
    rerun: (() => Promise<Result>) | null;
    savePriorities: ((w: Weights) => Promise<Result>) | null;
    draft: (input: { runId: string; runKind: RunView["kind"]; focus: string; locale: "en" | "bn" }) => Promise<ExplainOutcome | { state: "auth" }>;
  };
}) {
  const t = useT();
  const f = useFmt();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("simulate");
  const [kind, setKind] = useState<RunView["kind"]>(result.runs[0]?.kind ?? "historical_replay");
  const run = result.runs.find((r) => r.kind === kind) ?? result.runs[0];
  const [focus, setFocus] = useState<string>(run?.comparison?.ranking[0] ?? (run ? optionsOf(run)[0]?.id : undefined) ?? "baseline");
  const [weights, setWeights] = useState<Weights>(result.priorities);
  const [history, setHistory] = useState<Weights[]>([]);
  const [prioMsg, setPrioMsg] = useState<UiMessage | null>(null);
  const [rerunMsg, setRerunMsg] = useState<UiMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  if (!run) return <Alert severity="warning">{result.messages[0] ?? t("sim.ex.noOptions")}</Alert>;
  const options = optionsOf(run);
  const focusId = options.some((o) => o.id === focus) ? focus : (options[0]?.id ?? "baseline");

  const changeWeights = (w: Weights) => {
    setHistory((h) => [...h.slice(-19), weights]);
    setWeights(w);
  };
  const undo = () => {
    if (!history.length) return;
    setWeights(history[history.length - 1]!);
    setHistory(history.slice(0, -1));
  };

  // Every request carries a sequence number; an answer that arrives after a newer request is ignored.
  const runAction = async (fn: () => Promise<Result>, set: (m: UiMessage) => void, ok?: (r: Result) => void) => {
    const mine = ++seq.current;
    setBusy(true);
    let r: Result | null = null;
    try {
      r = await fn();
    } catch {
      r = null;
    }
    if (mine !== seq.current) return;
    setBusy(false);
    set(toUiMessage(r, t("sim.err.network")));
    if (r?.ok) ok?.(r);
  };

  const openWhy = (id: string) => {
    setFocus(id);
    setTab("why");
  };

  return (
    <Box>
      {result.status === "ok" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {fmt(t("sim.notForecast"), { from: result.period.fromYear, to: result.period.toYear })}
        </Alert>
      )}
      {outdated === true && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {fmt(t("sim.outdated"), { date: snapshotDate ? f.date(snapshotDate) : "—" })}
          {actions.rerun && (
            <Box sx={{ mt: 1 }}>
              <Button variant="outlined" color="inherit" size="small" disabled={busy} onClick={() => runAction(actions.rerun!, setRerunMsg, () => router.refresh())}>
                {t("sim.rerun")}
              </Button>
            </Box>
          )}
        </Alert>
      )}
      {outdated === false && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t("sim.upToDate")}
        </Typography>
      )}
      {rerunMsg && <ActionMessage message={rerunMsg.ok ? { ...rerunMsg, text: t("sim.rerunQueued"), href: scenarioId ? `/scenarios/${scenarioId}` : undefined, hrefLabel: t("sim.open") } : rerunMsg} />}

      {result.runs.length > 1 && (
        <Box sx={{ mb: 1.5 }} className="no-print">
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            {t("sim.run.choose")}
          </Typography>
          <ToggleButtonGroup size="small" exclusive value={kind} onChange={(_, v) => v && setKind(v)} aria-label={t("sim.run.choose")}>
            {result.runs.map((r) => (
              <ToggleButton key={r.kind} value={r.kind}>
                {t(`sim.run.${r.kind}`)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}
      {run.kind === "scenario" && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {fmt(t("sim.hypothetical"), {
            what: run.transformations.map((x) => (x.kind === "precipitation_scale" ? `${t("sim.col.rain")} ${x.percent > 0 ? "+" : ""}${f.int(x.percent)}%` : `${t("sim.col.tmax")}/${t("sim.col.tmin")} ${x.celsius > 0 ? "+" : ""}${f.num(x.celsius)} °C`)).join(", "),
          })}
        </Alert>
      )}

      <Box sx={{ borderBottom: `1px solid ${color.line}`, mb: 2 }} className="no-print">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label={t("sim.tabs")}>
          {TABS.map((id) => (
            <Tab key={id} value={id} label={t(`sim.tab.${id}`)} id={`tab-${id}`} aria-controls={`panel-${id}`} />
          ))}
        </Tabs>
      </Box>

      <Box role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {printing ? (
          details
        ) : tab === "simulate" ? (
          run.timeline ? (
            <ReplayPlayer key={run.kind} timeline={run.timeline} options={options} ranking={run.comparison?.ranking ?? options.map((o) => o.id)} geometry={geometry} />
          ) : (
            <Alert severity="info">{result.engineVersion !== "1.1.0" && !run.indicatorDefinitions ? fmt(t("sim.oldEngine"), { v: result.engineVersion }) : `${t("sim.noTimeline")}. ${run.timelineNote ?? ""}`}</Alert>
          )
        ) : tab === "compare" ? (
          run.indicatorDefinitions ? (
            <ComparePanel
              result={result}
              run={run}
              weights={weights}
              onWeights={changeWeights}
              canUndo={history.length > 0}
              onUndo={undo}
              onSave={actions.savePriorities ? () => runAction(() => actions.savePriorities!(weights), setPrioMsg, () => router.refresh()) : null}
              saving={busy}
              message={prioMsg}
              onWhy={openWhy}
            />
          ) : (
            <Alert severity="info">{fmt(t("sim.oldEngine"), { v: result.engineVersion })}</Alert>
          )
        ) : tab === "why" ? (
          <>
            <WhyPanel result={result} run={run} optionId={focusId} onOption={setFocus} />
            <Glossary />
          </>
        ) : tab === "explain" ? (
          run.indicatorDefinitions ? (
            <ExplainPanel
              result={result}
              run={run}
              runId={runId}
              focus={focusId}
              aiAvailable={aiAvailable}
              draft={actions.draft}
              onPreview={(p: PriorityKey, v: number) => {
                changeWeights({ ...weights, [p]: v });
                setTab("compare");
              }}
              onOpenOption={openWhy}
            />
          ) : (
            <Alert severity="info">{fmt(t("sim.oldEngine"), { v: result.engineVersion })}</Alert>
          )
        ) : tab === "details" ? (
          details
        ) : (
          <PlanPanel runId={runId} result={result} runKind={run.kind} focus={focusId} plans={plans} actions={actions} />
        )}
      </Box>
    </Box>
  );
}
