"use client";

import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";

import { FieldMap, type MapOverlay, type MapShape } from "@/components/map/FieldMap";
import { INDICATORS, type PipelineSource } from "@/domain/evidence/catalog";
import { pixelFootprint, type PixelGrid } from "@/domain/evidence/footprint";
import type { FieldEvidence, Metric, SourceState } from "@/domain/evidence/view";
import type { BoundaryGeometry, Position } from "@/domain/geo/boundary";
import { color, numeric, radius, tokens } from "@/theme/tokens";

import { ColumnChart, LineChart } from "./charts";
import { EvidenceClassChip, EvidenceInspector } from "./EvidenceInspector";
import { SourcePanel } from "./SourcePanel";

export type EvidenceActions = {
  request: (sources: PipelineSource[]) => Promise<{ ok: boolean; message: string }>;
  cancel: (jobId: string) => Promise<{ ok: boolean; message: string }>;
};

/** Sequential single-hue ramp (light → dark leaf) for per-pixel greenness. */
const NDVI_RAMP = ["#E4EFD9", "#BFD9A8", "#8DBA74", "#5A9450", "#2F6B3F"];
const NDVI_BREAKS = [0.5, 0.6, 0.7, 0.8];
const ndviFill = (v: number) => NDVI_RAMP[NDVI_BREAKS.filter((b) => v >= b).length]!;

export function MetricCard({ metric, onInspect }: { metric: Metric; onInspect: () => void }) {
  return (
    <Box component="li" sx={{ p: 2, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surfaceRaised, display: "flex", flexDirection: "column", gap: 0.75 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {metric.label}
        </Typography>
        <EvidenceClassChip value={metric.evidenceClass} />
      </Stack>
      <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.2, color: metric.status === "ok" ? color.ink : color.inkSubtle, ...numeric }}>{metric.display}</Typography>
      <Typography variant="caption" color="text.secondary" sx={numeric}>
        {metric.period}
      </Typography>
      {metric.comparison && (
        <Typography variant="caption" sx={numeric}>
          {metric.comparison}
        </Typography>
      )}
      <Box sx={{ flex: 1 }} />
      <Button size="small" startIcon={<InfoOutlinedIcon />} onClick={onInspect} sx={{ alignSelf: "flex-start", minHeight: 36 }} aria-label={`How is “${metric.label}” measured?`}>
        How is this measured?
      </Button>
    </Box>
  );
}

export function useInspector(evidence: FieldEvidence) {
  const [open, setOpen] = useState<Metric | null>(null);
  const retrieval = open ? (evidence.sources.find((s) => s.source === open.source)?.retrieval ?? null) : null;
  return {
    inspect: setOpen,
    dialog: <EvidenceInspector metric={open} retrieval={retrieval} open={Boolean(open)} onClose={() => setOpen(null)} />,
  };
}

export function footprintOverlays(sources: SourceState[], pixels: FieldEvidence["view"]["pixels"]): MapOverlay[] {
  const out: MapOverlay[] = [];
  const power = sources.find((s) => s.source === "nasa-power-daily")?.retrieval;
  const cell = (power?.provenance as { cell?: { footprint: Position[] } } | undefined)?.cell;
  if (cell) out.push({ ring: cell.footprint, kind: "power_cell", label: "NASA POWER grid cell: one value for this whole area (model-derived)" });
  const modis = sources.find((s) => s.source === "modis-mod13q1-ornl")?.retrieval;
  const prov = modis?.provenance as { grid?: PixelGrid; pixels?: { id: string; fraction: number }[] } | undefined;
  if (prov?.grid && prov.pixels) {
    const values = new Map((pixels ?? []).map((p) => [p.id, p.value]));
    for (const p of prov.pixels) {
      const m = /^r(\d+)c(\d+)$/.exec(p.id);
      if (!m) continue;
      const v = values.get(p.id);
      out.push({
        ring: pixelFootprint(prov.grid, Number(m[1]), Number(m[2])),
        kind: "modis_pixel",
        fill: v != null ? ndviFill(v) : null,
        label: `MODIS pixel ${p.id} · ${Math.round(p.fraction * 100)}% inside the field${v != null ? ` · typical peak NDVI ${v.toFixed(2)} (observed)` : ""}`,
      });
    }
  }
  return out;
}

