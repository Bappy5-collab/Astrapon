/**
 * Grounding for optional AI explanations (pure). The model sees a minimal, structured copy of one
 * stored run (no names, notes, coordinates or account details) and must cite source ids from a
 * closed list. Its draft is then checked here: statements citing unknown sources, citing nothing,
 * or containing numbers absent from the context are dropped; suggested actions must name a known
 * option or priority and a valid weight. The deterministic explanation never depends on this.
 */
import type { EngineResult, PriorityKey, RunView } from "@/domain/simulation/engine";
import { PRIORITY_KEYS } from "@/domain/simulation/engine";
import { differences, indicatorTable, optionsOf, reasons } from "@/domain/simulation/view";

export type ExplainSource = { id: string; label: string };
export type ExplainContext = { data: Record<string, unknown>; sources: ExplainSource[]; optionIds: string[] };

export type DraftParagraph = { text: string; sources: string[] };
export type DraftAction = { kind: "preview_priorities" | "open_option"; option: string | null; priority: string | null; value: number | null };
export type Draft = { paragraphs: DraftParagraph[]; questions: string[]; actions: DraftAction[] };

export type CheckedAction = { kind: "preview_priorities"; priority: PriorityKey; value: number } | { kind: "open_option"; option: string };
export type CheckedDraft = { paragraphs: DraftParagraph[]; questions: string[]; actions: CheckedAction[]; discarded: number };
/** What the server returns for a draft request; never contains credentials. */
export type ExplainOutcome = { state: "ok"; draft: CheckedDraft; sources: ExplainSource[]; model: string } | { state: "unconfigured" } | { state: "failed"; reason: string };

const LIMIT = { options: 4, indicators: 24, gaps: 8, questions: 8, rejections: 8, text: 200 } as const;
const clip = (s: string) => (s.length > LIMIT.text ? `${s.slice(0, LIMIT.text)}…` : s);

