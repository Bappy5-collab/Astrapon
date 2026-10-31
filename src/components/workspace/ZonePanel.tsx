"use client";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { COMMON_CROPS, CROP_FORM_COLORS, cropForm } from "@/domain/farm/crops";
import { SEASONS, ZONE_BASES, ZONE_BASIS_LABELS } from "@/domain/farm/records";
import type { Season } from "@/domain/workspace/workspace";
import { FIELD_KEY } from "@/components/field3d/model";
import { useT } from "@/lib/i18n/I18nProvider";
import { color, numeric, radius, tokens } from "@/theme/tokens";

import type { WorkspaceState } from "./useWorkspace";

const humanise = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function RegionList({ ws, areaHa }: { ws: WorkspaceState; areaHa: number | null }) {
  const t = useT();
  const regions = [{ key: FIELD_KEY, name: t("ws.wholeField"), areaHa, saved: true }, ...ws.zones.map((z) => ({ key: z.key, name: z.name, areaHa: z.areaHa, saved: z.saved }))];
  const selected = ws.selectedKey ?? FIELD_KEY;
  return (
    <Box role="radiogroup" aria-label={t("ws.selectZone")} sx={{ display: "grid", gap: 0.75 }}>
      {regions.map((r) => {
        const crop = ws.cropFor(r.key === FIELD_KEY ? null : r.key, ws.year);
        const on = selected === r.key;
        const swatch = crop ? CROP_FORM_COLORS[cropForm(crop.cropName)].plant : tokens.neutral[300];
        return (
          <Box
            key={r.key}
            component="button"
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => ws.setSelectedKey(r.key === FIELD_KEY ? FIELD_KEY : r.key)}
            sx={{
              all: "unset",
              boxSizing: "border-box",
              cursor: "pointer",
              display: "grid",
              gridTemplateColumns: "12px 1fr auto",
              alignItems: "center",
              gap: 1.25,
              minHeight: 52,
              px: 1.5,
              py: 1,
              borderRadius: `${radius.md}px`,
              border: `1.5px solid ${on ? tokens.forest[600] : color.line}`,
              bgcolor: on ? tokens.lime[200] : color.surfaceRaised,
              "&:hover": { borderColor: tokens.forest[500] },
              "&:focus-visible": { outline: `3px solid ${color.focus}`, outlineOffset: 2 },
            }}
          >
            <Box sx={{ width: 12, height: 12, borderRadius: "3px", bgcolor: swatch, border: `1px solid rgba(0,0,0,.15)` }} aria-hidden="true" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap component="span" sx={{ display: "block" }}>
                {r.name}
                {!r.saved && <Chip label={t("ws.pending")} size="small" sx={{ ml: 1, height: 20, fontSize: "0.7rem", bgcolor: tokens.lime[300], color: tokens.forest[950] }} />}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }} noWrap>
                {crop ? `${ws.year}: ${crop.cropName}${crop.scope === "field" && r.key !== FIELD_KEY ? " (whole field)" : ""}` : `${ws.year}: ${t("ws.noCrop")}`}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ ...numeric, color: color.inkMuted }}>
              {r.areaHa !== null ? `${r.areaHa.toFixed(2)} ha` : "—"}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export function ZoneEditor({ ws }: { ws: WorkspaceState }) {
  const t = useT();
  const zone = ws.zones.find((z) => z.key === ws.selectedKey);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (!zone) return null;
  return (
    <Box sx={{ p: 1.5, borderRadius: `${radius.md}px`, bgcolor: color.surfaceSunken }}>
      <Stack spacing={1.5}>
        <TextField label="Zone name" size="small" value={zone.name} onChange={(e) => ws.editZone(zone.key, { name: e.target.value.slice(0, 120) })} error={!zone.name.trim()} helperText={!zone.name.trim() ? "Required" : undefined} />
        <TextField select label="Why this zone differs" size="small" value={zone.basis} onChange={(e) => ws.editZone(zone.key, { basis: e.target.value as (typeof ZONE_BASES)[number] })}>
          {ZONE_BASES.map((b) => (
            <MenuItem key={b} value={b}>
              {ZONE_BASIS_LABELS[b]}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Notes" size="small" multiline minRows={2} value={zone.notes} onChange={(e) => ws.editZone(zone.key, { notes: e.target.value.slice(0, 2000) })} />
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => ws.startDraw("zoneShape", zone.key)}>
            Edit shape
          </Button>
          {confirmDelete === zone.key ? (
            <>
              <Button size="small" color="error" variant="contained" onClick={() => ws.deleteZone(zone.key)}>
                Delete “{zone.name}”{zone.saved ? " on save" : ""}
              </Button>
              <Button size="small" onClick={() => setConfirmDelete(null)}>
                {t("ws.cancel")}
              </Button>
            </>
          ) : (
            <Button size="small" color="error" onClick={() => setConfirmDelete(zone.key)}>
              Delete zone
            </Button>
          )}
        </Stack>
        {zone.saved && confirmDelete === zone.key && (
          <Typography variant="caption" sx={{ color: color.danger }}>
            Saving will also delete crop history and soil records made for this zone.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

export function CropAssign({ ws }: { ws: WorkspaceState }) {
  const t = useT();
  const key = ws.selectedKey && ws.selectedKey !== FIELD_KEY ? ws.selectedKey : null;
  const current = ws.cropFor(key, ws.year);
  const [crop, setCrop] = useState("");
  const [season, setSeason] = useState<Season>("main");
  const [error, setError] = useState<string | null>(null);
  const regionName = key ? ws.zoneName(key) : t("ws.wholeField");
  const pendingHere = ws.crops.filter((c) => c.seasonYear === ws.year);

  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        const name = crop.trim();
        if (!name) return setError("Type or pick a crop");
        if (name.length > 80) return setError("At most 80 characters");
        setError(null);
        ws.assignCrop({ zoneKey: key, seasonYear: ws.year, season, cropName: name });
        setCrop("");
      }}
    >
      <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
        {t("ws.assignCrop")}: {regionName}, {ws.year}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
        {current ? `Recorded: ${current.cropName} (${humanise(current.season)}${current.scope === "field" && key ? ", whole-field record" : ""})${current.pending ? " · not saved yet" : ""}` : "Nothing recorded for this year."} Saved as a farmer report.
      </Typography>
      <Stack spacing={1.25}>
        <Autocomplete
          freeSolo
          options={[...COMMON_CROPS]}
          inputValue={crop}
          onInputChange={(_, v) => setCrop(v)}
          renderInput={(params) => <TextField {...params} label={t("ws.crop")} size="small" error={Boolean(error)} helperText={error ?? "Any name, e.g. maize, boro rice, ধান"} />}
        />
        <Stack direction="row" spacing={1}>
          <TextField select size="small" label={t("ws.season")} value={season} onChange={(e) => setSeason(e.target.value as Season)} sx={{ flex: 1 }}>
            {SEASONS.map((s) => (
              <MenuItem key={s} value={s}>
                {humanise(s)}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label={t("ws.year")} value={ws.year} onChange={(e) => ws.setYear(Number(e.target.value))} sx={{ width: 110 }}>
            {ws.years.map((y) => (
              <MenuItem key={y} value={y}>
                {y}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Button type="submit" variant="contained" startIcon={<AddRoundedIcon />}>
          {t("ws.assignCrop")}
        </Button>
      </Stack>
      {pendingHere.length > 0 && (
        <Box component="ul" aria-label="Crop assignments not saved yet" sx={{ listStyle: "none", p: 0, m: 0, mt: 1.5, display: "grid", gap: 0.5 }}>
          {pendingHere.map((a) => (
            <Box component="li" key={`${a.zoneKey}-${a.seasonYear}-${a.season}`} sx={{ display: "flex", alignItems: "center", gap: 1, pl: 1.25, borderRadius: 1, bgcolor: tokens.lime[200] }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {ws.zoneName(a.zoneKey)} · {humanise(a.season)}: <strong>{a.cropName}</strong>
              </Typography>
              <IconButton size="small" aria-label={`Remove unsaved assignment ${a.cropName} for ${ws.zoneName(a.zoneKey)}`} onClick={() => ws.removeAssignment(a)}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function PanelSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Box component="section" aria-label={title}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="overline" component="h2" sx={{ color: color.leaf }}>
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Box>
  );
}

export function PanelDivider() {
  return <Divider sx={{ my: 2.5 }} />;
}

export function NoBoundaryHint() {
  return <Alert severity="info">Draw the field boundary on the map to start. Zones and crops come after.</Alert>;
}
