"use client";

import AddLocationAltOutlinedIcon from "@mui/icons-material/AddLocationAltOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";

import { PENDING_LOCATION_KEY } from "@/components/location/HeroSearch";
import { LocationSearch, type PickedLocation } from "@/components/location/LocationSearch";
import { defaultImageryDate } from "@/components/map/basemaps";
import { FieldMap, type Basemap, type MapFocus } from "@/components/map/FieldMap";
import { ImageryControls } from "@/components/map/ImageryControls";
import type { Position } from "@/domain/geo/boundary";
import { formatLatLon } from "@/domain/geo/coordinates";
import * as D from "@/domain/geo/drawing";
import { boundaryOrigin } from "@/domain/geo/local-frame";
import { useT } from "@/lib/i18n/I18nProvider";
import { color, numeric } from "@/theme/tokens";

type Farm = { id: string; name: string };

const noopSubscribe = () => () => {};
function readHanded(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_LOCATION_KEY);
  } catch {
    return null;
  }
}
function handedPlace(raw: string | null): PickedLocation | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { lat: unknown; lon: unknown; label: unknown };
    if (typeof v.lat !== "number" || typeof v.lon !== "number" || Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180) return null;
    return { lat: v.lat, lon: v.lon, label: typeof v.label === "string" ? v.label.slice(0, 200) : "", bbox: null, source: "search" };
  } catch {
    return null;
  }
}
type Result = { ok: boolean; message: string; fieldId?: string };