/** Builds the only data the model receives for one run kind, focused on one option. */
export function buildExplainContext(result: EngineResult, run: RunView, focus: string): ExplainContext {
  const options = optionsOf(run).slice(0, LIMIT.options);
  const table = indicatorTable(run);
  const defs = run.indicatorDefinitions.slice(0, LIMIT.indicators);
  const cmp = run.comparison;
  const sources: ExplainSource[] = [
    { id: "result:ranking", label: "Ranking and relative scores of this run" },
    { id: "result:indicators", label: "Indicator table of this run" },
    { id: "result:rejections", label: "Constraints and rejected options of this run" },
    { id: "result:gaps", label: "Data gaps and assumptions of this run" },
  ];
  if (result.evidence.weatherRetrievalId) sources.push({ id: `evidence:${result.evidence.weatherRetrievalId}`, label: "NASA POWER daily weather (pinned retrieval)" });
  if (result.evidence.soilRetrievalId) sources.push({ id: `evidence:${result.evidence.soilRetrievalId}`, label: "USDA SSURGO soil survey (pinned retrieval)" });
  for (const d of result.datasets) sources.push({ id: `dataset:${d.id}`, label: `${d.name} v${d.version}` });
  for (const r of result.references) sources.push({ id: `ref:${r.key}`, label: r.citation });

  const data = {
    note: "Comparison of crop-rotation options on replayed past weather. Not a forecast. Scores are relative among these options (0-1), not probabilities.",
    weather: run.kind === "historical_replay" ? "historical replay" : `hypothetical: ${run.transformations.map((t) => (t.kind === "precipitation_scale" ? `rainfall ${t.percent}%` : `temperature ${t.celsius} C`)).join(", ")}`,
    period: { fromYear: result.period.fromYear, toYear: result.period.toYear, completeYears: result.period.completeYears },
    soilWaterCapacityMmPerM: result.soil.awcMmPerM,
    irrigation: result.irrigationMode,
    priorities: result.priorities,
    focusOption: focus,
    options: options.map((o) => ({
      id: o.id,
      kind: o.kind,
      crops: clip(o.label),
      plantings: o.plantings.map((p) => ({ crop: clip(p.crop), start: p.start, days: p.days, source: p.source })),
      rank: cmp ? cmp.ranking.indexOf(o.id) + 1 : null,
      relativeScore: cmp?.scores[o.id] ?? null,
      contributions: cmp ? reasons(cmp, o.id).map((r) => ({ priority: r.priority, contribution: r.contribution })) : [],
      vsExisting: run.baseline && o.id !== run.baseline.id ? differences(defs, table, run.baseline.id, o.id).map((d) => ({ indicator: d.key, from: d.from, to: d.to, unit: d.unit, better: d.better })) : [],
    })),
    indicators: defs.map((d) => ({ key: d.key, label: d.label, unit: d.unit, better: d.better, scored: d.scored, values: Object.fromEntries(options.map((o) => [o.id, table[o.id]?.[d.key] ?? null])) })),
    stability: cmp?.stability ?? null,
    rejections: result.search.cropRejections.slice(0, LIMIT.rejections).map((r) => ({ crop: clip(r.crop), code: r.code })),
    searched: { examined: result.search.sequencesExamined, feasible: result.search.feasible },
    gaps: result.gaps.slice(0, LIMIT.gaps).map(clip),
    reviewQuestions: result.reviewQuestions.slice(0, LIMIT.questions).map(clip),
  };
  return { data, sources, optionIds: options.map((o) => o.id) };
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const latinDigits = (s: string) => s.replace(/[০-৯]/g, (c) => String(BN_DIGITS.indexOf(c)));

/** Every number a statement may use: context values and their usual roundings and percentages. */
export function allowedNumbers(data: unknown): Set<string> {
  const out = new Set<string>();
  const add = (v: number) => {
    for (const x of [v, v * 100]) for (const d of [0, 1, 2, 3]) out.add(Number(x.toFixed(d)).toString());
    out.add(Math.abs(v).toString());
  };
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) add(v);
    else if (typeof v === "string") for (const m of latinDigits(v).match(/-?\d+(?:\.\d+)?/g) ?? []) add(Number(m));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(data);
  // Small counting words ("two alternatives", "rank 1 of 3") and 0–1 score bounds.
  for (let i = 0; i <= 10; i++) out.add(String(i));
  return out;
}

/** Numbers written in a statement, normalised (Bangla digits, thousands separators, decimal commas). */
export function numbersIn(text: string): string[] {
  const s = latinDigits(text).replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  return (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((m) => Number(m.replace(",", ".")).toString());
}

export function checkDraft(draft: Draft, ctx: ExplainContext): CheckedDraft {
  const known = new Set(ctx.sources.map((s) => s.id));
  const nums = allowedNumbers(ctx.data);
  let discarded = 0;
  const grounded = (text: string) => numbersIn(text).every((n) => nums.has(n));
  const paragraphs = draft.paragraphs.filter((p) => {
    const ok = p.text.trim().length > 0 && p.sources.length > 0 && p.sources.every((s) => known.has(s)) && grounded(p.text);
    if (!ok) discarded++;
    return ok;
  });
  const questions = draft.questions.filter((q) => {
    const ok = q.trim().length > 0 && grounded(q);
    if (!ok) discarded++;
    return ok;
  });
  const actions: CheckedAction[] = [];
  for (const a of draft.actions) {
    if (a.kind === "open_option" && a.option && ctx.optionIds.includes(a.option)) actions.push({ kind: "open_option", option: a.option });
    else if (a.kind === "preview_priorities" && a.priority && (PRIORITY_KEYS as string[]).includes(a.priority) && Number.isInteger(a.value) && a.value! >= 0 && a.value! <= 5)
      actions.push({ kind: "preview_priorities", priority: a.priority as PriorityKey, value: a.value! });
  }
  return { paragraphs, questions, actions: actions.slice(0, 4), discarded };
}
