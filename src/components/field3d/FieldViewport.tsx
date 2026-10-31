"use client";

import CenterFocusStrongRoundedIcon from "@mui/icons-material/CenterFocusStrongRounded";
import RotateLeftRoundedIcon from "@mui/icons-material/RotateLeftRounded";
import RotateRightRoundedIcon from "@mui/icons-material/RotateRightRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Select from "@mui/material/Select";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { SceneErrorBoundary } from "@/components/scene/SceneErrorBoundary";
import { SceneMessage } from "@/components/scene/SceneMessage";
import { detectGraphicsCapability, type GraphicsCapability } from "@/components/scene/webgl";
import { useT } from "@/lib/i18n/I18nProvider";
import { useQualityPreference, type QualityPreference } from "@/lib/preferences";
import { overlaySurface, tokens } from "@/theme/tokens";

import type { CameraCommand, QualityPreset } from "./FieldScene";
import type { RegionCrop, SceneData } from "./model";
import type { GrowthStage } from "./plants";

const FieldScene = dynamic(() => import("./FieldScene"), {
  ssr: false,
  loading: () => <SceneMessage title="Loading 3D field…" busy />,
});

let cachedCapability: GraphicsCapability | undefined;
const noop = () => () => {};
const getCapability = () => (cachedCapability ??= detectGraphicsCapability());

export type FieldViewportProps = {
  data: SceneData;
  crops: Record<string, RegionCrop>;
  stage: GrowthStage;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** Extra overlay content (top-left, under the label). */
  badge?: ReactNode;
  /** Name of the selected zone, shown as an overlay chip. */
  selectedLabel?: string | null;
};

export function resolveQuality(pref: QualityPreference, cap: GraphicsCapability | null): QualityPreset {
  if (pref !== "auto") return pref;
  return cap?.softwareRenderer ? "low" : "balanced";
}