export function NewFieldFlow({
  farms,
  create,
}: {
  farms: Farm[];
  create: (input: { boundary: unknown; farmId: string; newFarmName: string; countryCode: string; fieldName: string; placeLabel: string }) => Promise<Result>;
}) {
  const t = useT();
  const router = useRouter();
  // A place picked on the landing page arrives via sessionStorage (see HeroSearch).
  const handed = useSyncExternalStore(noopSubscribe, readHanded, () => null);
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [userFocus, setFocus] = useState<MapFocus | null>(null);
  const place = picked ?? handedPlace(handed);
  const focus = userFocus ?? (place ? { lat: place.lat, lon: place.lon, zoom: 16, nonce: 1 } : null);
  const [located, setLocated] = useState<{ lat: number; lon: number; accuracyM: number } | null>(null);
  const [draw, setDraw] = useState<D.DrawState>(D.emptyDraw());
  const [history, setHistory] = useState<D.DrawState[]>([]);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [imageryDate, setImageryDate] = useState(() => defaultImageryDate());
  const centre = useRef<Position | null>(null);
  const [farmId, setFarmId] = useState(farms[0]?.id ?? "new");
  const [newFarmName, setNewFarmName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = D.validateDrawing(draw);
  const complete = D.isComplete(draw);
  const step = !place && !focus ? 0 : !complete || !result?.ok || !confirmed ? 1 : 2;
  const update = (fn: (s: D.DrawState) => D.DrawState) => {
    setDraw((s) => {
      const n = fn(s);
      if (n !== s) setHistory((h) => [...h.slice(-49), s]);
      return n;
    });
    setConfirmed(false);
  };

  const onPick = (loc: PickedLocation) => {
    setPicked(loc);
    setFocus({ lat: loc.lat, lon: loc.lon, bbox: loc.bbox, zoom: 16, nonce: Date.now() });
    setLocated(loc.source === "device" ? { lat: loc.lat, lon: loc.lon, accuracyM: loc.accuracyM ?? 50 } : null);
  };

  async function submit() {
    if (!result?.ok) return;
    setBusy(true);
    setError(null);
    const r = await create({ boundary: result.geometry, farmId, newFarmName, countryCode, fieldName, placeLabel: place?.label ?? "" });
    if (r.ok && r.fieldId) {
      try {
        window.sessionStorage.removeItem(PENDING_LOCATION_KEY);
      } catch {
        // ignore
      }
      router.push(`/fields/${r.fieldId}`);
    }
    else {
      setBusy(false);
      setError(r.message);
    }
  }

  const activeCount = draw.active >= 0 ? (draw.rings[draw.active]?.length ?? 0) : 0;

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "420px minmax(0, 1fr)" }, gridTemplateRows: { xs: "auto auto", md: "minmax(0, 1fr)" }, height: { md: "calc(100dvh - 68px)" }, bgcolor: color.surface }}>
      <Box sx={{ order: { xs: 2, md: 1 }, overflowY: "auto", p: { xs: 2, md: 3 }, borderRight: { md: `1px solid ${color.line}` } }}>
        <Typography variant="overline" sx={{ color: color.leaf }}>
          New field
        </Typography>
        <Typography variant="h3" component="h1" sx={{ mb: 2 }}>
          {t("hero.create")}
        </Typography>
        <Stepper activeStep={step} orientation="horizontal" alternativeLabel sx={{ mb: 3 }}>
          {["Locate", "Draw boundary", "Confirm and save"].map((l) => (
            <Step key={l}>
              <StepLabel>{l}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Typography variant="h5" component="h2" sx={{ mb: 1 }}>
          1. {t("hero.find")}
        </Typography>
        <LocationSearch onPick={onPick} compact />
        {place && (
          <Typography variant="body2" sx={{ mt: 1, ...numeric }}>
            Showing {place.label}. Zoom in until you can see the field edges.
          </Typography>
        )}

        <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1 }}>
          2. Draw the boundary
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {draw.active >= 0
            ? `Tap each corner of the field on the map (${activeCount} placed), then tap the first point or “${t("ws.finish")}”. Keyboard: arrow keys move the map; “${t("ws.addPointCentre")}” adds the point under the cross.`
            : "Drag points to adjust; tap a midpoint to add a corner; select a point to delete it."}
        </Typography>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", mt: 1.5 }}>
          {draw.active >= 0 && (
            <Button size="small" variant="outlined" startIcon={<AddLocationAltOutlinedIcon />} onClick={() => centre.current && update((s) => D.addVertex(s, centre.current!))}>
              {t("ws.addPointCentre")}
            </Button>
          )}
          {draw.active >= 0 && (
            <Button size="small" variant="outlined" startIcon={<DoneAllRoundedIcon />} disabled={!D.canClose(draw)} onClick={() => update(D.closeActive)}>
              {t("ws.finish")}
            </Button>
          )}
          <Button
            size="small"
            startIcon={<UndoRoundedIcon />}
            disabled={!history.length}
            onClick={() => {
              setDraw(history[history.length - 1]!);
              setHistory((h) => h.slice(0, -1));
              setConfirmed(false);
            }}
          >
            {t("ws.undo")}
          </Button>
          <Button size="small" startIcon={<DeleteOutlineRoundedIcon />} disabled={!draw.selected} onClick={() => update(D.deleteSelected)}>
            {t("ws.deletePoint")}
          </Button>
          {complete && (
            <Button size="small" onClick={() => update(D.startHole)}>
              Cut out an area
            </Button>
          )}
          <Button size="small" disabled={(draw.rings[0]?.length ?? 0) === 0} onClick={() => update(() => D.emptyDraw())}>
            {t("ws.clear")}
          </Button>
        </Stack>
        <Box aria-live="polite" sx={{ mt: 2 }}>
          {complete && result && !result.ok && <Alert severity="error">{result.error}</Alert>}
          {complete && result?.ok && (
            <Alert severity="success">
              <Box component="span" sx={numeric}>
                {result.areaHa.toFixed(2)} ha
              </Box>{" "}
              · {result.vertexCount} corners · centre {formatLatLon({ lat: boundaryOrigin(result.geometry)[1], lon: boundaryOrigin(result.geometry)[0] }, 4)}
            </Alert>
          )}
          {complete && result?.ok && (
            <Box component="label" sx={{ display: "flex", gap: 1, alignItems: "flex-start", mt: 1.5, cursor: "pointer" }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
              <Typography variant="body2">This outline matches my field. Its area and location are correct.</Typography>
            </Box>
          )}
        </Box>

        <Typography variant="h5" component="h2" sx={{ mt: 4, mb: 1.5 }}>
          3. Name and save
        </Typography>
        <Stack spacing={1.5}>
          <TextField label="Field name" required value={fieldName} onChange={(e) => setFieldName(e.target.value.slice(0, 120))} />
          <TextField select label="Farm" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
            {farms.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.name}
              </MenuItem>
            ))}
            <MenuItem value="new">New farm…</MenuItem>
          </TextField>
          {farmId === "new" && (
            <Stack direction="row" spacing={1}>
              <TextField label="New farm name" required value={newFarmName} onChange={(e) => setNewFarmName(e.target.value.slice(0, 120))} sx={{ flex: 1 }} />
              <TextField label="Country (ISO)" value={countryCode} onChange={(e) => setCountryCode(e.target.value.slice(0, 2).toUpperCase())} helperText="e.g. BD, US" sx={{ width: 120 }} />
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <Button variant="contained" size="large" disabled={step < 2 || !fieldName.trim() || busy || (farmId === "new" && !newFarmName.trim())} onClick={submit} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
            {busy ? "Saving…" : "Save field and open workspace"}
          </Button>
          <Typography variant="caption" color="text.secondary">
            The outline is stored privately in your account as a farmer-drawn boundary.
          </Typography>
        </Stack>
      </Box>

      <Box sx={{ order: { xs: 1, md: 2 }, position: "relative", height: { xs: "52dvh", md: "100%" }, minHeight: 320 }}>
        <FieldMap
          label="Map for drawing the field boundary"
          shapes={[]}
          draw={draw}
          crosshair={draw.active >= 0}
          onAddVertex={draw.active >= 0 ? (p) => update((s) => D.addVertex(s, p)) : undefined}
          onMoveVertex={(r, i, p) => update((s) => D.moveVertex(s, r, i, p))}
          onInsertVertex={(r, i, p) => update((s) => D.insertVertex(s, r, i, p))}
          onSelectVertex={(r, i) => setDraw((s) => ({ ...s, selected: { ring: r, index: i } }))}
          onCloseRing={() => update(D.closeActive)}
          onCenter={(p) => (centre.current = p)}
          focus={focus}
          basemap={basemap}
          imageryDate={imageryDate}
          located={located}
        />
        <Box sx={{ position: "absolute", top: 12, right: 12, zIndex: 600, maxWidth: "calc(100% - 72px)" }}>
          <ImageryControls basemap={basemap} onBasemap={setBasemap} date={imageryDate} onDate={setImageryDate} point={() => centre.current} />
        </Box>
      </Box>
    </Box>
  );
}
