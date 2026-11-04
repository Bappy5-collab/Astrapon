"use client";

import AutoAwesomeMosaicOutlinedIcon from "@mui/icons-material/AutoAwesomeMosaicOutlined";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CropFreeRoundedIcon from "@mui/icons-material/CropFreeRounded";
import FormatListBulletedRoundedIcon from "@mui/icons-material/FormatListBulletedRounded";
import HighlightAltRoundedIcon from "@mui/icons-material/HighlightAltRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import NearMeOutlinedIcon from "@mui/icons-material/NearMeOutlined";
import PentagonOutlinedIcon from "@mui/icons-material/PentagonOutlined";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import NextLink from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { FieldViewport } from "@/components/field3d/FieldViewport";
import { FIELD_KEY } from "@/components/field3d/model";
import { LocationSearch, type PickedLocation } from "@/components/location/LocationSearch";
import { defaultImageryDate } from "@/components/map/basemaps";
import { FieldMap, type Basemap, type MapFocus, type MapShape } from "@/components/map/FieldMap";
import { ImageryControls } from "@/components/map/ImageryControls";
import { footprintOverlays } from "@/components/evidence/EvidenceDashboard";
import { formatLatLon } from "@/domain/geo/coordinates";
import * as D from "@/domain/geo/drawing";
import type { Position } from "@/domain/geo/boundary";
import { boundaryOrigin } from "@/domain/geo/local-frame";
import { useT } from "@/lib/i18n/I18nProvider";
import { color, elevation, numeric, tokens } from "@/theme/tokens";

import { DrawPanel } from "./DrawPanel";
import { InspectPanel } from "./InspectPanel";
import { SaveDialog } from "./SaveDialog";
import { SeasonTimeline } from "./SeasonTimeline";
import type { CoverageList, SaveHandler, WorkspaceEvidence, WorkspaceFieldData, WorkspaceMode } from "./types";
import { useWorkspace, type Tool } from "./useWorkspace";
import { CropAssign, NoBoundaryHint, PanelDivider, PanelSection, RegionList, ZoneEditor } from "./ZonePanel";

/** Media query state that is null on the server and during hydration, so both render the same placeholder. */
function useMedia(query: string): boolean | null {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}

const RAIL = 72;
const PANEL = 316;
const DRAWER = 340;

export type WorkspaceProps = {
  mode: WorkspaceMode;
  field: WorkspaceFieldData;
  coverage: CoverageList;
  currentYear: number;
  onSave: SaveHandler;
  /** Called after a successful save so the page can reload saved data. */
  onSaved?: () => void;
  extraActions?: ReactNode;
  evidence?: WorkspaceEvidence | null;
};