export function FieldViewport({ data, crops, stage, selectedKey, onSelect, badge, selectedLabel }: FieldViewportProps) {
  const t = useT();
  const capability = useSyncExternalStore<GraphicsCapability | null>(noop, getCapability, () => null);
  const [pref, setPref] = useQualityPreference();
  const quality = resolveQuality(pref, capability);
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const [azimuth, setAzimuth] = useState(0);
  const [lost, setLost] = useState(false);
  const [generation, setGeneration] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e?.isIntersecting ?? true));
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const send = useCallback((kind: CameraCommand["kind"]) => setCommand({ kind, nonce: Date.now() }), []);
  const onLost = useCallback(() => setLost(true), []);

  const support = capability?.support ?? "checking";
  let content: ReactNode;
  if (support === "checking") content = <SceneMessage title="Checking 3D support…" busy />;
  else if (support === "unavailable")
    content = (
      <SceneMessage
        title="3D view unavailable on this device"
        body="This browser did not provide WebGL, often because hardware acceleration is off or blocked. Use the Map view and the zone list: every zone, crop and record is available there."
      />
    );
  else if (lost)
    content = (
      <Box sx={{ position: "absolute", inset: 0 }}>
        <SceneMessage title="The 3D view stopped" body="The graphics context was lost (a driver reset or memory pressure). Your unsaved edits are kept." />
        <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 32, textAlign: "center" }}>
          <Button
            variant="contained"
            onClick={() => {
              setLost(false);
              setGeneration((g) => g + 1);
            }}
          >
            Restart 3D view
          </Button>
        </Box>
      </Box>
    );
  else
    content = (
      <SceneErrorBoundary
        key={generation}
        fallback={() => <SceneMessage title="The 3D view could not start" body="An error occurred while creating the 3D scene. The map view, zone list and records still work. Try a lower quality setting or reload." />}
      >
        <FieldScene
          data={data}
          crops={crops}
          stage={stage}
          selectedKey={selectedKey}
          onSelect={onSelect}
          quality={quality}
          active={onScreen && visible}
          command={command}
          onAzimuth={setAzimuth}
          onContextLost={onLost}
        />
      </SceneErrorBoundary>
    );
  const ready = support !== "checking" && support !== "unavailable" && !lost;

  return (
    <Box ref={stageRef} sx={{ position: "relative", height: "100%", minHeight: 0, overflow: "hidden", bgcolor: tokens.sky }}>
      <Box sx={{ position: "absolute", inset: 0 }}>{content}</Box>

      <Stack spacing={1} sx={{ position: "absolute", top: 12, left: 12, right: 76, alignItems: "flex-start", pointerEvents: "none" }}>
        <Typography
          variant="caption"
          sx={{ px: 1.25, py: 0.5, borderRadius: 1, bgcolor: "rgba(10, 29, 22, 0.84)", color: tokens.neutral[50], fontWeight: 600, maxWidth: "100%" }}
        >
          {t("ws.illustrative")}
        </Typography>
        {badge}
        {selectedLabel && (
          <Typography
            variant="caption"
            aria-live="polite"
            sx={{ px: 1.25, py: 0.5, borderRadius: 1, bgcolor: tokens.lime[400], color: tokens.forest[950], fontWeight: 700, maxWidth: "100%" }}
            noWrap
          >
            {t("ws.selected")}: {selectedLabel}
          </Typography>
        )}
      </Stack>

      {ready && (
        <>
          <Tooltip title={`${t("ws.compass")} · ${t("ws.resetView")}`}>
            <IconButton
              onClick={() => send("reset")}
              aria-label={`${t("ws.compass")}: ${Math.round(((-azimuth * 180) / Math.PI + 360) % 360)}°. ${t("ws.resetView")}`}
              sx={{ position: "absolute", top: 12, right: 12, width: 52, height: 52, ...overlaySurface, borderRadius: "50%", "&:hover": { bgcolor: tokens.neutral[0] } }}
            >
              <Box component="svg" viewBox="0 0 40 40" sx={{ width: 40, height: 40, transform: `rotate(${(azimuth * 180) / Math.PI}deg)` }} aria-hidden="true">
                <path d="M20 3 L26 21 L20 18 L14 21 Z" fill={tokens.clay} />
                <path d="M20 37 L14 19 L20 22 L26 19 Z" fill={tokens.neutral[500]} />
                <text x="20" y="13.5" textAnchor="middle" fontSize="7" fontWeight="700" fill={tokens.neutral[0]}>
                  N
                </text>
              </Box>
            </IconButton>
          </Tooltip>

          <Stack
            direction="row"
            spacing={1}
            sx={{ position: "absolute", right: 12, bottom: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 1 }}
          >
            <Select
              size="small"
              value={pref}
              onChange={(e) => setPref(e.target.value as QualityPreference)}
              inputProps={{ "aria-label": t("ws.quality") }}
              renderValue={(v) => `${t("ws.quality")}: ${v === "auto" ? `auto (${quality})` : v}`}
              sx={{ height: 44, fontSize: "0.85rem", ...overlaySurface, borderRadius: 1.5, "& .MuiOutlinedInput-notchedOutline": { border: 0 } }}
            >
              <MenuItem value="auto">Auto ({quality})</MenuItem>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="balanced">Balanced</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </Select>
            <Stack role="toolbar" aria-label={t("ws.camera")} direction="row" sx={{ p: 0.5, borderRadius: 1.5, ...overlaySurface }}>
              <CamButton label={t("ws.rotateLeft")} onClick={() => send("rotateLeft")} icon={<RotateLeftRoundedIcon />} />
              <CamButton label={t("ws.rotateRight")} onClick={() => send("rotateRight")} icon={<RotateRightRoundedIcon />} />
              <CamButton label={t("ws.zoomIn")} onClick={() => send("zoomIn")} icon={<ZoomInRoundedIcon />} />
              <CamButton label={t("ws.zoomOut")} onClick={() => send("zoomOut")} icon={<ZoomOutRoundedIcon />} />
              <CamButton label={t("ws.resetView")} onClick={() => send("reset")} icon={<CenterFocusStrongRoundedIcon />} />
            </Stack>
          </Stack>
        </>
      )}
    </Box>
  );
}

function CamButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <Tooltip title={label}>
      <IconButton aria-label={label} onClick={onClick} sx={{ width: 44, height: 44, color: tokens.forest[900] }}>
        {icon}
      </IconButton>
    </Tooltip>
  );
}
