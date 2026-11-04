"use client";

import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";

import { CROP_FORM_LABELS, cropForm } from "@/domain/farm/crops";
import { ZONE_BASIS_LABELS } from "@/domain/farm/records";
import { EVIDENCE_CLASS_INFO } from "@/domain/provenance/evidence";
import type { CoverageVerdict } from "@/domain/sources/coverage";
import { FIELD_KEY } from "@/components/field3d/model";
import { useT } from "@/lib/i18n/I18nProvider";
import { color, numeric, radius, tokens } from "@/theme/tokens";

import { MetricCard, useInspector } from "@/components/evidence/EvidenceDashboard";
import { SourcePanel } from "@/components/evidence/SourcePanel";
import type { FieldEvidence } from "@/domain/evidence/view";

import type { CoverageList, WorkspaceEvidence, WorkspaceFieldData } from "./types";
import type { WorkspaceState } from "./useWorkspace";

/** Farmer-facing headline: weather extremes, dryness and soil. Greenness is optional context on the evidence page. */
const HEADLINE = ["power:frost_days", "power:dry_spell_longest", "ssurgo:awc", "power:heat_days", "power:precip_season"];
const headlineMetrics = (ms: FieldEvidence["view"]["metrics"]) =>
  HEADLINE.map((id) => ms.find((m) => m.id === id)).filter((m): m is FieldEvidence["view"]["metrics"][number] => Boolean(m)).slice(0, 4);

/** The inspector hook needs evidence; with none, an empty placeholder keeps hook order stable. */
const EMPTY: FieldEvidence = { sources: [], view: { metrics: [], charts: { frost: null, heat: null, seasonalPrecip: null, tempAnomaly: null, wetnessAnomaly: null, precipNormal: null, ndviPeaks: null }, pixels: null, lastCompleteYear: null }, loadErrors: {} };
function useInspectorMaybe(e: FieldEvidence | null) {
  return useInspector(e ?? EMPTY);
}

const VERDICT: Record<CoverageVerdict, { label: string; bg: string; fg: string }> = {
  single_value: { label: "One value for the field", bg: tokens.neutral[200], fg: color.ink },
  coarse: { label: "Coarser than zones", bg: tokens.neutral[200], fg: color.ink },
  may_resolve: { label: "Can resolve within field", bg: tokens.lime[200], fg: color.ink },
  polygon_survey: { label: "Survey polygons", bg: tokens.lime[200], fg: color.ink },
  outside: { label: "No coverage here", bg: "#F6DED6", fg: "#6E2A1A" },
};

const STATUS_LABEL: Record<string, string> = {
  live_verified: "Live-verified source",
  credential_blocked: "Access pending",
  unavailable: "Service unavailable",
  researched: "Researched only",
  implemented: "Implemented",
};

