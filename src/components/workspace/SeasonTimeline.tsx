"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";

import { CROP_FORM_COLORS, cropForm } from "@/domain/farm/crops";
import { FIELD_KEY } from "@/components/field3d/model";
import { GROWTH_STAGES, type GrowthStage } from "@/components/field3d/plants";
import { useT } from "@/lib/i18n/I18nProvider";
import { color, numeric, tokens } from "@/theme/tokens";

import type { WorkspaceState } from "./useWorkspace";

/**
 * Seasonal timeline: a year × zone table of recorded crops (farmer reports, the accessible
 * equivalent of the 3D scene) plus an illustrative growth-stage control for the 3D view.
 */
export function SeasonTimeline({ ws }: { ws: WorkspaceState }) {
  const t = useT();
  const regions = [{ key: FIELD_KEY, name: t("ws.wholeField") }, ...ws.zones.map((z) => ({ key: z.key, name: z.name }))];
  const selected = ws.selectedKey ?? FIELD_KEY;
  return (
    <Box component="section" aria-labelledby="timeline-title" sx={{ p: { xs: 1.5, md: 2 }, pt: { md: 1.5 } }}>
      <Stack direction="row" useFlexGap sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
        <Typography id="timeline-title" variant="subtitle2" component="h2">
          {t("ws.timeline")} <Typography component="span" variant="caption" color="text.secondary">· farmer-reported crops</Typography>
        </Typography>
        <Stack direction="row" useFlexGap sx={{ alignItems: "center", minWidth: 0, flexWrap: "wrap", gap: 1 }}>
          <Typography variant="caption" color="text.secondary" id="stage-label" sx={{ whiteSpace: "nowrap" }}>
            {t("ws.stage")}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={ws.stage}
            onChange={(_, v: GrowthStage | null) => v && ws.setStage(v)}
            aria-labelledby="stage-label"
            sx={{ flexWrap: "wrap", "& .MuiToggleButton-root": { px: 1.1, py: 0.4, fontSize: "0.78rem", whiteSpace: "nowrap", minHeight: 36 } }}
          >
            {GROWTH_STAGES.map((s) => (
              <ToggleButton key={s} value={s}>
                {t(`ws.stage.${s}`)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      <Box sx={{ overflowX: "auto", border: `1px solid ${color.line}`, borderRadius: 1.25, bgcolor: color.surfaceRaised }}>
        <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", minWidth: 120 + ws.years.length * 92, ...numeric }}>
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Crops recorded by year and zone. Select a cell to show that year and zone in the 3D view.</caption>
          <thead>
            <tr>
              <Box component="th" scope="col" sx={{ position: "sticky", left: 0, bgcolor: color.surfaceRaised, textAlign: "left", px: 1.5, py: 0.75, fontSize: "0.78rem", color: color.inkMuted, fontWeight: 600, zIndex: 1 }}>
                {t("ws.zones")}
              </Box>
              {ws.years.map((y) => (
                <Box component="th" scope="col" key={y} sx={{ px: 0.5, py: 0.5, fontWeight: 700, fontSize: "0.8rem" }}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => ws.setYear(y)}
                    aria-pressed={ws.year === y}
                    sx={{
                      all: "unset",
                      cursor: "pointer",
                      px: 1.25,
                      py: 0.5,
                      minHeight: 32,
                      minWidth: 56,
                      textAlign: "center",
                      borderRadius: 1,
                      bgcolor: ws.year === y ? tokens.forest[800] : "transparent",
                      color: ws.year === y ? tokens.neutral[50] : color.ink,
                      "&:focus-visible": { outline: `3px solid ${color.focus}` },
                    }}
                  >
                    {y}
                  </Box>
                </Box>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.key}>
                <Box component="th" scope="row" sx={{ position: "sticky", left: 0, bgcolor: color.surfaceRaised, textAlign: "left", px: 1.5, py: 0.5, fontSize: "0.82rem", fontWeight: selected === r.key ? 700 : 500, whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", borderTop: `1px solid ${color.line}`, zIndex: 1 }}>
                  {r.name}
                </Box>
                {ws.years.map((y) => {
                  const c = ws.cropFor(r.key === FIELD_KEY ? null : r.key, y);
                  const on = selected === r.key && ws.year === y;
                  const inherited = c?.scope === "field" && r.key !== FIELD_KEY;
                  return (
                    <Box component="td" key={y} sx={{ p: 0.4, borderTop: `1px solid ${color.line}` }}>
                      <Box
                        component="button"
                        type="button"
                        onClick={() => {
                          ws.setYear(y);
                          ws.setSelectedKey(r.key);
                        }}
                        aria-label={`${r.name}, ${y}: ${c ? c.cropName : t("ws.noCrop")}${inherited ? " (whole-field record)" : ""}${c?.pending ? " (not saved)" : ""}`}
                        aria-pressed={on}
                        sx={{
                          all: "unset",
                          boxSizing: "border-box",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 0.6,
                          width: "100%",
                          minHeight: 32,
                          px: 0.75,
                          borderRadius: 1,
                          fontSize: "0.78rem",
                          color: c ? color.ink : color.inkSubtle,
                          fontStyle: inherited ? "italic" : "normal",
                          bgcolor: on ? tokens.lime[200] : c?.pending ? tokens.lime[200] : "transparent",
                          outline: on ? `2px solid ${tokens.forest[600]}` : c?.pending ? `1px dashed ${tokens.forest[500]}` : "none",
                          "&:hover": { bgcolor: tokens.neutral[150] },
                          "&:focus-visible": { outline: `3px solid ${color.focus}` },
                        }}
                      >
                        {c && <Box component="span" aria-hidden="true" sx={{ width: 8, height: 8, flexShrink: 0, borderRadius: "2px", bgcolor: CROP_FORM_COLORS[cropForm(c.cropName)].plant }} />}
                        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c ? c.cropName : "—"}
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.75 }}>
        Past seasons as you recorded them; italics mean the zone inherits a whole-field record. This is not a forecast, and the growth stage only changes the illustration.
      </Typography>
    </Box>
  );
}
