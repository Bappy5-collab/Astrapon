/**
 * Builds the evidence view for one field from stored aggregates: headline metrics, chart series
 * and the facts the inspector shows. Pure and deterministic; every number traces to aggregate rows
 * of one retrieval.
 */
import type { EvidenceClass } from "@/domain/provenance/evidence";

import { round, type PeriodValue } from "./aggregate";
import { INDICATORS, SOURCE_LABELS, type PipelineSource } from "./catalog";
import { anomalies, BASELINE, climatology, meanOfYears, ndviTrendPerDecade, seasonal, SEASONS, type YearValue } from "./indicators";

export type StoredAggregate = {
  variable: string;
  unit: string;
  aggregation: string;
  period_start: string;
  period_end: string;
  value: number | null;
  valid_count: number;
  expected_count: number;
  pixel: string;
};

export type RetrievalMeta = {
  id: string;
  source_id: PipelineSource;
  product_id: string;
  product_version: string | null;
  processing_version: string | null;
  evidence_class: string;
  spatial_support: string;
  retrieved_at: string;
  created_at: string;
  observation_start: string | null;
  observation_end: string | null;
  outcome: string;
  response_sha256: string;
  response_bytes: number;
  cache_key: string | null;
  request: Record<string, unknown>;
  provenance: Record<string, unknown>;
  checks: { id: string; passed: boolean; detail: string }[];
};

export type Metric = {
  id: string;
  indicator: string;
  label: string;
  value: number | null;
  unit: string;
  /** Short readable value, e.g. "112 days/year". */
  display: string;
  period: string;
  comparison: string | null;
  evidenceClass: EvidenceClass;
  source: PipelineSource;
  retrievalId: string;
  completeness: string;
  status: "ok" | "insufficient";
};

export type SeriesPoint = { x: string; y: number | null; valid?: number; expected?: number };

export type EvidenceView = {
  metrics: Metric[];
  charts: {
    frost: { points: SeriesPoint[]; baseline: number | null } | null;
    heat: { points: SeriesPoint[]; baseline: number | null } | null;
    seasonalPrecip: { points: (SeriesPoint & { normal: number | null; percent: number | null; season: string })[] } | null;
    tempAnomaly: { points: SeriesPoint[] } | null;
    wetnessAnomaly: { points: SeriesPoint[] } | null;
    precipNormal: { points: SeriesPoint[] } | null;
    ndviPeaks: { points: SeriesPoint[]; slopePerDecade: number | null; years: number } | null;
  };
  /** Per-pixel latest-decade median peak NDVI, only when the source resolves the field. */
  pixels: { id: string; value: number | null; fraction: number }[] | null;
  lastCompleteYear: number | null;
};

const toPeriod = (rows: StoredAggregate[], variable: string, aggregation: string): PeriodValue[] =>
  rows
    .filter((r) => r.variable === variable && r.aggregation === aggregation && r.pixel === "")
    .map((r) => ({
      variable: r.variable, unit: r.unit, aggregation: r.aggregation as PeriodValue["aggregation"], periodStart: r.period_start, periodEnd: r.period_end,
      value: r.value === null ? null : Number(r.value), validCount: r.valid_count, expectedCount: r.expected_count,
    }))
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));

const toYears = (rows: StoredAggregate[], variable: string, pixel = ""): YearValue[] =>
  rows
    .filter((r) => r.variable === variable && r.pixel === pixel && r.period_start.endsWith("-01-01") && r.period_end.endsWith("-12-31"))
    .map((r) => ({ year: Number(r.period_start.slice(0, 4)), value: r.value === null ? null : Number(r.value), validCount: r.valid_count, expectedCount: r.expected_count }))
    .sort((a, b) => a.year - b.year);

