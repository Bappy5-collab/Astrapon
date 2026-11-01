import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import type { EngineResult, PriorityKey, RunView, StrategyView } from "@/domain/simulation/engine";
import { color, numeric, radius, tokens } from "@/theme/tokens";

const PRIORITY: Record<PriorityKey, string> = {
  water_use: "Water use",
  soil_health: "Soil cover and rotation structure",
  diversification: "Diversification",
  weather_risk: "Weather risk",
  workload: "Workload",
  income_stability: "Market fit",
};

const REJECTION: Record<string, string> = {
  excluded: "You excluded it",
  no_market_access: "No market access",
  unknown_crop: "Not in the crop catalogue",
  no_window: "No local planting window",
  overlap: "Plantings overlap",
  window_missed: "Planting window missed",
  return_interval: "Return interval (canola)",
  water_allocation: "Exceeds your water allocation",
  fallow_year: "A whole year without a crop",
};

const INDICATOR_ORDER = [
  "relative_water_supply", "irrigation_requirement", "climatic_water_balance", "water_supply_dry_gap", "irrigation_dry_gap", "climatic_dry_gap",
  "bare_days", "longest_bare_window", "family_repeats", "legume_plantings", "deep_rooted_plantings", "crop_diversity", "family_diversity",
  "field_operations", "market_fit", "frost_days", "hot_days",
];

const SOURCE: Record<string, string> = { farmer_window: "your window", history: "your records", history_record: "your record", calendar: "NASS calendar" };

const fmt = (v: number | null, unit: string) => (v == null ? "—" : unit === "ratio" || unit === "share" ? v.toFixed(2) : Number.isInteger(v) ? String(v) : v.toFixed(1));

function strategyName(s: StrategyView, all: StrategyView[]) {
  if (s.kind === "baseline") return "Existing practice";
  return `Alternative ${all.filter((x) => x.kind === "alternative").indexOf(s) + 1}`;
}

function Block({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ mt: 4 }}>
      <Typography id={id} variant="h5" component="h3" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function ScoreBar({ value }: { value: number }) {
  return (
    <Box aria-hidden sx={{ height: 8, borderRadius: 4, bgcolor: tokens.neutral[200], overflow: "hidden", width: "100%", maxWidth: 220 }}>
      <Box sx={{ height: "100%", width: `${Math.round(value * 100)}%`, bgcolor: tokens.forest[500], borderRadius: 4 }} />
    </Box>
  );
}