function Dl({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.75 }}>
      {rows.map(([k, v]) => (
        <Box key={k} sx={{ display: "contents" }}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {k}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 600, ...numeric }}>
            {v}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/**
 * What a farmer needs about the selected field or zone: size, this year's crop, past seasons, soil
 * tests and the headline weather facts, with the next step. Sources, resolutions and the
 * illustrative 3D form sit under "Technical details" for advisers.
 */
export function InspectPanel({ ws, field, coverage, evidence }: { ws: WorkspaceState; field: WorkspaceFieldData; coverage: CoverageList; evidence?: WorkspaceEvidence | null }) {
  const inspector = useInspectorMaybe(evidence?.data ?? null);
  const t = useT();
  const key = ws.selectedKey && ws.selectedKey !== FIELD_KEY ? ws.selectedKey : null;
  const zone = key ? ws.zones.find((z) => z.key === key) : null;
  const crop = ws.cropFor(key, ws.year);
  const history = field.history.filter((h) => h.zone_id === key).sort((a, b) => b.season_year - a.season_year);
  const soil = field.soil.filter((s) => s.zone_id === key);
  const area = zone ? zone.areaHa : ws.sceneData ? (ws.sceneData.areaUnits * ws.sceneData.metresPerUnit ** 2) / 10000 : field.areaHa;
  const power = evidence?.data.sources.find((s) => s.source === "nasa-power-daily");
  const weatherReady = power?.status === "complete" || power?.status === "stale";
  const weatherBusy = power?.status === "queued" || power?.status === "running";
  const metrics = evidence ? headlineMetrics(evidence.data.view.metrics) : [];
  const usedSources = coverage.filter((c) => c.status === "live_verified" || c.status === "implemented");

  return (
    <Stack spacing={2.5}>
      <Box component="section" aria-labelledby="inspect-title">
        <Typography variant="overline" sx={{ color: color.leaf, fontWeight: 700 }}>
          {t("ws.inspect")}
        </Typography>
        <Typography id="inspect-title" variant="h5" component="h2" sx={{ mb: 1.5 }}>
          {zone ? zone.name : t("ws.wholeField")}
        </Typography>
        <Dl
          rows={[
            [t("ws.area"), area !== null && area !== undefined ? `${area.toFixed(2)} ha` : "—"],
            ...(zone ? ([["Basis", `${ZONE_BASIS_LABELS[zone.basis]} (your report)`]] as [string, string][]) : []),
            [
              `${t("ws.crop")} ${ws.year}`,
              crop ? `${crop.cropName} · ${crop.season.replace("_", " ")}${crop.pending ? " · not saved" : ""}${crop.scope === "field" && key ? " · whole-field record" : ""}` : t("ws.noCrop"),
            ],
          ]}
        />
        {zone?.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {zone.notes}
          </Typography>
        )}
        {field.id && (
          <Button component={NextLink} href={`/fields/${field.id}/records`} variant="contained" fullWidth endIcon={<ArrowForwardRoundedIcon />} sx={{ mt: 2 }}>
            {t("ws.steps")}
          </Button>
        )}
      </Box>

      <Box component="section" aria-labelledby="inspect-history" sx={{ p: 1.5, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surfaceRaised }}>
        <Typography id="inspect-history" variant="subtitle2" component="h3" sx={{ mb: 1 }}>
          {key ? "What you grew here" : "What you grew"}
        </Typography>
        {history.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No seasons yet.
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 0.5 }}>
            {history.slice(0, 8).map((h) => (
              <Typography component="li" key={h.id} variant="body2" sx={numeric}>
                {h.season_year} · {h.season.replace("_", " ")}: <strong>{h.crop_name}</strong>
                {h.reported_yield != null && h.reported_yield_unit ? ` · ${h.reported_yield} ${h.reported_yield_unit}` : ""}
              </Typography>
            ))}
          </Box>
        )}
        {soil.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
              Your soil tests
            </Typography>
            {soil.slice(0, 5).map((s) => (
              <Typography key={s.id} variant="body2" component="div" sx={numeric}>
                {s.label}: <strong>{s.value}</strong> · {s.observed_on}
              </Typography>
            ))}
          </Box>
        )}
      </Box>

      <Box component="section" aria-labelledby="inspect-evidence">
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", mb: 1 }}>
          <Typography id="inspect-evidence" variant="subtitle2" component="h3">
            Weather and soil here
          </Typography>
          {evidence && (
            <Chip
              size="small"
              label={weatherReady ? "Weather ready" : weatherBusy ? "Downloading…" : "Not downloaded"}
              sx={{ height: 22, fontWeight: 700, bgcolor: weatherReady ? tokens.lime[200] : tokens.neutral[200], color: weatherReady ? tokens.forest[900] : color.inkMuted }}
            />
          )}
        </Stack>
        {evidence ? (
          <Stack spacing={1.25}>
            {metrics.length > 0 ? (
              <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>
                {metrics.map((m) => (
                  <MetricCard key={m.id} metric={m} onInspect={() => inspector?.inspect(m)} />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {weatherBusy ? "The weather download is running in the background." : "Get the weather for this field to see frost, heat and dry spells here."}
              </Typography>
            )}
            {field.id && (
              <Button component={NextLink} href={`/fields/${field.id}/evidence`} variant="outlined">
                {weatherReady ? "See all weather and soil" : "Get weather"}
              </Button>
            )}
            {inspector?.dialog}
          </Stack>
        ) : (
          <Alert severity="info">
            {field.id ? "Weather and soil data could not be loaded right now. The rest of the field still works." : "Weather is fetched only for your own saved fields. The sample shows none rather than invented values."}
          </Alert>
        )}
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
          Comparisons replay past weather; they are not forecasts or yields. Plants in 3D are illustrative.
        </Typography>
      </Box>

      <Box component="details" sx={{ borderTop: `1px solid ${color.line}`, pt: 1.5, "& > summary": { cursor: "pointer", fontWeight: 600, fontSize: "0.9rem", color: tokens.forest[600] } }}>
        <summary>Technical details</summary>
        <Stack spacing={2} sx={{ mt: 1.5 }}>
          <Dl rows={[["3D form", crop ? `${CROP_FORM_LABELS[cropForm(crop.cropName)]} (illustrative)` : "Bare soil (illustrative)"]]} />
          {soil.length > 0 && (
            <Box>
              {soil.slice(0, 5).map((s) => (
                <Typography key={s.id} variant="caption" component="div" color="text.secondary">
                  {s.label}: {EVIDENCE_CLASS_INFO[s.evidence_class as "farmer_report"]?.label ?? s.evidence_class}
                </Typography>
              ))}
            </Box>
          )}
          {evidence && <SourcePanel sources={evidence.data.sources} actions={evidence.actions} compact renderedAt={evidence.renderedAt} />}
          <Box>
            <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
              How fine each data source is here
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
              Native resolution of the sources Astrapon uses, compared with the size of this field.
            </Typography>
            <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>
              {usedSources.map((c) => (
                <Box component="li" key={c.id} sx={{ p: 1.25, borderRadius: `${radius.md}px`, border: `1px solid ${color.line}`, bgcolor: color.surfaceRaised }}>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {c.name}
                    </Typography>
                    <Chip size="small" label={VERDICT[c.verdict].label} sx={{ height: 22, bgcolor: VERDICT[c.verdict].bg, color: VERDICT[c.verdict].fg }} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                    {EVIDENCE_CLASS_INFO[c.evidenceClass].label} · {STATUS_LABEL[c.status] ?? c.status} · native {c.spatialSupport}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {c.note}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