const fmt = (v: number | null, digits: number, unit: string) => (v === null ? "Not enough data" : `${v.toFixed(digits)} ${unit}`);
const signed = (v: number, digits: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`;

export function buildEvidenceView(input: { retrievals: Partial<Record<PipelineSource, { meta: RetrievalMeta; rows: StoredAggregate[] }>> }): EvidenceView {
  const metrics: Metric[] = [];
  const charts: EvidenceView["charts"] = { frost: null, heat: null, seasonalPrecip: null, tempAnomaly: null, wetnessAnomaly: null, precipNormal: null, ndviPeaks: null };
  let pixels: EvidenceView["pixels"] = null;
  let lastCompleteYear: number | null = null;

  const power = input.retrievals["nasa-power-daily"];
  if (power) {
    const rows = power.rows;
    const ev = power.meta.evidence_class as EvidenceClass;
    const frost = toYears(rows, "frost_days");
    lastCompleteYear = frost.filter((y) => y.value !== null).at(-1)?.year ?? null;
    const recent = lastCompleteYear ? { from: lastCompleteYear - 9, to: lastCompleteYear } : null;
    const yearly = (variable: string, indicator: string, digits: number, unit: string) => {
      const ys = toYears(rows, variable);
      const r = recent ? meanOfYears(ys, recent.from, recent.to, 8) : { value: null, years: 0 };
      const b = meanOfYears(ys, BASELINE.start, BASELINE.end, 24);
      metrics.push({
        id: `power:${indicator}`,
        indicator,
        label: INDICATORS[indicator]!.label,
        value: r.value,
        unit,
        display: fmt(r.value, digits, unit),
        period: recent ? `${recent.from}–${recent.to} average (${r.years} complete years)` : "No complete years",
        comparison: r.value !== null && b.value !== null ? `${BASELINE.start}–${BASELINE.end} average: ${b.value.toFixed(digits)} ${unit}` : null,
        evidenceClass: ev,
        source: "nasa-power-daily",
        retrievalId: power.meta.id,
        completeness: `${r.years} of 10 recent years met the ≥ 95% valid-day rule`,
        status: r.value === null ? "insufficient" : "ok",
      });
      return { points: ys.map((y) => ({ x: String(y.year), y: y.value, valid: y.validCount, expected: y.expectedCount })), baseline: b.value };
    };
    charts.frost = yearly("frost_days", "frost_days", 0, "days/year");
    charts.heat = yearly("heat_days", "heat_days", 0, "days/year");
    yearly("dry_spell_longest", "dry_spell_longest", 0, "days");
    yearly("dry_spells_10d", "dry_spells_10d", 1, "spells/year");

    const precip = toPeriod(rows, "PRECTOTCORR", "sum");
    const pClim = climatology(precip);
    charts.precipNormal = { points: pClim.map((c) => ({ x: String(c.month), y: c.value })) };
    const seasons = seasonal(precip, "sum");
    const seasonNormal = (id: string) => {
      const s = SEASONS.find((q) => q.id === id)!;
      const parts = s.months.map((m) => pClim[m - 1]?.value ?? null);
      return parts.some((v) => v === null) ? null : round(parts.reduce<number>((a, v) => a + (v ?? 0), 0), 1);
    };
    const lastSeasons = seasons.filter((s) => s.value !== null).slice(-12);
    charts.seasonalPrecip = {
      points: lastSeasons.map((s) => {
        const normal = seasonNormal(s.season);
        return { x: `${SEASONS.find((q) => q.id === s.season)!.label} ${s.year}`, season: s.season, y: s.value, normal, percent: normal && s.value !== null ? round((100 * s.value) / normal, 0) : null };
      }),
    };
    const lastS = charts.seasonalPrecip.points.at(-1);
    metrics.push({
      id: "power:precip_season",
      indicator: "precip_season",
      label: "Last complete season's precipitation",
      value: lastS?.y ?? null,
      unit: "mm",
      display: lastS?.y != null ? `${Math.round(lastS.y)} mm` : "Not enough data",
      period: lastS ? lastS.x : "—",
      comparison: lastS?.percent != null ? `${lastS.percent}% of the ${BASELINE.start}–${BASELINE.end} normal (${Math.round(lastS.normal!)} mm)` : null,
      evidenceClass: ev,
      source: "nasa-power-daily",
      retrievalId: power.meta.id,
      completeness: "Each month needs ≥ 90% valid days; every month of the season must be present",
      status: lastS?.y != null ? "ok" : "insufficient",
    });

    const t = toPeriod(rows, "T2M", "mean");
    const tAnom = anomalies(t, climatology(t)).filter((a) => a.anomaly !== null);
    charts.tempAnomaly = { points: tAnom.slice(-24).map((a) => ({ x: a.periodStart.slice(0, 7), y: a.anomaly })) };
    const last12 = tAnom.slice(-12);
    const tMean = last12.length === 12 ? round(last12.reduce((s, a) => s + a.anomaly!, 0) / 12, 2) : null;
    metrics.push({
      id: "power:temp_anomaly",
      indicator: "temp_anomaly",
      label: "Last 12 months vs normal temperature",
      value: tMean,
      unit: "°C",
      display: tMean === null ? "Not enough data" : `${signed(tMean, 1)} °C`,
      period: last12.length ? `${last12[0]!.periodStart.slice(0, 7)} to ${last12.at(-1)!.periodStart.slice(0, 7)}` : "—",
      comparison: `Mean of monthly differences from ${BASELINE.start}–${BASELINE.end}`,
      evidenceClass: ev,
      source: "nasa-power-daily",
      retrievalId: power.meta.id,
      completeness: `${last12.length} of 12 months complete`,
      status: tMean === null ? "insufficient" : "ok",
    });

    const w = toPeriod(rows, "GWETROOT", "mean");
    const wAnom = anomalies(w, climatology(w)).filter((a) => a.anomaly !== null);
    charts.wetnessAnomaly = { points: wAnom.slice(-24).map((a) => ({ x: a.periodStart.slice(0, 7), y: a.anomaly })) };
    const lastW = wAnom.at(-1);
    metrics.push({
      id: "power:soil_wetness",
      indicator: "soil_wetness",
      label: "Root-zone soil wetness, latest month (model)",
      value: lastW?.value ?? null,
      unit: "0–1",
      display: lastW?.value != null ? lastW.value.toFixed(2) : "Not enough data",
      period: lastW ? lastW.periodStart.slice(0, 7) : "—",
      comparison: lastW?.normal != null ? `Normal for the month: ${lastW.normal.toFixed(2)} (${signed(lastW.anomaly!, 2)})` : null,
      evidenceClass: ev,
      source: "nasa-power-daily",
      retrievalId: power.meta.id,
      completeness: "Monthly ≥ 90% valid days",
      status: lastW?.value != null ? "ok" : "insufficient",
    });
  }

  const modis = input.retrievals["modis-mod13q1-ornl"];
  if (modis) {
    const peaks = toYears(modis.rows, "ndvi_annual_peak");
    const trend = ndviTrendPerDecade(peaks);
    const lastYear = new Date(`${modis.meta.observation_end ?? "2000-01-01"}T00:00:00Z`).getUTCFullYear() - 1;
    const recent = peaks.filter((p) => p.year >= lastYear - 9 && p.year <= lastYear && p.value !== null).map((p) => p.value!).sort((a, b) => a - b);
    const median = recent.length >= 5 ? round(recent.length % 2 ? recent[(recent.length - 1) / 2]! : (recent[recent.length / 2 - 1]! + recent[recent.length / 2]!) / 2, 2) : null;
    charts.ndviPeaks = { points: peaks.map((p) => ({ x: String(p.year), y: p.value, valid: p.validCount, expected: p.expectedCount })), slopePerDecade: trend.slope, years: trend.years };
    metrics.push({
      id: "modis:ndvi_peak",
      indicator: "ndvi_peak",
      label: "Typical peak greenness (NDVI)",
      value: median,
      unit: "NDVI",
      display: median === null ? "Not enough data" : median.toFixed(2),
      period: `Median of ${recent.length} years, ${lastYear - 9}–${lastYear}`,
      comparison: trend.slope === null ? `Trend needs ≥ 8 years (${trend.years} available)` : `Direction since ${peaks.find((p) => p.value !== null)?.year}: ${signed(trend.slope, 3)} NDVI per decade (descriptive)`,
      evidenceClass: modis.meta.evidence_class as EvidenceClass,
      source: "modis-mod13q1-ornl",
      retrievalId: modis.meta.id,
      completeness: "Only good-quality composites; years with fewer than 8 are left out",
      status: median === null ? "insufficient" : "ok",
    });
    const prov = modis.meta.provenance as { withinField?: boolean; pixels?: { id: string; fraction: number }[] };
    if (prov.withinField) {
      pixels = (prov.pixels ?? [])
        .filter((p) => p.fraction >= 0.75)
        .map((p) => {
          const ys = toYears(modis.rows, "ndvi_annual_peak", p.id).filter((y) => y.year >= lastYear - 9 && y.year <= lastYear && y.value !== null).map((y) => y.value!).sort((a, b) => a - b);
          const v = ys.length >= 5 ? round(ys[Math.floor(ys.length / 2)]!, 2) : null;
          return { id: p.id, value: v, fraction: p.fraction };
        });
    }
  }

  const soil = input.retrievals["usda-ssurgo-sda"];
  if (soil) {
    const r = soil.rows.find((x) => x.variable === "awc_0_100cm");
    const v = r?.value == null ? null : Number(r.value);
    metrics.push({
      id: "ssurgo:awc",
      indicator: "awc",
      label: INDICATORS.awc!.label,
      value: v,
      unit: "mm",
      display: v === null ? "Not enough data" : `${Math.round(v)} mm`,
      period: `Survey version ${soil.meta.product_version ?? "unknown"}`,
      comparison: r ? `${r.valid_count} of ${r.expected_count} major soil components complete` : null,
      evidenceClass: soil.meta.evidence_class as EvidenceClass,
      source: "usda-ssurgo-sda",
      retrievalId: soil.meta.id,
      completeness: "Components missing any horizon value are excluded, not counted short",
      status: v === null ? "insufficient" : "ok",
    });
  }

  return { metrics, charts, pixels, lastCompleteYear };
}

export type SourceState = {
  source: PipelineSource;
  label: string;
  plain: string;
  retrieval: RetrievalMeta | null;
  job: { id: string; status: string; attempts: number; max_attempts: number; progress: Record<string, unknown>; error_kind: string | null; error_message: string | null; created_at: string; started_at: string | null; finished_at: string | null; next_attempt_at: string } | null;
  stale: boolean;
  /** Human status line. */
  status: "not_requested" | "queued" | "running" | "complete" | "failed" | "stale" | "not_applicable";
};

export function sourceState(source: PipelineSource, retrieval: RetrievalMeta | null, job: SourceState["job"], now: Date): SourceState {
  const info = SOURCE_LABELS[source];
  const stale = retrieval ? (now.getTime() - Date.parse(retrieval.retrieved_at)) / 86_400_000 > info.staleAfterDays : false;
  let status: SourceState["status"] = retrieval ? (stale ? "stale" : "complete") : "not_requested";
  if (job?.status === "queued") status = "queued";
  else if (job?.status === "running") status = "running";
  else if (job?.status === "failed") status = job.error_kind === "not_applicable" ? "not_applicable" : retrieval ? "stale" : "failed";
  return { source, label: info.name, plain: info.plain, retrieval, job, stale: stale || (job?.status === "failed" && Boolean(retrieval)), status };
}

export type FieldEvidence = {
  sources: SourceState[];
  view: EvidenceView;
  loadErrors: Partial<Record<PipelineSource, string>>;
};