function RunSection({ run, result }: { run: RunView; result: EngineResult }) {
  const all = [...(run.baseline ? [run.baseline] : []), ...run.alternatives];
  const cmp = run.comparison;
  const byId = new Map(all.map((s) => [s.id, s]));
  const ordered = cmp ? cmp.ranking.map((id) => byId.get(id)!).filter(Boolean) : all;
  const name = (id: string | null) => (id && byId.get(id) ? strategyName(byId.get(id)!, all) : "—");
  // Stored results lose object key order (jsonb), so indicators are listed in a fixed order.
  const present = all.length ? Object.keys(all[0]!.indicators) : [];
  const indicatorKeys = [...INDICATOR_ORDER.filter((k) => present.includes(k)), ...present.filter((k) => !INDICATOR_ORDER.includes(k)).sort()];
  return (
    <Box>
      {run.messages.map((m) => (
        <Alert key={m} severity="info" sx={{ mb: 2 }}>
          {m}
        </Alert>
      ))}
      {!all.length && <Alert severity="warning">No strategy could be evaluated. See the gaps and rejections below.</Alert>}

      {cmp && (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1 }}>
          <Chip
            label={cmp.stability === "stable" ? "Ranking stable across sensitivity cases" : cmp.stability === "fragile" ? "Ranking fragile" : "Only one option to rank"}
            sx={{ bgcolor: cmp.stability === "stable" ? tokens.lime[200] : cmp.stability === "fragile" ? "#FBE7C6" : tokens.neutral[200], color: cmp.stability === "fragile" ? "#5A3A00" : tokens.forest[950], fontWeight: 600 }}
          />
          {cmp.stability === "fragile" && <Typography variant="body2" sx={{ alignSelf: "center" }}>Top option changes under: {cmp.changedBy.map((c) => cmp.cases.find((x) => x.id === c)?.label ?? c).join(", ")}.</Typography>}
        </Stack>
      )}

      <Box component="ol" aria-label="Options in rank order" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" } }}>
        {ordered.map((s, i) => (
          <Box component="li" key={s.id} sx={{ p: 2, border: `1px solid ${s.kind === "baseline" ? color.lineStrong : color.line}`, borderRadius: `${radius.md}px`, bgcolor: color.surfaceRaised, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
              {cmp && <Typography variant="overline" sx={{ ...numeric, lineHeight: 1 }}>#{i + 1}</Typography>}
              <Chip size="small" label={strategyName(s, all)} sx={{ bgcolor: s.kind === "baseline" ? tokens.neutral[200] : tokens.lime[200], color: tokens.forest[950], fontWeight: 600 }} />
              {s.violations.length > 0 && <Chip size="small" variant="outlined" label="Conflicts with a current constraint" />}
            </Stack>
            <Typography variant="h6" component="p" sx={{ mt: 1, overflowWrap: "anywhere" }}>
              {s.label}
            </Typography>
            {cmp && (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mt: 0.5 }}>
                <ScoreBar value={cmp.scores[s.id] ?? 0} />
                <Typography variant="body2" sx={numeric}>
                  {(cmp.scores[s.id] ?? 0).toFixed(2)} relative score
                </Typography>
              </Stack>
            )}
            <Box component="ul" sx={{ pl: 2.5, my: 1 }}>
              {s.plantings.map((p, k) => (
                <Typography component="li" variant="body2" key={k} sx={numeric}>
                  Year {p.cycleYear + 1}: {p.crop} · plant {p.start}, {p.days} days ({p.months}){p.family ? ` · ${p.family}` : ""} · {SOURCE[p.source] ?? p.source}
                </Typography>
              ))}
              {!s.plantings.length && <Typography component="li" variant="body2">Nothing planted</Typography>}
            </Box>
            {s.violations.map((v) => (
              <Typography key={v.detail} variant="body2" sx={{ color: "#6E2A1A" }}>
                {v.detail}
              </Typography>
            ))}
            {cmp?.tradeoffs[s.id]?.length ? (
              <Box component="details" sx={{ mt: 1 }}>
                <summary>Compared with the existing practice</summary>
                <Box component="ul" sx={{ pl: 2.5, my: 1 }}>
                  {cmp.tradeoffs[s.id]!.map((t) => (
                    <Typography component="li" variant="body2" key={t}>
                      {t}
                    </Typography>
                  ))}
                </Box>
              </Box>
            ) : null}
            <Box component="details" sx={{ mt: 1 }}>
              <summary>Data completeness</summary>
              <Box component="ul" sx={{ pl: 2.5, my: 1 }}>
                {s.completeness.map((c) => (
                  <Typography component="li" variant="body2" key={c.item} sx={numeric}>
                    {c.item}: {c.have} of {c.of}
                    {c.note ? ` (${c.note})` : ""}
                  </Typography>
                ))}
              </Box>
            </Box>
          </Box>
        ))}
      </Box>

      {cmp && (
        <Block title="Why this order">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, maxWidth: 820 }}>
            Each priority you set weights a group of indicators. Scores are relative among the options shown (0–1), not probabilities and not predicted outcomes.
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Score contributions by priority">
              <TableHead>
                <TableRow>
                  <TableCell>Priority (your weight)</TableCell>
                  {ordered.map((s) => (
                    <TableCell key={s.id} align="right">{strategyName(s, all)}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {cmp.groupsUsed.map((g) => (
                  <TableRow key={g}>
                    <TableCell>
                      {PRIORITY[g]} ({result.priorities[g]})
                    </TableCell>
                    {ordered.map((s) => (
                      <TableCell key={s.id} align="right" sx={numeric}>{(cmp.contributions[s.id]?.[g] ?? 0).toFixed(3)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {cmp.ablation.length > 0 && (
            <Box component="ul" sx={{ pl: 2.5, mt: 1.5 }}>
              {cmp.ablation.map((a) => (
                <Typography component="li" variant="body2" key={a.priority}>
                  Without your “{PRIORITY[a.priority]}” priority: {a.topChanged ? <strong>the top option would be {name(a.ranking[0] ?? null)}</strong> : "the top option stays the same"}.
                </Typography>
              ))}
            </Box>
          )}
        </Block>
      )}

      {all.length > 0 && (
        <Block title="Indicators">
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Indicators by option">
              <TableHead>
                <TableRow>
                  <TableCell>Indicator</TableCell>
                  <TableCell>Unit</TableCell>
                  {ordered.map((s) => (
                    <TableCell key={s.id} align="right">{strategyName(s, all)}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {indicatorKeys.map((k) => {
                  const first = all[0]!.indicators[k]!;
                  return (
                    <TableRow key={k}>
                      <TableCell sx={{ maxWidth: 320 }}>
                        {first.detail}
                        {cmp && !cmp.indicatorsUsed.includes(k) && (
                          <Typography component="span" variant="caption" color="text.secondary">
                            {" "}
                            · not used in ranking
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{first.unit}</TableCell>
                      {ordered.map((s) => (
                        <TableCell key={s.id} align="right" sx={numeric}>{fmt(s.indicators[k]?.value ?? null, first.unit)}</TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            “—” means insufficient evidence for that option; such indicators are left out of the ranking for every option so all are compared on the same inputs.
          </Typography>
        </Block>
      )}

      {cmp && cmp.cases.length > 0 && (
        <Block title="Sensitivity cases">
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Top option under each sensitivity case">
              <TableHead>
                <TableRow>
                  <TableCell>Case</TableCell>
                  <TableCell>Top option</TableCell>
                  <TableCell>Full order</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Base case</TableCell>
                  <TableCell>{name(cmp.ranking[0] ?? null)}</TableCell>
                  <TableCell>{cmp.ranking.map(name).join(" › ")}</TableCell>
                </TableRow>
                {cmp.cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.label}</TableCell>
                    <TableCell>{name(c.top)}</TableCell>
                    <TableCell>{c.ranking.map(name).join(" › ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Block>
      )}
    </Box>
  );
}

const RUN_TITLE = (r: RunView) =>
  r.kind === "historical_replay"
    ? "Historical replay"
    : `Scenario: ${r.transformations.map((t) => (t.kind === "precipitation_scale" ? `rainfall ${t.percent > 0 ? "+" : ""}${t.percent}%` : `temperature ${t.celsius > 0 ? "+" : ""}${t.celsius} °C`)).join(", ")}`;

export function RunResult({ result, resultSha256, inputDigest }: { result: EngineResult & { inputDigest?: string }; resultSha256: string | null; inputDigest: string | null }) {
  const s = result.search;
  return (
    <Box>
      <Alert severity={result.status === "ok" ? "info" : "warning"} sx={{ mb: 3 }}>
        {result.status === "ok"
          ? `Replay of past weather ${result.period.fromYear}–${result.period.toYear}. This is not a forecast, and it does not predict yield, profit or soil outcomes. Review every option locally before deciding.`
          : result.messages[0]}
      </Alert>
      {result.status === "ok" && result.messages.map((m) => (
        <Alert key={m} severity="info" sx={{ mb: 2 }}>
          {m}
        </Alert>
      ))}

      {result.runs.map((r) => (
        <Box key={r.kind} component="section" aria-labelledby={`run-${r.kind}`} sx={{ mt: 3 }}>
          <Typography id={`run-${r.kind}`} variant="h4" component="h2" sx={{ mb: 1.5 }}>
            {RUN_TITLE(r)}
          </Typography>
          {r.kind === "scenario" && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The same past weather with your hypothetical changes applied once to every day. The historical replay above is unchanged.
            </Typography>
          )}
          <RunSection run={r} result={result} />
        </Box>
      ))}

      <Block title="What was considered and rejected" id="search-h">
        <Typography variant="body2" sx={{ mb: 1 }}>
          Crops considered: {s.cropsConsidered.join(", ") || "none"}. {s.sequencesExamined} sequences examined, {s.feasible} feasible{s.bounded ? " (bounded search)" : ""}.
        </Typography>
        {s.cropRejections.length > 0 && (
          <Box component="ul" sx={{ pl: 2.5 }}>
            {s.cropRejections.map((c) => (
              <Typography component="li" variant="body2" key={c.crop}>
                <strong>{c.crop}</strong>: {REJECTION[c.code] ?? c.code}. {c.detail}
              </Typography>
            ))}
          </Box>
        )}
        {Object.keys(s.rejectionCounts).length > 0 && (
          <>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Sequences rejected by hard constraints: {Object.entries(s.rejectionCounts).map(([k, n]) => `${REJECTION[k] ?? k} ${n}`).join(" · ")}
            </Typography>
            <Box component="details" sx={{ mt: 1 }}>
              <summary>Examples of rejected sequences</summary>
              <Box component="ul" sx={{ pl: 2.5 }}>
                {s.rejectedExamples.map((e, i) => (
                  <Typography component="li" variant="body2" key={i}>
                    {e.label}: {e.detail}
                  </Typography>
                ))}
              </Box>
            </Box>
          </>
        )}
        <Box component="details" sx={{ mt: 1 }}>
          <summary>Planting dates used</summary>
          <Box component="ul" sx={{ pl: 2.5 }}>
            {s.slots.map((x, i) => (
              <Typography component="li" variant="body2" key={i} sx={numeric}>
                {x.crop}: plant around {x.plant}, {x.days} days · {x.detail}
              </Typography>
            ))}
          </Box>
        </Box>
      </Block>

      <Block title="Inputs used">
        <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
          <Typography component="li" variant="body2">Water: {result.irrigationMode === "full" ? "irrigation applied to avoid stress (requirement reported)" : "rainfed"}.</Typography>
          <Typography component="li" variant="body2">Soil water capacity: {result.soil.awcMmPerM != null ? `${result.soil.awcMmPerM} mm per metre (${result.soil.source})` : "unknown"}.</Typography>
          <Typography component="li" variant="body2">Weather: NASA POWER daily, {result.period.fromYear}–{result.period.toYear}{result.period.completeYears != null ? ` (${result.period.completeYears} of ${result.period.totalYears} years complete)` : " (not available)"}.</Typography>
          <Typography component="li" variant="body2">
            Priorities{result.prioritiesDefaulted ? " (not recorded; all set to 3)" : ""}: {Object.entries(result.priorities).map(([k, v]) => `${PRIORITY[k as PriorityKey]} ${v}`).join(", ")}.
          </Typography>
        </Box>
      </Block>

      {result.gaps.length > 0 && (
        <Block title="Gaps">
          <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
            {result.gaps.map((g) => (
              <Typography component="li" variant="body2" key={g}>{g}</Typography>
            ))}
          </Box>
        </Block>
      )}
      <Block title="Questions to review locally">
        <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
          {result.reviewQuestions.map((q) => (
            <Typography component="li" variant="body2" key={q}>{q}</Typography>
          ))}
        </Box>
      </Block>
      <Block title="Assumptions">
        <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
          {result.assumptions.map((a) => (
            <Typography component="li" variant="body2" key={a}>{a}</Typography>
          ))}
        </Box>
      </Block>
      <Block title="Sources and reproducibility">
        <Box component="ul" sx={{ pl: 2.5, m: 0 }}>
          {result.references.map((r) => (
            <Typography component="li" variant="body2" key={r.key}>
              {r.citation} <Typography component="span" variant="body2" color="text.secondary">{r.usedFor}</Typography>
            </Typography>
          ))}
        </Box>
        <Box component="details" sx={{ mt: 1.5 }}>
          <summary>Technical provenance</summary>
          <Box component="dl" sx={{ ...numeric, fontSize: "0.8rem", display: "grid", gridTemplateColumns: { xs: "1fr", sm: "max-content 1fr" }, columnGap: 2, rowGap: 0.5, mt: 1, "& dd": { m: 0, overflowWrap: "anywhere" } }}>
            <dt>Engine</dt><dd>{result.engineVersion}</dd>
            <dt>Input snapshot</dt><dd>{result.snapshot.id} · sha256 {result.snapshot.inputsSha256}</dd>
            {result.datasets.map((d) => (
              <Box key={d.id} sx={{ display: "contents" }}>
                <dt>{d.kind}</dt><dd>{d.name} v{d.version} · {d.sha256}</dd>
              </Box>
            ))}
            <dt>Weather retrieval</dt><dd>{result.evidence.weatherRetrievalId ?? "none"}</dd>
            <dt>Soil retrieval</dt><dd>{result.evidence.soilRetrievalId ?? "none"}</dd>
            <dt>Engine input digest</dt><dd>{inputDigest ?? result.inputDigest ?? "—"}</dd>
            <dt>Result sha256</dt><dd>{resultSha256 ?? "—"}</dd>
          </Box>
        </Box>
      </Block>
    </Box>
  );
}
