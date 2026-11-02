"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useFmt, useOptionName } from "@/components/replay/format";
import type { EngineResult, RunView } from "@/domain/simulation/engine";
import { optionsOf } from "@/domain/simulation/view";
import { useT } from "@/lib/i18n/I18nProvider";
import type { SavedPlan } from "@/domain/simulation/runs";
import { color, radius } from "@/theme/tokens";

import { ActionMessage, toUiMessage, type UiMessage } from "./ActionMessage";

type Result = { ok: boolean; message: string; auth?: boolean; id?: string };
export type PlanActions = {
  save: (raw: unknown) => Promise<Result>;
  update: (planId: string, raw: unknown) => Promise<Result>;
  remove: (planId: string) => Promise<Result>;
  deleteRun: (runId: string) => Promise<Result>;
};

/** Saving a plan, managing plans of this run, exporting the stored run, and deleting it. */
export function PlanPanel({ runId, result, runKind, focus, plans, actions }: { runId: string; result: EngineResult; runKind: RunView["kind"]; focus: string; plans: SavedPlan[]; actions: PlanActions }) {
  const t = useT();
  const f = useFmt();
  const router = useRouter();
  const optionName = useOptionName();
  const [kind, setKind] = useState<RunView["kind"]>(runKind);
  const run = result.runs.find((r) => r.kind === kind) ?? result.runs[0]!;
  const options = optionsOf(run);
  const [option, setOption] = useState(options.some((o) => o.id === focus) ? focus : (options[0]?.id ?? ""));
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<UiMessage | null>(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  const call = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      let r: Result | null = null;
      try {
        r = await fn();
      } catch {
        r = null;
      }
      setMessage(toUiMessage(r, t("sim.err.network")));
      if (r?.ok) after?.(r);
    });

  return (
    <Box>
      <Box component="section" aria-labelledby="plan-h" sx={{ p: 2, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surfaceRaised }}>
        <Typography id="plan-h" variant="h6" component="h3" sx={{ mb: 1.5 }}>
          {t("sim.plan.title")}
        </Typography>
        <Stack spacing={1.5} sx={{ maxWidth: 620 }}>
          {result.runs.length > 1 && (
            <TextField select size="small" label={t("sim.plan.weather")} value={kind} onChange={(e) => setKind(e.target.value as RunView["kind"])}>
              {result.runs.map((r) => (
                <MenuItem key={r.kind} value={r.kind}>
                  {t(`sim.run.${r.kind}`)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField select size="small" label={t("sim.plan.option")} value={options.some((o) => o.id === option) ? option : (options[0]?.id ?? "")} onChange={(e) => setOption(e.target.value)}>
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {optionName(o)} · {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label={t("sim.plan.name")} value={name} onChange={(e) => setName(e.target.value)} required slotProps={{ htmlInput: { maxLength: 120 } }} />
          <TextField size="small" label={t("sim.plan.note")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          <Box>
            <Button
              variant="contained"
              disabled={pending || !name.trim() || !options.length}
              onClick={() =>
                call(() => actions.save({ runId, runKind: kind, strategyId: options.some((o) => o.id === option) ? option : options[0]!.id, name, note }), () => {
                  setName("");
                  setNote("");
                  setMessage({ ok: true, text: t("sim.plan.saved") });
                  router.refresh();
                })
              }
            >
              {t("sim.plan.save")}
            </Button>
          </Box>
        </Stack>
        <ActionMessage message={message} />
      </Box>

      <Box component="section" aria-labelledby="plans-h" sx={{ mt: 2.5 }}>
        <Typography id="plans-h" variant="h6" component="h3" sx={{ mb: 1 }}>
          {t("sim.plan.list")}
        </Typography>
        {plans.length === 0 ? (
          <Typography variant="body2">{t("sim.plan.none")}</Typography>
        ) : (
          <Stack spacing={1.5}>
            {plans.map((p) => (
              <PlanRow key={`${p.id}-${p.updatedAt}`} plan={p} result={result} pending={pending} onUpdate={(raw) => call(() => actions.update(p.id, raw), () => { setMessage({ ok: true, text: t("sim.plan.updated") }); router.refresh(); })} onDelete={() => call(() => actions.remove(p.id), () => { setMessage({ ok: true, text: t("sim.plan.deleted") }); router.refresh(); })} dateText={f.date(p.createdAt)} />
            ))}
          </Stack>
        )}
      </Box>

      <Box component="section" aria-labelledby="export-h" sx={{ mt: 2.5 }}>
        <Typography id="export-h" variant="h6" component="h3" sx={{ mb: 1 }}>
          {t("sim.export.title")}
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button variant="outlined" href={`/runs/${runId}/export`} download>
            {t("sim.export.json")}
          </Button>
          <Button variant="outlined" onClick={() => window.print()}>
            {t("sim.export.print")}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75, maxWidth: 720 }}>
          {t("sim.export.note")}
        </Typography>
      </Box>

      <Box component="section" sx={{ mt: 3, pt: 2, borderTop: `1px solid ${color.line}` }} className="no-print">
        <FormControlLabel control={<Checkbox checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />} label={t("sim.run.deleteConfirm")} />
        <Box>
          <Button color="error" variant="outlined" disabled={!confirm || pending} onClick={() => call(() => actions.deleteRun(runId), () => router.push("/runs"))}>
            {t("sim.run.delete")}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

function PlanRow({ plan, result, pending, onUpdate, onDelete, dateText }: { plan: SavedPlan; result: EngineResult; pending: boolean; onUpdate: (raw: unknown) => void; onDelete: () => void; dateText: string }) {
  const t = useT();
  const optionName = useOptionName();
  const [name, setName] = useState(plan.name);
  const [note, setNote] = useState(plan.note);
  const run = result.runs.find((r) => r.kind === plan.runKind);
  const opt = run ? optionsOf(run).find((o) => o.id === plan.strategyId) : undefined;
  return (
    <Box sx={{ p: 1.5, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}` }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {opt ? `${optionName(opt)} · ${opt.label}` : plan.strategyId} · {t(`sim.run.${plan.runKind}`)} · {dateText}
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mt: 1, alignItems: { md: "flex-start" } }}>
        <TextField size="small" label={t("sim.plan.name")} value={name} onChange={(e) => setName(e.target.value)} sx={{ minWidth: 220 }} slotProps={{ htmlInput: { maxLength: 120 } }} />
        <TextField size="small" label={t("sim.plan.note")} value={note} onChange={(e) => setNote(e.target.value)} sx={{ flexGrow: 1 }} slotProps={{ htmlInput: { maxLength: 2000 } }} />
        <Button size="small" disabled={pending || !name.trim() || (name === plan.name && note === plan.note)} onClick={() => onUpdate({ name, note })}>
          {t("sim.plan.update")}
        </Button>
        <Button size="small" color="error" disabled={pending} onClick={onDelete}>
          {t("sim.plan.delete")}
        </Button>
      </Stack>
    </Box>
  );
}
