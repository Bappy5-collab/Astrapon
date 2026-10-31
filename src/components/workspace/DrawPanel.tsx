"use client";

import AddLocationAltOutlinedIcon from "@mui/icons-material/AddLocationAltOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { ZONE_BASES, ZONE_BASIS_LABELS } from "@/domain/farm/records";
import type { Position } from "@/domain/geo/boundary";
import * as D from "@/domain/geo/drawing";
import { useT } from "@/lib/i18n/I18nProvider";
import { numeric } from "@/theme/tokens";

import type { WorkspaceState } from "./useWorkspace";

const TITLES = { boundary: "Field boundary", zone: "New planting zone", zoneShape: "Zone shape" } as const;

/** Controls and validation for the map drawing session. Every pointer action has a button equivalent. */
export function DrawPanel({ ws, centre }: { ws: WorkspaceState; centre: () => Position | null }) {
  const t = useT();
  const [name, setName] = useState("");
  const [basis, setBasis] = useState<(typeof ZONE_BASES)[number]>("farmer_knowledge");
  const [notes, setNotes] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const draw = ws.draw;
  if (!draw) return null;
  const s = draw.state;
  const result = ws.drawResult;
  const complete = D.isComplete(s);
  const insideMsg = complete && result?.ok && draw.tool !== "boundary" ? ws.zoneInsideMessage(result.geometry) : null;
  const ready = complete && result?.ok && !insideMsg;
  const activeCount = s.active >= 0 ? (s.rings[s.active]?.length ?? 0) : 0;

  const confirm = () => {
    if (!result?.ok) return;
    if (draw.tool === "boundary") ws.applyBoundary(result.geometry, result.areaHa);
    else if (draw.tool === "zoneShape" && draw.zoneKey) ws.applyZoneShape(draw.zoneKey, result.geometry, result.areaHa);
    else {
      const n = name.trim();
      if (!n) return setNameError("Give the zone a name");
      if (ws.zones.some((z) => z.name.trim().toLowerCase() === n.toLowerCase())) return setNameError("Another zone already has this name");
      ws.addZone({ name: n, basis, notes: notes.trim(), boundary: result.geometry, areaHa: result.areaHa });
    }
  };

  return (
    <Box component="section" aria-label={TITLES[draw.tool]}>
      <Typography variant="h5" component="h2">
        {TITLES[draw.tool]}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        {s.active >= 0
          ? `Tap the map to place corners (${activeCount} so far). Close the shape by tapping the first point or “${t("ws.finish")}”. With a keyboard, move the map with the arrow keys and use “${t("ws.addPointCentre")}”.`
          : "Drag points to adjust. Tap a midpoint to add a corner. Select a point, then delete it."}
      </Typography>

      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", mt: 1.5 }}>
        {s.active >= 0 && (
          <Button size="small" variant="outlined" startIcon={<AddLocationAltOutlinedIcon />} onClick={() => { const c = centre(); if (c) ws.updateDraw((st) => D.addVertex(st, c)); }}>
            {t("ws.addPointCentre")}
          </Button>
        )}
        {s.active >= 0 && (
          <Button size="small" variant="outlined" startIcon={<DoneAllRoundedIcon />} disabled={!D.canClose(s)} onClick={() => ws.updateDraw(D.closeActive)}>
            {t("ws.finish")}
          </Button>
        )}
        <Button size="small" startIcon={<UndoRoundedIcon />} disabled={draw.history.length === 0} onClick={ws.undo}>
          {t("ws.undo")}
        </Button>
        <Button size="small" startIcon={<DeleteOutlineRoundedIcon />} disabled={!s.selected} onClick={() => ws.updateDraw(D.deleteSelected)}>
          {t("ws.deletePoint")}
        </Button>
        {draw.tool === "boundary" && complete && (
          <Button size="small" onClick={() => ws.updateDraw(D.startHole)}>
            Cut out an area
          </Button>
        )}
        {s.active > 0 && (
          <Button size="small" onClick={() => ws.updateDraw(D.cancelActive)}>
            Drop this cut-out
          </Button>
        )}
        <Button size="small" onClick={() => ws.updateDraw(() => D.emptyDraw())} disabled={s.rings[0]?.length === 0}>
          {t("ws.clear")}
        </Button>
      </Stack>

      <Box aria-live="polite" sx={{ mt: 2 }}>
        {complete && result && !result.ok && <Alert severity="error">{result.error}</Alert>}
        {insideMsg && <Alert severity="error">{insideMsg}</Alert>}
        {ready && result?.ok && (
          <Alert severity="success" icon={<CheckRoundedIcon />}>
            <Box component="span" sx={numeric}>
              {result.areaHa.toFixed(2)} ha
            </Box>{" "}
            · {result.vertexCount} corners{result.geometry.coordinates.length > 1 ? ` · ${result.geometry.coordinates.length - 1} cut-out area(s)` : ""}. Area is computed on the WGS84 ellipsoid.
            {result.notes.length > 0 && ` ${result.notes.join(" ")}`}
          </Alert>
        )}
      </Box>

      {ready && draw.tool === "zone" && (
        <Stack spacing={1.25} sx={{ mt: 2 }}>
          <TextField label="Zone name" size="small" value={name} onChange={(e) => setName(e.target.value.slice(0, 120))} error={Boolean(nameError)} helperText={nameError ?? undefined} required />
          <TextField select label="Why this zone differs" size="small" value={basis} onChange={(e) => setBasis(e.target.value as (typeof ZONE_BASES)[number])} helperText="Zones come from your knowledge or records, never from coarse satellite data.">
            {ZONE_BASES.map((b) => (
              <MenuItem key={b} value={b}>
                {ZONE_BASIS_LABELS[b]}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Notes (optional)" size="small" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 2000))} />
        </Stack>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button variant="contained" disabled={!ready} onClick={confirm}>
          {draw.tool === "boundary" ? "Use this boundary" : draw.tool === "zone" ? "Add zone" : "Use this shape"}
        </Button>
        <Button onClick={ws.cancelDraw}>{t("ws.cancel")}</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
        Nothing is stored until you press Save and confirm the summary.
      </Typography>
    </Box>
  );
}
