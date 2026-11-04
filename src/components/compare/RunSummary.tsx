"use client";

import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { useIndicatorText, useOptionName } from "@/components/replay/format";
import type { EngineResult, RunView } from "@/domain/simulation/engine";
import { differences, indicatorTable, optionsOf } from "@/domain/simulation/view";
import { useT } from "@/lib/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/sim-messages";
import { color, elevation, radius, tokens } from "@/theme/tokens";

/**
 * The answer first: which option ranks first among those compared, what it does better and worse
 * than the current rotation, and where to look next. Reads only the stored comparison; nothing is
 * recomputed, and the order is described as a ranking among these options, never as a prediction.
 */
export function RunSummary({ result, run, onTab }: { result: EngineResult; run: RunView; onTab: (tab: "why" | "simulate" | "compare", option?: string) => void }) {
  const t = useT();
  const optionName = useOptionName();
  const ind = useIndicatorText();
  const options = optionsOf(run);
  const cmp = run.comparison;
  if (!cmp || !options.length) return null;
  const top = options.find((o) => o.id === cmp.ranking[0]);
  if (!top) return null;
  const others = cmp.ranking.slice(1).map((id) => options.find((o) => o.id === id)!).filter(Boolean);
  const diffs = run.baseline && top.kind !== "baseline" && run.indicatorDefinitions ? differences(run.indicatorDefinitions, indicatorTable(run), run.baseline.id, top.id).filter((d) => d.scored) : [];
  const better = diffs.filter((d) => d.better).map((d) => ind.label(d.key, d.label));
  const worse = diffs.filter((d) => !d.better).map((d) => ind.label(d.key, d.label));

  return (
    <Box component="section" aria-labelledby="sum-h" sx={{ mb: 3, borderRadius: `${radius.lg + 4}px`, overflow: "hidden", border: `1px solid ${color.line}`, boxShadow: elevation.raised, bgcolor: color.surfaceRaised }}>
      <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: tokens.forest[900], color: tokens.neutral[100] }}>
        <Typography id="sum-h" variant="overline" component="h2" sx={{ color: tokens.lime[400], fontWeight: 700, letterSpacing: "0.08em" }}>
          {t("sim.sum.title")}
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", mt: 0.5 }}>
          <Box aria-hidden sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: "12px", display: "grid", placeItems: "center", bgcolor: tokens.lime[400], color: tokens.forest[950] }}>
            <EmojiEventsRoundedIcon />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Chip size="small" label={t("sim.sum.first")} sx={{ height: 22, mb: 0.5, fontWeight: 700, bgcolor: tokens.forest[700], color: tokens.neutral[100] }} />
            <Typography variant="h4" component="p" sx={{ color: tokens.neutral[0], fontSize: { xs: "1.4rem", md: "1.75rem" }, lineHeight: 1.2 }}>
              {optionName(top)}: {top.label}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.neutral[300], mt: 0.75, maxWidth: 760 }}>
              {top.kind === "baseline" ? t("sim.sum.baselineFirst") : fmt(t("sim.ex.compared"), { n: options.length, from: result.period.fromYear, to: result.period.toYear })}
              {cmp.stability === "fragile" ? ` ${t("sim.ex.fragile")}` : cmp.stability === "stable" ? ` ${t("sim.ex.stable")}` : ""}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {(better.length > 0 || worse.length > 0) && (
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, mb: 2.5 }}>
            <DiffList title={t("sim.sum.better")} items={better} good empty={t("sim.ex.none")} />
            <DiffList title={t("sim.sum.worse")} items={worse} good={false} empty={t("sim.ex.none")} />
          </Box>
        )}
        {others.length > 0 && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            <Box component="span" sx={{ color: "text.secondary" }}>
              {t("sim.sum.others")}:{" "}
            </Box>
            {others.map((o, i) => (
              <Box component="span" key={o.id}>
                {i > 0 && " · "}
                <Box component="strong">{optionName(o)}</Box> {o.label}
              </Box>
            ))}
          </Typography>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap" }} className="no-print">
          <Button variant="contained" onClick={() => onTab("why", top.id)}>
            {t("sim.sum.why")}
          </Button>
          <Button variant="outlined" onClick={() => onTab("simulate")}>
            {t("sim.sum.watch")}
          </Button>
          <Button variant="outlined" onClick={() => onTab("compare")}>
            {t("sim.sum.rank")}
          </Button>
        </Stack>
        <Box sx={{ mt: 2.5, p: 1.5, borderRadius: `${radius.md}px`, bgcolor: color.surface, border: `1px solid ${color.line}` }}>
          <Typography variant="body2">
            <strong>{t("sim.sum.check")}.</strong> {t("sim.sum.checkBody")}
            {result.gaps.length > 0 && ` ${fmt(t("sim.ex.gaps"), { n: result.gaps.length })}`}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function DiffList({ title, items, good, empty }: { title: string; items: string[]; good: boolean; empty: string }) {
  const Icon = good ? CheckCircleRoundedIcon : RemoveCircleOutlineRoundedIcon;
  return (
    <Box sx={{ p: 2, borderRadius: `${radius.md}px`, border: `1px solid ${good ? tokens.lime[500] : "#E9C3B7"}`, bgcolor: good ? "#F4F9E6" : "#FBF1ED" }}>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1, color: good ? tokens.forest[800] : tokens.clay }}>
        {title}
      </Typography>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 0.75 }}>
          {items.map((x) => (
            <Box component="li" key={x} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              <Icon fontSize="small" sx={{ mt: "1px", color: good ? tokens.forest[500] : tokens.clay }} />
              <Typography variant="body2">{x}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
