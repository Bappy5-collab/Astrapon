"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { CROP_FORM_LABELS, cropForm } from "@/domain/farm/crops";
import { ZONE_BASIS_LABELS } from "@/domain/farm/records";
import { EVIDENCE_CLASS_INFO } from "@/domain/provenance/evidence";
import type { CoverageVerdict } from "@/domain/sources/coverage";
import { FIELD_KEY } from "@/components/field3d/model";
import { useT } from "@/lib/i18n/I18nProvider";
import { color, numeric, radius, tokens } from "@/theme/tokens";

import type { CoverageList, WorkspaceFieldData } from "./types";
import type { WorkspaceState } from "./useWorkspace";

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
          <Typography component="dd" variant="body2" sx={{ m: 0, ...numeric }}>
            {v}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export function InspectPanel({ ws, field, coverage }: { ws: WorkspaceState; field: WorkspaceFieldData; coverage: CoverageList }) {
  const t = useT();
  const key = ws.selectedKey && ws.selectedKey !== FIELD_KEY ? ws.selectedKey : null;
  const zone = key ? ws.zones.find((z) => z.key === key) : null;
  const crop = ws.cropFor(key, ws.year);
  const history = field.history.filter((h) => h.zone_id === key).sort((a, b) => b.season_year - a.season_year);
  const soil = field.soil.filter((s) => s.zone_id === key);
  const area = zone ? zone.areaHa : (ws.sceneData ? ws.sceneData.areaUnits * ws.sceneData.metresPerUnit ** 2 / 10000 : field.areaHa);

  return (
    <Stack spacing={3}>
      <Box component="section" aria-labelledby="inspect-title">
        <Typography variant="overline" sx={{ color: color.leaf }}>
          {t("ws.inspect")}
        </Typography>
        <Typography id="inspect-title" variant="h5" component="h2" sx={{ mb: 1.5 }}>
          {zone ? zone.name : t("ws.wholeField")}
        </Typography>
        <Dl
          rows={[
            [t("ws.area"), area !== null && area !== undefined ? `${area.toFixed(2)} ha` : "—"],
            ...(zone ? ([["Basis", `${ZONE_BASIS_LABELS[zone.basis]} (farmer report)`]] as [string, string][]) : []),
            [
              `${t("ws.crop")} ${ws.year}`,
              crop ? `${crop.cropName} · ${crop.season.replace("_", " ")}${crop.pending ? " · not saved" : ""}${crop.scope === "field" && key ? " · whole-field record" : ""}` : t("ws.noCrop"),
            ],
            ["3D form", crop ? `${CROP_FORM_LABELS[cropForm(crop.cropName)]} (illustrative)` : "Bare soil (illustrative)"],
          ]}
        />
        {zone?.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {zone.notes}
          </Typography>
        )}
      </Box>

      <Box component="section" aria-labelledby="inspect-history">
        <Typography id="inspect-history" variant="subtitle2" component="h3" sx={{ mb: 1 }}>
          Recorded seasons {key ? "for this zone" : "for the whole field"}
        </Typography>
        {history.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            None recorded yet.
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 0.5 }}>
            {history.slice(0, 8).map((h) => (
              <Typography component="li" key={h.id} variant="body2" sx={numeric}>
                {h.season_year} · {h.season.replace("_", " ")}: <strong>{h.crop_name}</strong>
                {h.reported_yield != null && h.reported_yield_unit ? ` · reported ${h.reported_yield} ${h.reported_yield_unit}` : ""}
              </Typography>
            ))}
          </Box>
        )}
        {soil.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
              Soil observations
            </Typography>
            {soil.slice(0, 5).map((s) => (
              <Typography key={s.id} variant="body2" sx={numeric}>
                {s.observed_on} · {s.label}: {s.value} <Chip size="small" label={EVIDENCE_CLASS_INFO[s.evidence_class as "farmer_report"]?.label ?? s.evidence_class} sx={{ height: 20, fontSize: "0.7rem" }} />
              </Typography>
            ))}
          </Box>
        )}
      </Box>

      <Box component="section" aria-labelledby="inspect-evidence">
        <Typography variant="overline" sx={{ color: color.leaf }}>
          {t("ws.evidence")}
        </Typography>
        <Typography id="inspect-evidence" variant="subtitle2" component="h3" sx={{ mb: 1 }}>
          Which sources could describe this field
        </Typography>
        <Alert severity="info" sx={{ mb: 1.5 }}>
          No environmental values have been retrieved for this field yet. Below is what each selected source&apos;s native grid means at this field&apos;s size, before any data is fetched.
        </Alert>
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }}>
          {coverage.map((c) => (
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

      <Box component="section" aria-labelledby="inspect-sim">
        <Typography id="inspect-sim" variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
          Simulation results
        </Typography>
        <Typography variant="body2" color="text.secondary">
          None. The rotation engine is not built yet, so FieldShift shows no yields, water use, risks or rankings. The 3D growth stages are illustrative and are not observations or predictions.
        </Typography>
      </Box>
    </Stack>
  );
}