export function EvidenceDashboard({ evidence, actions, boundary, zones, renderedAt }: { evidence: FieldEvidence; actions: EvidenceActions; boundary: BoundaryGeometry; zones: { id: string; name: string; boundary: BoundaryGeometry }[]; renderedAt: number }) {
  const { inspect, dialog } = useInspector(evidence);
  const { view, sources } = evidence;
  const overlays = useMemo(() => footprintOverlays(sources, view.pixels), [sources, view.pixels]);
  const shapes = useMemo<MapShape[]>(() => [{ key: "field", geometry: boundary, kind: "field", label: "Your field (farmer-drawn)" }, ...zones.map((z) => ({ key: z.id, geometry: z.boundary, kind: "zone" as const, label: `${z.name} (your zone, farmer-drawn)` }))], [boundary, zones]);
  const hasPower = Boolean(view.charts.frost);
  const modisProv = sources.find((s) => s.source === "modis-mod13q1-ornl")?.retrieval?.provenance as { representation?: string; withinField?: boolean; usedPixels?: number } | undefined;

  return (
    <Stack spacing={4}>
      <SourcePanel sources={sources} actions={actions} renderedAt={renderedAt} />
      {Object.entries(evidence.loadErrors).map(([s, e]) => (
        <Alert key={s} severity="error">
          Stored values for {s} could not be loaded ({e}). Other sources are unaffected.
        </Alert>
      ))}

      <Box component="section" aria-labelledby="metrics-h">
        <Typography id="metrics-h" variant="h5" component="h2" sx={{ mb: 0.5 }}>
          What the evidence says about this place
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 760 }}>
          Past conditions only. None of these numbers is a forecast, a yield, or a measure of crop damage. Select “How is this measured?” for the source, period, coverage and limits.
        </Typography>
        {view.metrics.length === 0 ? (
          <Alert severity="info">No evidence has been fetched for this field yet. Use “Refresh all” above; the worker downloads and processes the data in the background.</Alert>
        ) : (
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" } }}>
            {view.metrics.map((m) => (
              <MetricCard key={m.id} metric={m} onInspect={() => inspect(m)} />
            ))}
          </Box>
        )}
      </Box>

      <Box component="section" aria-labelledby="footprint-h">
        <Typography id="footprint-h" variant="h5" component="h2" sx={{ mb: 0.5 }}>
          What each source can see
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, maxWidth: 760 }}>
          Light blue dashed: the NASA POWER cell, one model value for the whole area. Thin white dashed squares: MODIS pixels (observed).{" "}
          {modisProv?.withinField
            ? "Pixels mostly inside your field are shaded by their typical peak greenness, because this source resolves differences inside the field."
            : modisProv
              ? "No two pixels lie mostly inside your field, so greenness is shown as one shared neighbourhood value, not as a pattern inside the field."
              : ""}{" "}
          White dashed outlines are your own zones: farmer-drawn, not observed.
        </Typography>
        <Box sx={{ height: { xs: 320, md: 420 }, borderRadius: `${radius.lg}px`, overflow: "hidden", border: `1px solid ${color.line}` }}>
          <FieldMap label="Map of data footprints around the field" shapes={shapes} draw={null} focus={null} fitKey="evidence" basemap="satellite" imageryDate="2026-01-01" overlays={overlays} />
        </Box>
        {modisProv?.withinField && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center", flexWrap: "wrap" }} aria-label="Greenness legend">
            <Typography variant="caption">Typical peak NDVI (observed):</Typography>
            {NDVI_RAMP.map((c, i) => (
              <Stack key={c} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                <Box sx={{ width: 14, height: 14, bgcolor: c, borderRadius: "3px", border: `1px solid ${tokens.neutral[300]}` }} />
                <Typography variant="caption" sx={numeric}>
                  {i === 0 ? `< ${NDVI_BREAKS[0]}` : i === NDVI_RAMP.length - 1 ? `≥ ${NDVI_BREAKS.at(-1)}` : `${NDVI_BREAKS[i - 1]}–${NDVI_BREAKS[i]}`}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>

      {hasPower && (
        <Box component="section" aria-labelledby="climate-h">
          <Typography id="climate-h" variant="h5" component="h2" sx={{ mb: 2 }}>
            Weather history of the grid cell <EvidenceClassChip value="assimilated_model_product" />
          </Typography>
          <Box sx={{ display: "grid", gap: 4, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" } }}>
            <ColumnChart
              title={INDICATORS.frost_days!.label}
              unit="days"
              data={view.charts.frost!.points.map((p) => ({ x: p.x, y: p.y, note: p.y === null ? `${p.valid}/${p.expected} valid days` : undefined }))}
              reference={view.charts.frost!.baseline !== null ? { value: view.charts.frost!.baseline, label: `1991–2020 avg ${view.charts.frost!.baseline.toFixed(0)}` } : null}
            />
            <ColumnChart
              title={INDICATORS.heat_days!.label}
              unit="days"
              data={view.charts.heat!.points.map((p) => ({ x: p.x, y: p.y }))}
              reference={view.charts.heat!.baseline !== null ? { value: view.charts.heat!.baseline, label: `1991–2020 avg ${view.charts.heat!.baseline.toFixed(1)}` } : null}
            />
            {view.charts.seasonalPrecip && (
              <ColumnChart
                title="Seasonal precipitation compared with normal"
                subtitle="Each bar: season total minus the 1991–2020 average for that season."
                unit="mm"
                diverging
                lowLabel="Drier than normal"
                highLabel="Wetter than normal"
                data={view.charts.seasonalPrecip.points.map((p) => ({ x: p.x.replace(/^(\w{3})–(\w{3}) (\d{4})$/, "$1–$2 '$3").replace(/'(\d{2})(\d{2})/, "'$2"), y: p.y !== null && p.normal !== null ? Math.round(p.y - p.normal) : null, note: p.percent !== null ? `${p.percent}% of normal` : undefined }))}
              />
            )}
            {view.charts.wetnessAnomaly && (
              <ColumnChart
                title="Root-zone soil wetness compared with normal (model)"
                subtitle="Monthly mean minus the 1991–2020 mean for that month; 0–1 wetness scale."
                unit="0–1"
                digits={2}
                diverging
                lowLabel="Drier"
                highLabel="Wetter"
                data={view.charts.wetnessAnomaly.points.map((p) => ({ x: p.x.slice(2), y: p.y }))}
              />
            )}
          </Box>
        </Box>
      )}

      {view.charts.ndviPeaks && (
        <Box component="section" aria-labelledby="ndvi-h">
          <Typography id="ndvi-h" variant="h5" component="h2" sx={{ mb: 0.5 }}>
            Greenness from space <EvidenceClassChip value="satellite_observation" />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 760 }}>
            {modisProv?.representation === "field_pixels"
              ? `Mean of ${modisProv.usedPixels} MODIS pixel(s) lying mostly inside the field.`
              : "One MODIS pixel at the field's centre; it also contains neighbouring land."}{" "}
            NDVI shows how green the canopy was. It cannot tell which crop grew, or anything about yield, disease or nutrients.
          </Typography>
          <LineChart
            title="Peak greenness each year"
            subtitle={
              view.charts.ndviPeaks.slopePerDecade !== null
                ? `Dashed line: Theil–Sen direction, ${view.charts.ndviPeaks.slopePerDecade > 0 ? "+" : ""}${view.charts.ndviPeaks.slopePerDecade.toFixed(3)} NDVI per decade over ${view.charts.ndviPeaks.years} years (descriptive, no significance test).`
                : "Not enough good years for a direction."
            }
            unit="NDVI"
            data={view.charts.ndviPeaks.points.map((p) => ({ x: p.x, y: p.y }))}
            trend={(() => {
              const pts = view.charts.ndviPeaks!.points;
              const s = view.charts.ndviPeaks!.slopePerDecade;
              if (s === null) return null;
              // Theil–Sen intercept: median of y − slope·i over the plotted points.
              const per = s / 10;
              const r = pts.flatMap((p, i) => (p.y === null ? [] : [p.y - per * i])).sort((a, b) => a - b);
              return { slopePerUnit: per, anchor: { i: 0, y: r[Math.floor(r.length / 2)] ?? 0 } };
            })()}
          />
        </Box>
      )}
      {dialog}
    </Stack>
  );
}