export function Workspace({ mode, field, coverage, currentYear, onSave, onSaved, extraActions, evidence }: WorkspaceProps) {
  const t = useT();
  const ws = useWorkspace(field, currentYear);
  const desktopQ = useMedia("(min-width:900px)");
  const wide = useMedia("(min-width:1536px)") ?? false;
  const desktop = desktopQ ?? false;
  const [panelOpen, setPanelOpen] = useState(true);
  const [drawerPref, setDrawerPref] = useState<boolean | null>(null);
  const drawerOpen = drawerPref ?? wide;
  const [sheet, setSheet] = useState<null | "crops" | "inspect">(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // After a successful save the page reloads saved data and remounts; until then edits are not "unsaved".
  const [justSaved, setJustSaved] = useState(false);
  const unsaved = ws.dirty && !justSaved;
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [located, setLocated] = useState<{ lat: number; lon: number; accuracyM: number } | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [showFootprints, setShowFootprints] = useState(false);
  const overlays = useMemo(() => (showFootprints && evidence ? footprintOverlays(evidence.data.sources, evidence.data.view.pixels) : []), [showFootprints, evidence]);
  const [imageryDate, setImageryDate] = useState(() => defaultImageryDate());
  const centre = useRef<Position | null>(null);
  const origin = useMemo(() => (ws.boundary ? boundaryOrigin(ws.boundary) : null), [ws.boundary]);
  const fitKey = useMemo(() => (field.boundary ? `fit-${field.id ?? "sample"}` : undefined), [field.boundary, field.id]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!unsaved) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unsaved]);

  const onPick = useCallback((loc: PickedLocation) => {
    setFocus({ lat: loc.lat, lon: loc.lon, bbox: loc.bbox, zoom: loc.source === "search" && loc.bbox ? 15 : 16, nonce: Date.now() });
    setLocated(loc.source === "device" ? { lat: loc.lat, lon: loc.lon, accuracyM: loc.accuracyM ?? 50 } : null);
    ws.setView("map");
  }, [ws]);

  const shapes = useMemo<MapShape[]>(() => {
    const list: MapShape[] = [];
    if (ws.boundary && ws.draw?.tool !== "boundary") list.push({ key: FIELD_KEY, geometry: ws.boundary, kind: "field", selected: ws.selectedKey === FIELD_KEY, label: field.name });
    for (const z of ws.zones) if (!(ws.draw?.tool === "zoneShape" && ws.draw.zoneKey === z.key)) list.push({ key: z.key, geometry: z.boundary, kind: "zone", selected: ws.selectedKey === z.key, label: z.name });
    return list;
  }, [ws.boundary, ws.zones, ws.selectedKey, ws.draw, field.name]);

  const setTool = (tool: Tool) => {
    if (tool === "select") ws.cancelDraw();
    else if (tool === "zone") ws.startDraw("zone");
    else if (tool === "boundary") ws.startDraw("boundary");
    if (!desktop && tool !== "select") setSheet(null);
  };
  const tool: Tool = ws.draw ? (ws.draw.tool === "zoneShape" ? "zone" : ws.draw.tool) : "select";

  const blockers = ws.zonesOutside.map((z) => `Zone “${z.name}” is outside the new boundary. Edit its shape or delete it before saving.`);
  const emptyNames = ws.zones.filter((z) => !z.name.trim()).map(() => "Every zone needs a name.");

  async function confirmSave() {
    setSaving(true);
    setSaveError(null);
    const r = await onSave(ws.edits);
    setSaving(false);
    if (!r.ok) {
      setSaveError(r.message);
      return;
    }
    setJustSaved(true);
    setSaveOpen(false);
    setToast(r.message);
    onSaved?.();
  }

  // ------------------------------------------------------------- pieces ---

  const topBar = (
    <Box
      component="header"
      sx={{ gridArea: "top", display: "flex", alignItems: "center", gap: { xs: 1, md: 2 }, px: { xs: 1.5, md: 2 }, minHeight: 56, borderBottom: `1px solid ${color.line}`, bgcolor: color.surfaceRaised, minWidth: 0 }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          <Typography component="h1" variant="h6" noWrap sx={{ fontSize: { xs: "1rem", md: "1.05rem" } }}>
            {field.name}
          </Typography>
          {mode === "sample" && <Chip size="small" label={t("ws.sampleBadge")} sx={{ bgcolor: tokens.lime[400], color: tokens.forest[950], flexShrink: 0, display: { xs: "none", sm: "inline-flex" } }} />}
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap component="p" sx={{ ...numeric }}>
          {field.farmHref ? (
            <Box component={NextLink} href={field.farmHref} sx={{ color: "inherit" }}>
              {field.farmName}
            </Box>
          ) : (
            field.farmName
          )}
          {" · "}
          {field.placeLabel ?? (origin ? formatLatLon({ lat: origin[1], lon: origin[0] }, 4) : "Location not set")}
        </Typography>
      </Box>
      {mode !== "sample" && field.id ? (
        <Button component={NextLink} href={`/fields/${field.id}/records`} variant="outlined" size="small" endIcon={<ArrowForwardRoundedIcon />} sx={{ flexShrink: 0, display: { xs: "none", sm: "inline-flex" } }}>
          {t("ws.steps")}
        </Button>
      ) : (
        <Chip
          size="small"
          variant="outlined"
          label={`${t("ws.runState")}: ${t("ws.runUnavailable")}`}
          sx={{ display: { xs: "none", md: "inline-flex" }, borderColor: color.lineStrong, color: color.inkMuted }}
        />
      )}
      {extraActions}
      {!desktop && (
        <IconButton aria-label={t("ws.inspect")} onClick={() => setSheet("inspect")}>
          <InfoOutlinedIcon />
        </IconButton>
      )}
      {desktop && !wide && (
        <Button size="small" startIcon={<InfoOutlinedIcon />} onClick={() => setDrawerPref(!drawerOpen)} aria-pressed={drawerOpen}>
          {t("ws.inspect")}
        </Button>
      )}
      <Button
        variant="contained"
        startIcon={<SaveRoundedIcon />}
        disabled={!unsaved}
        onClick={() => {
          setSaveError(null);
          setSaveOpen(true);
        }}
        aria-label={unsaved ? `${t("ws.save")} (${ws.changes.length} ${t("ws.unsaved")})` : t("ws.saved")}
        sx={{ flexShrink: 0 }}
      >
        {unsaved ? (
          <>
            {t("ws.save")}
            <Box component="span" sx={{ ml: 0.75, px: 0.75, borderRadius: 1, bgcolor: tokens.lime[400], color: tokens.forest[950], fontSize: "0.75rem", ...numeric }}>
              {ws.changes.length}
            </Box>
          </>
        ) : (
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{t("ws.saved")}</Box>
        )}
      </Button>
    </Box>
  );

  const viewToggle = (
    <ToggleButtonGroup exclusive size="small" value={ws.view} onChange={(_, v) => v && ws.setView(v)} aria-label="View">
      <ToggleButton value="3d" disabled={!ws.sceneData} aria-label={t("ws.view3d")}>
        <ViewInArRoundedIcon fontSize="small" />
        <Box component="span" sx={{ ml: 0.75 }}>{t("ws.view3d")}</Box>
      </ToggleButton>
      <ToggleButton value="map" aria-label={t("ws.viewMap")}>
        <MapOutlinedIcon fontSize="small" />
        <Box component="span" sx={{ ml: 0.75 }}>{t("ws.viewMap")}</Box>
      </ToggleButton>
    </ToggleButtonGroup>
  );

  const toolButtons: { tool: Tool; label: string; icon: ReactNode; disabled?: boolean }[] = [
    { tool: "select", label: t("ws.toolSelect"), icon: <NearMeOutlinedIcon /> },
    { tool: "zone", label: t("ws.toolZone"), icon: <PentagonOutlinedIcon />, disabled: !ws.boundary },
    { tool: "boundary", label: t("ws.toolBoundary"), icon: <CropFreeRoundedIcon /> },
  ];

  const rail = (
    <Box component="nav" aria-label={t("ws.tools")} sx={{ gridArea: "rail", borderRight: `1px solid ${color.line}`, bgcolor: color.surfaceRaised, display: "flex", flexDirection: "column", alignItems: "center", py: 1.5, gap: 0.5, overflowY: "auto" }}>
      <RailButton label={t("ws.view3d")} icon={<ViewInArRoundedIcon />} active={ws.view === "3d"} disabled={!ws.sceneData} onClick={() => ws.setView("3d")} />
      <RailButton label={t("ws.viewMap")} icon={<MapOutlinedIcon />} active={ws.view === "map"} onClick={() => ws.setView("map")} />
      <Divider flexItem sx={{ my: 1, mx: 1.5 }} />
      {toolButtons.map((b) => (
        <RailButton key={b.tool} label={b.label} icon={b.icon} active={tool === b.tool} disabled={b.disabled} onClick={() => setTool(b.tool)} />
      ))}
      <Divider flexItem sx={{ my: 1, mx: 1.5 }} />
      {field.id && <RailLink href={`/fields/${field.id}/records`} label={t("ws.records")} icon={<FormatListBulletedRoundedIcon />} />}
      <RailLink href="/runs" label={t("nav.runs")} icon={<AutoAwesomeMosaicOutlinedIcon />} />
      <RailLink href="/settings" label={t("nav.settings")} icon={<SettingsOutlinedIcon />} />
      <Box sx={{ flex: 1 }} />
      <Tooltip title={panelOpen ? t("ws.collapse") : t("ws.expand")} placement="right">
        <IconButton aria-label={panelOpen ? t("ws.collapse") : t("ws.expand")} aria-expanded={panelOpen} aria-controls="ws-panel" onClick={() => setPanelOpen(!panelOpen)}>
          {panelOpen ? <ChevronLeftRoundedIcon /> : <ChevronRightRoundedIcon />}
        </IconButton>
      </Tooltip>
    </Box>
  );

  const cropsContent = ws.draw ? (
    <Stack spacing={2.5}>
      {ws.draw.tool === "boundary" && (
        <PanelSection title={t("hero.find")}>
          <LocationSearch onPick={onPick} compact />
        </PanelSection>
      )}
      <DrawPanel ws={ws} centre={() => centre.current} />
    </Stack>
  ) : !ws.boundary ? (
    <Stack spacing={2}>
      <NoBoundaryHint />
      <Button variant="contained" onClick={() => setTool("boundary")}>
        {t("ws.toolBoundary")}
      </Button>
    </Stack>
  ) : (
    <Box>
      <PanelSection
        title={t("ws.zones")}
        action={
          <Button size="small" startIcon={<HighlightAltRoundedIcon />} onClick={() => setTool("zone")}>
            {t("ws.addZone")}
          </Button>
        }
      >
        <RegionList ws={ws} areaHa={ws.sceneData ? (ws.sceneData.areaUnits * ws.sceneData.metresPerUnit ** 2) / 10000 : field.areaHa} />
        {ws.zones.length === 0 && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            One unit until you add zones. Add a zone only where you know part of the field behaves differently.
          </Typography>
        )}
        {ws.selectedKey && ws.selectedKey !== FIELD_KEY && (
          <Box sx={{ mt: 1.5 }}>
            <ZoneEditor ws={ws} />
          </Box>
        )}
      </PanelSection>
      <PanelDivider />
      <CropAssign ws={ws} key={`${ws.selectedKey}`} />
      {mode === "sample" && (
        <>
          <PanelDivider />
          <Alert severity="info">{t("ws.sampleSaveNote")}</Alert>
        </>
      )}
    </Box>
  );

  const mapView = (
    <Box sx={{ position: "relative", height: "100%" }}>
      <FieldMap
        label={`${t("ws.viewMap")}: ${field.name}`}
        shapes={shapes}
        draw={ws.draw?.state ?? null}
        crosshair={Boolean(ws.draw && ws.draw.state.active >= 0)}
        onAddVertex={ws.draw && ws.draw.state.active >= 0 ? (p) => ws.updateDraw((s) => D.addVertex(s, p)) : undefined}
        onMoveVertex={(r, i, p) => ws.updateDraw((s) => D.moveVertex(s, r, i, p))}
        onInsertVertex={(r, i, p) => ws.updateDraw((s) => D.insertVertex(s, r, i, p))}
        onSelectVertex={(r, i) => ws.updateDraw((s) => ({ ...s, selected: { ring: r, index: i } }))}
        onCloseRing={() => ws.updateDraw(D.closeActive)}
        onSelectShape={(key) => ws.setSelectedKey(key)}
        onCenter={(p) => (centre.current = p)}
        focus={focus}
        fitKey={fitKey}
        basemap={basemap}
        imageryDate={imageryDate}
        located={located}
        overlays={overlays}
      />
      <Box sx={{ position: "absolute", top: 12, right: 12, zIndex: 600, maxWidth: "calc(100% - 72px)" }}>
        <ImageryControls basemap={basemap} onBasemap={setBasemap} date={imageryDate} onDate={setImageryDate} point={() => centre.current ?? origin} />
        {evidence && (
          <Box sx={{ mt: 1, display: "flex", justifyContent: "flex-end" }}>
            <Button
              size="small"
              variant={showFootprints ? "contained" : "outlined"}
              aria-pressed={showFootprints}
              onClick={() => setShowFootprints(!showFootprints)}
              sx={{ bgcolor: showFootprints ? undefined : "rgba(250,251,247,.94)", minHeight: 40 }}
            >
              Data footprints
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );

  const viewport =
    ws.view === "3d" && ws.sceneData ? (
      <FieldViewport
        data={ws.sceneData}
        crops={ws.sceneCrops}
        stage={ws.stage}
        selectedKey={ws.selectedKey}
        onSelect={(k) => ws.setSelectedKey(k)}
        selectedLabel={ws.selectedKey === FIELD_KEY ? t("ws.wholeField") : ws.selectedKey ? ws.zoneName(ws.selectedKey) : null}
        badge={
          mode === "sample" ? (
            <Typography variant="caption" sx={{ px: 1.25, py: 0.5, borderRadius: 1, bgcolor: tokens.lime[400], color: tokens.forest[950], fontWeight: 700 }}>
              {t("ws.sampleBadge")}
            </Typography>
          ) : undefined
        }
      />
    ) : (
      mapView
    );

  const inspect = <InspectPanel ws={ws} field={field} coverage={coverage} evidence={evidence} />;

  const dialogs = (
    <>
      <SaveDialog
        open={saveOpen}
        changes={ws.changes}
        blockers={[...blockers, ...new Set(emptyNames)]}
        saving={saving}
        error={saveError}
        sample={mode === "sample"}
        onCancel={() => setSaveOpen(false)}
        onConfirm={confirmSave}
      />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </>
  );

  if (desktopQ === null)
    return (
      <Box role="status" sx={{ height: { xs: "70dvh", md: "calc(100dvh - 68px)" }, display: "grid", placeItems: "center", bgcolor: color.surface }}>
        <Stack spacing={1.5} sx={{ alignItems: "center" }}>
          <CircularProgress size={28} />
          <Typography variant="body2">Opening {field.name}…</Typography>
        </Stack>
      </Box>
    );

  // -------------------------------------------------------------- mobile ---

  if (!desktop) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", bgcolor: color.surface }}>
        {topBar}
        <Box sx={{ height: ws.draw ? "50dvh" : "56dvh", minHeight: 300, position: "relative" }}>{viewport}</Box>
        {ws.draw ? (
          <Box sx={{ p: 2, bgcolor: color.surfaceRaised, borderTop: `1px solid ${color.line}` }}>
            {ws.draw.tool === "boundary" && (
              <Box sx={{ mb: 2 }}>
                <LocationSearch onPick={onPick} compact />
              </Box>
            )}
            <DrawPanel ws={ws} centre={() => centre.current} />
          </Box>
        ) : (
          <>
            <Stack direction="row" spacing={1} useFlexGap sx={{ p: 1.5, flexWrap: "wrap", alignItems: "center", bgcolor: color.surfaceRaised, borderBottom: `1px solid ${color.line}` }} role="toolbar" aria-label={t("ws.tools")}>
              {viewToggle}
              <ToggleButtonGroup exclusive size="small" value={tool} onChange={(_, v: Tool | null) => v && setTool(v)} aria-label={t("ws.tools")}>
                {toolButtons.map((b) => (
                  <ToggleButton key={b.tool} value={b.tool} disabled={b.disabled} aria-label={b.label} sx={{ minWidth: 44, minHeight: 40 }}>
                    {b.icon}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Button variant="outlined" size="small" onClick={() => setSheet("crops")} sx={{ minHeight: 40 }}>
                {t("ws.panel")}
              </Button>
            </Stack>
            {ws.sceneData && <SeasonTimeline ws={ws} />}
            {!ws.boundary && <Box sx={{ p: 2 }}>{cropsContent}</Box>}
            {field.id && (
              <Box sx={{ px: 2, pb: 3 }}>
                <Button component={NextLink} href={`/fields/${field.id}/records`} startIcon={<FormatListBulletedRoundedIcon />}>
                  {t("ws.records")}
                </Button>
              </Box>
            )}
          </>
        )}
        <Drawer
          anchor="bottom"
          open={sheet !== null}
          onClose={() => setSheet(null)}
          slotProps={{ paper: { sx: { maxHeight: "78dvh", borderTopLeftRadius: 16, borderTopRightRadius: 16 }, "aria-label": t("ws.sheet") } as object }}
        >
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: tokens.neutral[300], mx: "auto", mt: 1 }} aria-hidden="true" />
          <Tabs value={sheet ?? "crops"} onChange={(_, v) => setSheet(v)} variant="fullWidth" sx={{ px: 1 }}>
            <Tab value="crops" label={t("ws.panel")} />
            <Tab value="inspect" label={`${t("ws.inspect")} · ${t("ws.evidence")}`} />
          </Tabs>
          <Box sx={{ p: 2, pb: 4, overflowY: "auto" }}>{sheet === "inspect" ? inspect : cropsContent}</Box>
          <Box sx={{ position: "sticky", bottom: 0, p: 1.5, bgcolor: color.surfaceRaised, borderTop: `1px solid ${color.line}` }}>
            <Button fullWidth variant="outlined" onClick={() => setSheet(null)}>
              Done
            </Button>
          </Box>
        </Drawer>
        {dialogs}
      </Box>
    );
  }

  // ------------------------------------------------------------- desktop ---

  return (
    <Box
      sx={{
        height: "calc(100dvh - 68px)",
        minHeight: 560,
        display: "grid",
        gridTemplateColumns: `${RAIL}px ${panelOpen ? `${PANEL}px` : "0px"} minmax(0, 1fr) ${drawerOpen ? `${DRAWER}px` : "0px"}`,
        gridTemplateRows: "auto minmax(0, 1fr)",
        gridTemplateAreas: `"top top top top" "rail panel main drawer"`,
        bgcolor: color.surface,
      }}
    >
      {topBar}
      {rail}
      <Box
        id="ws-panel"
        component="aside"
        aria-label={t("ws.panel")}
        hidden={!panelOpen}
        sx={{ gridArea: "panel", overflowY: "auto", borderRight: panelOpen ? `1px solid ${color.line}` : 0, bgcolor: color.surface, p: panelOpen ? 2.5 : 0 }}
      >
        {panelOpen && cropsContent}
      </Box>
      <Box component="section" aria-label={ws.view === "3d" ? t("ws.view3d") : t("ws.viewMap")} sx={{ gridArea: "main", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <Box sx={{ flex: 1, minHeight: 280, position: "relative", m: 1.5, mb: 0, borderRadius: 2, overflow: "hidden", border: `1px solid ${color.line}`, boxShadow: elevation.raised }}>{viewport}</Box>
        {ws.sceneData && (
          <Box sx={{ flexShrink: 0, maxHeight: "36%", overflowY: "auto" }}>
            <SeasonTimeline ws={ws} />
          </Box>
        )}
      </Box>
      <Box component="aside" aria-label={`${t("ws.inspect")} · ${t("ws.evidence")}`} hidden={!drawerOpen} sx={{ gridArea: "drawer", overflowY: "auto", borderLeft: drawerOpen ? `1px solid ${color.line}` : 0, bgcolor: color.surfaceRaised, p: drawerOpen ? 2.5 : 0 }}>
        {drawerOpen && inspect}
      </Box>
      {dialogs}
    </Box>
  );
}

function RailButton({ label, icon, active, disabled, onClick }: { label: string; icon: ReactNode; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      sx={{
        all: "unset",
        boxSizing: "border-box",
        width: 60,
        minHeight: 56,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.25,
        borderRadius: 1.5,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        color: active ? tokens.forest[950] : color.inkMuted,
        bgcolor: active ? tokens.lime[400] : "transparent",
        "&:hover": disabled ? undefined : { bgcolor: active ? tokens.lime[300] : tokens.neutral[150] },
        "&:focus-visible": { outline: `3px solid ${color.focus}`, outlineOffset: 1 },
        "& svg": { fontSize: 22 },
      }}
    >
      {icon}
      <Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.15, textAlign: "center", px: 0.25 }}>
        {label}
      </Box>
    </Box>
  );
}

function RailLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <Box
      component={NextLink}
      href={href}
      sx={{
        width: 60,
        minHeight: 56,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.25,
        borderRadius: 1.5,
        color: color.inkMuted,
        textDecoration: "none",
        "&:hover": { bgcolor: tokens.neutral[150] },
        "&:focus-visible": { outline: `3px solid ${color.focus}`, outlineOffset: 1 },
        "& svg": { fontSize: 22 },
      }}
    >
      {icon}
      <Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.15, textAlign: "center" }}>
        {label}
      </Box>
    </Box>
  );
}
