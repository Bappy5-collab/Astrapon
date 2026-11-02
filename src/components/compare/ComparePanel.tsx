"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useMemo } from "react";

import { useFmt, useIndicatorText, useOptionName } from "@/components/replay/format";
import { PRIORITY_KEYS, scoreOptions, type EngineResult, type PriorityKey, type RunView } from "@/domain/simulation/engine";
import { indicatorTable, optionsOf } from "@/domain/simulation/view";
import { useT } from "@/lib/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/sim-messages";
import { color, numeric, radius, tokens } from "@/theme/tokens";

import { ActionMessage, type UiMessage } from "./ActionMessage";

export type Weights = Record<PriorityKey, number>;

/**
 * The options side by side on common inputs, plus an unsaved priority preview that re-ranks them
 * with the engine's own scoreOptions() on the stored indicators. Saving is a separate button.
 */
export function ComparePanel({
  result,
  run,
  weights,
  onWeights,
  canUndo,
  onUndo,
  onSave,
  saving,
  message,
  onWhy,
}: {
  result: EngineResult;
  run: RunView;
  weights: Weights;
  onWeights: (w: Weights) => void;
  canUndo: boolean;
  onUndo: () => void;
  onSave: (() => void) | null;
  saving: boolean;
  message: UiMessage | null;
  onWhy: (id: string) => void;
}) {
  const t = useT();
  const f = useFmt();
  const optionName = useOptionName();
  const ind = useIndicatorText();
  const options = optionsOf(run);
  const cmp = run.comparison;
  const ids = useMemo(() => options.map((o) => o.id), [options]);
  const table = useMemo(() => indicatorTable(run), [run]);
  const preview = useMemo(() => (ids.length ? scoreOptions(run.indicatorDefinitions, ids, table, weights) : null), [run.indicatorDefinitions, ids, table, weights]);
  const savedWeights = result.priorities;
  const dirty = PRIORITY_KEYS.some((k) => weights[k] !== savedWeights[k]);
  const sameOrder = preview && cmp ? preview.ranking.join() === cmp.ranking.join() : true;
  const ordered = cmp ? cmp.ranking.map((id) => options.find((o) => o.id === id)!).filter(Boolean) : options;
  const dropped = new Set(cmp?.indicatorsDropped.map((d) => d.key) ?? []);

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {fmt(t("sim.cmp.common"), {
          from: result.period.fromYear,
          to: result.period.toYear,
          soil: result.soil.awcMmPerM == null ? t("sim.cmp.soilUnknown") : `${f.num(result.soil.awcMmPerM)} mm/m`,
        })}
      </Typography>
      {cmp && (
        <Chip
          size="small"
          sx={{ mb: 1.5, fontWeight: 600, bgcolor: cmp.stability === "stable" ? tokens.lime[200] : cmp.stability === "fragile" ? "#F6E7C8" : tokens.neutral[200], color: tokens.forest[950] }}
          label={cmp.stability === "stable" ? t("sim.cmp.stable") : cmp.stability === "fragile" ? t("sim.cmp.fragile") : optionName(options[0]!)}
        />
      )}
      {run.alternatives.length < 2 && <Alert severity="info" sx={{ mb: 1.5 }}>{t("sim.cmp.fewer")}</Alert>}

      <Box sx={{ overflowX: "auto", border: `1px solid ${color.line}`, borderRadius: `${radius.md}px` }}>
        <Table size="small" aria-label={t("sim.cmp.title")}>
          <TableHead>
            <TableRow>
              <TableCell>{t("sim.cmp.indicator")}</TableCell>
              {ordered.map((o) => (
                <TableCell key={o.id} align="right" sx={{ minWidth: 140 }}>
                  <Button size="small" onClick={() => onWhy(o.id)} sx={{ fontWeight: 700, textAlign: "right", lineHeight: 1.25 }}>
                    {optionName(o)}
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>
                    {o.label}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {cmp && (
              <>
                <TableRow>
                  <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                    {t("sim.cmp.rank")}
                  </TableCell>
                  {ordered.map((o) => (
                    <TableCell key={o.id} align="right" sx={numeric}>
                      {f.int(cmp.ranking.indexOf(o.id) + 1)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                    {t("sim.cmp.score")}
                  </TableCell>
                  {ordered.map((o) => (
                    <TableCell key={o.id} align="right" sx={numeric}>
                      {f.num(cmp.scores[o.id], 3)}
                    </TableCell>
                  ))}
                </TableRow>
              </>
            )}
            {run.indicatorDefinitions.map((d) => (
              <TableRow key={d.key}>
                <TableCell component="th" scope="row">
                  {ind.label(d.key, d.label)}{" "}
                  <Typography component="span" variant="caption" color="text.secondary">
                    ({ind.unit(d.unit)}; {t(d.better === "high" ? "sim.better.high" : "sim.better.low")}
                    {!d.scored ? `; ${t("sim.cmp.notScored")}` : dropped.has(d.key) ? `; ${t("sim.cmp.dropped")}` : ""})
                  </Typography>
                </TableCell>
                {ordered.map((o) => (
                  <TableCell key={o.id} align="right" sx={numeric}>
                    {f.num(o.indicators[d.key]?.value ?? null, d.unit === "ratio" || d.unit === "share" ? 3 : 1)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            <TableRow>
              <TableCell component="th" scope="row">
                {ind.label("longest_bare_window", "Longest bare window")} <Typography component="span" variant="caption" color="text.secondary">({ind.unit("days")}; {t("sim.cmp.notScored")})</Typography>
              </TableCell>
              {ordered.map((o) => (
                <TableCell key={o.id} align="right" sx={numeric}>
                  {f.num(o.indicators.longest_bare_window?.value ?? null, 0)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
        {t("sim.cmp.scoreNote")} “—” = {t("sim.insufficient")}.
      </Typography>

      {/* Priority preview */}
      {cmp && preview && (
        <Box component="section" aria-labelledby="prio-h" sx={{ mt: 3, p: { xs: 1.5, md: 2 }, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surfaceRaised }}>
          <Typography id="prio-h" variant="h6" component="h3">
            {t("sim.prio.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("sim.prio.preview")}
          </Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" } }}>
            <Box>
              {PRIORITY_KEYS.map((k) => (
                <Box key={k} sx={{ mb: 1 }}>
                  <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                    <Typography id={`w-${k}`} variant="body2" sx={{ fontWeight: 600 }}>
                      {t(`sim.prio.p.${k}` as "sim.prio.p.water_use")}
                    </Typography>
                    <Typography variant="body2" sx={numeric}>
                      {f.int(weights[k])}
                      {weights[k] !== savedWeights[k] ? ` (${f.int(savedWeights[k])})` : ""}
                    </Typography>
                  </Stack>
                  <Slider
                    value={weights[k]}
                    min={0}
                    max={5}
                    step={1}
                    marks
                    onChange={(_, v) => onWeights({ ...weights, [k]: v as number })}
                    aria-labelledby={`w-${k}`}
                    getAriaValueText={(v) => fmt(t("sim.prio.weight"), { n: f.int(v) })}
                    sx={{ color: tokens.forest[700], py: 1 }}
                  />
                </Box>
              ))}
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                <Button size="small" onClick={onUndo} disabled={!canUndo}>
                  {t("sim.prio.undo")}
                </Button>
                <Button size="small" onClick={() => onWeights(savedWeights)} disabled={!dirty}>
                  {t("sim.prio.resetSaved")}
                </Button>
              </Stack>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }} aria-live="polite">
                {sameOrder ? t("sim.prio.same") : t("sim.prio.changed")}
              </Typography>
              <Box component="ol" sx={{ m: 0, pl: 3 }}>
                {preview.ranking.map((id) => {
                  const o = options.find((x) => x.id === id)!;
                  const was = cmp.ranking.indexOf(id) + 1;
                  const now = preview.ranking.indexOf(id) + 1;
                  return (
                    <li key={id}>
                      <Typography variant="body2">
                        <strong>{optionName(o)}</strong> · {o.label}{" "}
                        <Box component="span" sx={{ ...numeric, color: "text.secondary" }}>
                          ({t("sim.cmp.score")} {f.num(preview.scores[id], 3)}
                          {was !== now ? `; ${t("sim.cmp.rank")} ${f.int(was)} → ${f.int(now)}` : ""})
                        </Box>
                      </Typography>
                    </li>
                  );
                })}
              </Box>
              {onSave && (
                <Box sx={{ mt: 2 }}>
                  <Button variant="contained" onClick={onSave} disabled={!dirty || saving}>
                    {t("sim.prio.save")}
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                    {t("sim.prio.saveNote")}
                  </Typography>
                </Box>
              )}
              <ActionMessage message={message} />
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
