"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useRef, useState } from "react";

import type { Position } from "@/domain/geo/boundary";
import { useT } from "@/lib/i18n/I18nProvider";
import { overlaySurface } from "@/theme/tokens";

import { defaultImageryDate, findImageryDate } from "./basemaps";
import type { Basemap } from "./FieldMapGL";

/**
 * Base-map switch plus HLS imagery date. Choosing NASA imagery looks back from the chosen date for
 * the nearest day with a tile over the map centre (HLS only exists where a satellite passed).
 */
export function ImageryControls({
  basemap,
  onBasemap,
  date,
  onDate,
  point,
}: {
  basemap: Basemap;
  onBasemap: (b: Basemap) => void;
  date: string;
  onDate: (d: string) => void;
  point: () => Position | null;
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "busy" | "none">("idle");
  const ctrl = useRef<AbortController | null>(null);

  async function findNearest(from = date) {
    const p = point();
    if (!p) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState("busy");
    const d = await findImageryDate(p[1], p[0], from, 30, c.signal);
    if (c.signal.aborted) return;
    if (d) {
      onDate(d);
      setState("idle");
    } else setState("none");
  }

  return (
    <Stack spacing={1} sx={{ alignItems: "flex-end", maxWidth: "100%" }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={basemap}
          onChange={(_, v: Basemap | null) => {
            if (!v) return;
            onBasemap(v);
            if (v === "imagery") void findNearest();
            else ctrl.current?.abort();
          }}
          aria-label={t("ws.basemap")}
          sx={{ ...overlaySurface, borderRadius: 1.25, "& .MuiToggleButton-root": { minHeight: 40 } }}
        >
          <ToggleButton value="satellite">{t("ws.satellite")}</ToggleButton>
          <ToggleButton value="streets">{t("ws.streets")}</ToggleButton>
          <ToggleButton value="imagery">{t("ws.imagery")}</ToggleButton>
        </ToggleButtonGroup>
        {basemap === "imagery" && (
          <Stack direction="row" spacing={0.5} sx={{ ...overlaySurface, borderRadius: 1.25, p: 0.5, alignItems: "center" }}>
            <TextField
              type="date"
              size="small"
              label={t("ws.imageryDate")}
              value={date}
              onChange={(e) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                  onDate(e.target.value);
                  setState("idle");
                }
              }}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: "2013-04-11", max: defaultImageryDate() } }}
              sx={{ width: 150 }}
            />
            <Button size="small" onClick={() => findNearest()} disabled={state === "busy"} sx={{ whiteSpace: "nowrap", minHeight: 40 }}>
              {state === "busy" ? "Searching…" : "Nearest earlier"}
            </Button>
          </Stack>
        )}
      </Stack>
      {basemap === "imagery" && state === "none" && (
        <Alert severity="info" onClose={() => setState("idle")} sx={{ maxWidth: 360 }}>
          No NASA HLS pass over the map centre in the 30 days up to {date}. Pick an earlier date; the satellite map shows wherever this date has no pass.
        </Alert>
      )}
      {basemap === "imagery" && state === "idle" && (
        <Typography variant="caption" sx={{ ...overlaySurface, px: 1, py: 0.25, borderRadius: 1 }}>
          NASA HLS 30 m · {date} · may include cloud; gaps show the satellite map
        </Typography>
      )}
    </Stack>
  );
}
