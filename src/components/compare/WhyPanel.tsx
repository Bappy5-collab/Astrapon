"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

import { useFmt, useIndicatorText, useOptionName } from "@/components/replay/format";
import type { EngineResult, RejectionCode, RunView } from "@/domain/simulation/engine";
import { differences, indicatorTable, optionsOf, reasons } from "@/domain/simulation/view";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/sim-messages";
import { color, numeric, radius, tokens } from "@/theme/tokens";

/** “Why this option?”: reasons, evidence, dates, tradeoffs, rejections, gaps and local questions, all from the stored result. */
export function WhyPanel({ result, run, optionId, onOption }: { result: EngineResult; run: RunView; optionId: string; onOption: (id: string) => void }) {
  const t = useT();
  const f = useFmt();
  const locale = useLocale();
  const optionName = useOptionName();
  const ind = useIndicatorText();
  const options = optionsOf(run);
  const o = options.find((x) => x.id === optionId) ?? options[0];
  if (!o) return <Typography>{t("sim.ex.noOptions")}</Typography>;
  const cmp = run.comparison;
  const table = indicatorTable(run);
  const diffs = run.baseline && o.id !== run.baseline.id ? differences(run.indicatorDefinitions, table, run.baseline.id, o.id).filter((d) => d.scored) : [];
  const why = cmp ? reasons(cmp, o.id) : [];
  const englishNote = locale === "bn" ? <Typography variant="caption" color="text.secondary">({t("sim.why.englishNote")})</Typography> : null;
  const rej = (code: RejectionCode) => t(`sim.rej.${code}` as "sim.rej.excluded");

  return (
    <Box>
      <TextField select size="small" label={t("sim.why.choose")} value={o.id} onChange={(e) => onOption(e.target.value)} sx={{ mb: 2, minWidth: 280 }}>
        {options.map((x) => (
          <MenuItem key={x.id} value={x.id}>
            {optionName(x)} · {x.label}
          </MenuItem>
        ))}
      </TextField>

      <Section title={t("sim.why.reasons")}>
        {cmp && (
          <Typography sx={{ mb: 1 }}>
            {fmt(t("sim.why.rank"), { n: f.int(cmp.ranking.indexOf(o.id) + 1), of: f.int(cmp.ranking.length) })} {t("sim.cmp.score")}: <Box component="span" sx={numeric}>{f.num(cmp.scores[o.id], 3)}</Box>
          </Typography>
        )}
        {why.length ? (
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {why.map((r) => (
              <li key={r.priority}>
                <Typography variant="body2">
                  {fmt(t("sim.why.reasonLine"), { priority: t(`sim.prio.p.${r.priority}` as "sim.prio.p.water_use"), c: f.num(r.contribution, 3), s: f.num(cmp!.scores[o.id], 3), pct: f.int(Math.round(r.share * 100)) })}
                </Typography>
              </li>
            ))}
          </Box>
        ) : (
          <Typography variant="body2">{t("sim.why.noReasons")}</Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {t("sim.cmp.scoreNote")}
        </Typography>
      </Section>

      <Section title={t("sim.why.vsBaseline")}>
        {!run.baseline ? (
          <Typography variant="body2">{t("sim.why.noBaseline")}</Typography>
        ) : o.id === run.baseline.id ? (
          <Typography variant="body2">{t("sim.why.isBaseline")}</Typography>
        ) : (
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
            {([true, false] as const).map((better) => (
              <Box key={String(better)}>
                <Chip size="small" label={better ? t("sim.why.better") : t("sim.why.worse")} sx={{ mb: 1, fontWeight: 700, bgcolor: better ? tokens.lime[200] : "#F6DED6", color: tokens.forest[950] }} />
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {diffs.filter((d) => d.better === better).map((d) => (
                    <li key={d.key}>
                      <Typography variant="body2">
                        {ind.label(d.key, d.label)}: <Box component="span" sx={numeric}>{f.num(d.from, d.unit === "ratio" || d.unit === "share" ? 3 : 1)} → {f.num(d.to, d.unit === "ratio" || d.unit === "share" ? 3 : 1)}</Box> {ind.unit(d.unit)}
                      </Typography>
                    </li>
                  ))}
                  {!diffs.some((d) => d.better === better) && (
                    <li>
                      <Typography variant="body2">{t("sim.ex.none")}</Typography>
                    </li>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Section>

      <Section title={t("sim.why.plantings")}>
        <Box sx={{ overflowX: "auto", border: `1px solid ${color.line}`, borderRadius: `${radius.md}px` }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("sim.col.crop")}</TableCell>
                <TableCell>{t("sim.col.dates")}</TableCell>
                <TableCell align="right">{ind.unit("days")}</TableCell>
                <TableCell>{t("sim.why.evidence")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {o.plantings.map((p, i) => (
                <TableRow key={`${p.crop}-${i}`}>
                  <TableCell component="th" scope="row">{p.crop}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{f.dayMonth(p.start)} → {f.dayMonth(p.end)}</TableCell>
                  <TableCell align="right" sx={numeric}>{f.int(p.days)}</TableCell>
                  <TableCell>
                    {t(`sim.source.${p.source}` as "sim.source.history")}{" "}
                    <Typography component="span" variant="caption" color="text.secondary" lang="en">
                      ({p.sourceDetail})
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Section>

      <Section title={t("sim.why.evidence")}>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          <li>
            <Typography variant="body2">{fmt(t("sim.why.weather"), { from: result.period.fromYear, to: result.period.toYear, years: f.int(result.period.completeYears ?? 0) })}</Typography>
          </li>
          <li>
            <Typography variant="body2">
              {result.soil.awcMmPerM == null ? t("sim.why.soilUnknown") : fmt(t("sim.why.soil"), { value: f.num(result.soil.awcMmPerM), source: result.soil.source })}
            </Typography>
          </li>
          {result.datasets.filter((d) => d.kind === "crop_parameters").map((d) => (
            <li key={d.id}>
              <Typography variant="body2">{fmt(t("sim.why.params"), { v: d.version })}</Typography>
            </li>
          ))}
        </Box>
      </Section>

      <Section title={t("sim.why.rejected")}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {fmt(t("sim.why.searched"), { n: f.int(result.search.sequencesExamined), f: f.int(result.search.feasible) })}
        </Typography>
        {o.violations.length > 0 && (
          <>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{t("sim.why.violations")}</Typography>
            <Box component="ul" sx={{ mt: 0.5, pl: 2.5 }}>
              {o.violations.map((v, i) => (
                <li key={i}>
                  <Typography variant="body2">
                    {rej(v.code)} <Typography component="span" variant="caption" color="text.secondary" lang="en">({v.detail})</Typography>
                  </Typography>
                </li>
              ))}
            </Box>
          </>
        )}
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {result.search.cropRejections.map((r, i) => (
            <li key={`c${i}`}>
              <Typography variant="body2">
                <strong>{r.crop}</strong>: {rej(r.code)}
              </Typography>
            </li>
          ))}
          {(Object.entries(result.search.rejectionCounts) as [RejectionCode, number][]).map(([code, n]) => (
            <li key={code}>
              <Typography variant="body2">
                {rej(code)}: <Box component="span" sx={numeric}>{f.int(n)}</Box>
              </Typography>
            </li>
          ))}
        </Box>
      </Section>

      <Section title={t("sim.why.gaps")} note={englishNote}>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }} lang="en">
          {[...result.gaps, ...run.messages].map((g) => (
            <li key={g}>
              <Typography variant="body2">{g}</Typography>
            </li>
          ))}
        </Box>
      </Section>

      <Section title={t("sim.why.questions")} note={englishNote}>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }} lang="en">
          {result.reviewQuestions.map((q) => (
            <li key={q}>
              <Typography variant="body2">{q}</Typography>
            </li>
          ))}
        </Box>
      </Section>
    </Box>
  );
}

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" sx={{ mb: 2.5 }}>
      <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
        {title} {note}
      </Typography>
      {children}
    </Box>
  );
}

export function Glossary() {
  const t = useT();
  const items = ["et", "ndvi", "sma", "wb", "ks"] as const;
  return (
    <Box component="section" aria-labelledby="gl-h" sx={{ mt: 3, p: 2, borderRadius: `${radius.md}px`, bgcolor: color.surfaceRaised, border: `1px solid ${color.line}` }}>
      <Typography id="gl-h" variant="h6" component="h3" sx={{ mb: 1 }}>
        {t("sim.gl.title")}
      </Typography>
      <Box component="dl" sx={{ m: 0, display: "grid", gap: 1.25 }}>
        {items.map((k) => (
          <Box key={k}>
            <Typography component="dt" sx={{ fontWeight: 700 }}>
              {t(`sim.gl.${k}` as "sim.gl.et")}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0 }}>
              {t(`sim.gl.${k}.body` as "sim.gl.et.body")}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
