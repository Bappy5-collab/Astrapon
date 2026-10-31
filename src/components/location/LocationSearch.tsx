"use client";

import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useId, useRef, useState, type FormEvent } from "react";

import { formatLatLon, parseCoordinates } from "@/domain/geo/coordinates";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { tokens } from "@/theme/tokens";

export type PickedLocation = {
  lat: number;
  lon: number;
  label: string;
  bbox: [number, number, number, number] | null;
  source: "search" | "coordinates" | "device";
  accuracyM?: number;
};

type Place = { label: string; lat: number; lon: number; bbox: [number, number, number, number] | null; kind: string };

/**
 * Three ways to find a field: place search (submit-only, Nominatim via /api/geocode), typed
 * coordinates, and the device location, which is requested only when the user presses the button.
 */
export function LocationSearch({ onPick, compact = false }: { onPick: (loc: PickedLocation) => void; compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const [tab, setTab] = useState<"place" | "coords">("place");
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState("");
  const [coordsError, setCoordsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Place[] | null>(null);
  const [message, setMessage] = useState<{ severity: "info" | "warning" | "error"; text: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setMessage({ severity: "info", text: t("loc.placeholder") });
      return;
    }
    // A coordinate pair typed into the place box is handled locally (no network request).
    const asCoords = parseCoordinates(q);
    if (asCoords.ok) {
      onPick({ ...asCoords.value, label: formatLatLon(asCoords.value), bbox: null, source: "coordinates" });
      return;
    }
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setBusy(true);
    setMessage(null);
    setResults(null);
    try {
      const res = await fetch(`/api/geocode?${new URLSearchParams({ q, lang: locale })}`, { signal: ctrl.signal });
      const body = (await res.json()) as { ok: true; results: Place[] } | { ok: false; message: string };
      if (!body.ok) setMessage({ severity: res.status === 429 ? "warning" : "error", text: body.message });
      else if (body.results.length === 0) setMessage({ severity: "info", text: t("loc.noResults") });
      else setResults(body.results);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setMessage({ severity: "error", text: "Place search could not be reached. Check your connection, or enter coordinates." });
    } finally {
      setBusy(false);
    }
  }

  function goCoords(e: FormEvent) {
    e.preventDefault();
    const r = parseCoordinates(coords);
    if (!r.ok) {
      setCoordsError(r.error);
      return;
    }
    setCoordsError(null);
    onPick({ ...r.value, label: formatLatLon(r.value), bbox: null, source: "coordinates" });
  }

  function locate() {
    setMessage(null);
    if (!("geolocation" in navigator)) {
      setMessage({ severity: "warning", text: t("loc.unsupported") });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const v = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        onPick({ ...v, label: formatLatLon(v), bbox: null, source: "device", accuracyM: pos.coords.accuracy });
        setMessage({ severity: "info", text: `${formatLatLon(v)} · ${t("loc.accuracy")} ${Math.round(pos.coords.accuracy)} m` });
      },
      (err) => {
        setLocating(false);
        const text = err.code === err.PERMISSION_DENIED ? t("loc.denied") : err.code === err.TIMEOUT ? t("loc.timeout") : t("loc.unavailable");
        setMessage({ severity: "warning", text });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label={t("hero.find")} sx={{ minHeight: 40, mb: 1.5, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 } }}>
        <Tab value="place" label={t("loc.tabPlace")} id={`${id}-tab-place`} aria-controls={`${id}-panel-place`} />
        <Tab value="coords" label={t("loc.tabCoords")} id={`${id}-tab-coords`} aria-controls={`${id}-panel-coords`} />
      </Tabs>

      {tab === "place" ? (
        <Box component="form" onSubmit={search} role="search" id={`${id}-panel-place`} aria-labelledby={`${id}-tab-place`}>
          <Stack direction={compact ? "column" : { xs: "column", sm: "row" }} spacing={1}>
            <TextField
              label={t("loc.searchLabel")}
              placeholder={t("loc.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              fullWidth
              autoComplete="off"
              slotProps={{ htmlInput: { maxLength: 200, enterKeyHint: "search" } }}
            />
            <Button type="submit" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <SearchRoundedIcon />} sx={{ minWidth: 120, flexShrink: 0 }}>
              {busy ? t("loc.searching") : t("loc.search")}
            </Button>
          </Stack>
        </Box>
      ) : (
        <Box component="form" onSubmit={goCoords} id={`${id}-panel-coords`} aria-labelledby={`${id}-tab-coords`}>
          <Stack direction={compact ? "column" : { xs: "column", sm: "row" }} spacing={1}>
            <TextField
              label={t("loc.coordsLabel")}
              value={coords}
              onChange={(e) => setCoords(e.target.value)}
              error={Boolean(coordsError)}
              helperText={coordsError ?? t("loc.coordsHelp")}
              fullWidth
              autoComplete="off"
              slotProps={{ htmlInput: { inputMode: "text", spellCheck: false } }}
            />
            <Button type="submit" variant="contained" sx={{ minWidth: 120, flexShrink: 0, alignSelf: { sm: "flex-start" }, height: 56 }}>
              {t("loc.go")}
            </Button>
          </Stack>
        </Box>
      )}

      <Button onClick={locate} disabled={locating} startIcon={locating ? <CircularProgress size={16} /> : <MyLocationRoundedIcon />} sx={{ mt: 1.5, minHeight: 44 }}>
        {locating ? t("loc.locating") : t("loc.useMine")}
      </Button>

      <Box aria-live="polite">
        {message && (
          <Alert severity={message.severity} sx={{ mt: 1.5 }}>
            {message.text}
          </Alert>
        )}
        {results && (
          <List aria-label={t("loc.results")} dense sx={{ mt: 1, border: `1px solid ${tokens.neutral[300]}`, borderRadius: 1.25, bgcolor: tokens.neutral[0], py: 0.5, maxHeight: 280, overflowY: "auto" }}>
            {results.map((r) => (
              <ListItemButton
                key={`${r.lat},${r.lon},${r.label}`}
                onClick={() => {
                  onPick({ lat: r.lat, lon: r.lon, label: r.label, bbox: r.bbox, source: "search" });
                  setResults(null);
                }}
                sx={{ minHeight: 48 }}
              >
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <PlaceOutlinedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={r.label} secondary={r.kind} slotProps={{ primary: { sx: { fontSize: "0.9rem" } } }} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        {t("loc.attribution")}
      </Typography>
    </Box>
  );
}
