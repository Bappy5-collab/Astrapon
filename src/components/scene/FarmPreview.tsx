"use client";

import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RotateLeftRoundedIcon from "@mui/icons-material/RotateLeftRounded";
import RotateRightRoundedIcon from "@mui/icons-material/RotateRightRounded";
import CenterFocusStrongRoundedIcon from "@mui/icons-material/CenterFocusStrongRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { tokens } from "@/theme/tokens";

import type { CameraCommand } from "./FarmPreviewScene";
import { CROP_COLORS, ILLUSTRATIVE_STRIPS } from "./illustrativeFarm";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import { SceneMessage } from "./SceneMessage";
import { detectGraphicsCapability, type GraphicsCapability } from "./webgl";

const FarmPreviewScene = dynamic(() => import("./FarmPreviewScene"), {
  ssr: false,
  loading: () => <SceneMessage title="Loading 3D preview…" busy />,
});

// --- browser-only capability stores (stable snapshots; "checking" during SSR) ---

let cachedCapability: GraphicsCapability | undefined;
const noopSubscribe = () => () => {};
const getCapability = () => (cachedCapability ??= detectGraphicsCapability());
const getServerCapability = () => null;

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (cb: () => void) => {
  const mq = window.matchMedia(reducedMotionQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getReducedMotion = () => window.matchMedia(reducedMotionQuery).matches;

export function FarmPreview({ height = 520, caption }: { height?: number | string | Record<string, number | string>; caption?: ReactNode }) {
  const capability = useSyncExternalStore<GraphicsCapability | null>(noopSubscribe, getCapability, getServerCapability);
  const support = capability?.support ?? "checking";
  const quality = capability?.softwareRenderer ? "reduced" : "full";
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => true);
  const [userAutoRotate, setUserAutoRotate] = useState<boolean | null>(null);
  const [command, setCommand] = useState<CameraCommand | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  // Pause rendering entirely while the stage is scrolled away or the tab is hidden.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true));
    io.observe(el);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Software renderers cannot sustain continuous animation; default auto-rotate off there.
  const autoRotate = userAutoRotate ?? (!reducedMotion && quality === "full");
  const send = useCallback((kind: CameraCommand["kind"]) => setCommand({ kind, nonce: Date.now() }), []);
  const onContextLost = useCallback(() => setContextLost(true), []);

  let stage: ReactNode;
  if (support === "checking") {
    stage = <SceneMessage title="Checking 3D support…" busy />;
  } else if (support === "unavailable") {
    stage = (
      <SceneMessage
        title="3D view unavailable on this device"
        body="Your browser did not provide WebGL, which the 3D farm view needs. This is often caused by disabled hardware acceleration, a privacy setting, or an older device. Everything else in FieldShift is available as text, forms, and charts."
      />
    );
  } else if (contextLost) {
    stage = (
      <SceneMessage
        title="The 3D view stopped"
        body="The graphics context was lost (for example after a driver reset or memory pressure). Reload the page to restore it."
      />
    );
  } else {
    stage = (
      <SceneErrorBoundary
        fallback={() => (
          <SceneMessage
            title="The 3D view could not start"
            body="An error occurred while creating the 3D scene. The rest of the page still works; try reloading, or use a browser with hardware acceleration enabled."
          />
        )}
      >
        <FarmPreviewScene
          autoRotate={autoRotate}
          quality={quality}
          active={onScreen && pageVisible}
          command={command}
          onContextLost={onContextLost}
        />
      </SceneErrorBoundary>
    );
  }

  const ready = support !== "checking" && support !== "unavailable" && !contextLost;

  return (
    <Box component="figure" sx={{ m: 0 }} aria-labelledby="farm-preview-caption">
      <Box
        ref={stageRef}
        sx={{
          position: "relative",
          height,
          borderRadius: 4,
          overflow: "hidden",
          bgcolor: tokens.sky,
          border: `1px solid ${tokens.neutral[300]}`,
          boxShadow: "0 30px 60px -30px rgba(11, 26, 18, 0.45)",
        }}
      >
        <Box sx={{ position: "absolute", inset: 0 }}>{stage}</Box>

        <Chip
          label="Illustrative scene · not your field · not satellite imagery"
          size="small"
          sx={{
            position: "absolute",
            top: 12,
            left: 12,
            bgcolor: "rgba(11, 26, 18, 0.82)",
            color: tokens.neutral[50],
            maxWidth: "calc(100% - 24px)",
            backdropFilter: "blur(6px)",
          }}
        />

        {ready && (
          <Stack
            role="toolbar"
            aria-label="3D camera controls"
            direction="row"
            spacing={0.5}
            sx={{
              position: "absolute",
              right: 12,
              bottom: 12,
              p: 0.5,
              borderRadius: 999,
              bgcolor: "rgba(251, 249, 244, 0.92)",
              border: `1px solid ${tokens.neutral[300]}`,
              backdropFilter: "blur(6px)",
            }}
          >
            <CameraButton label="Rotate left" onClick={() => send("rotateLeft")} icon={<RotateLeftRoundedIcon />} />
            <CameraButton label="Rotate right" onClick={() => send("rotateRight")} icon={<RotateRightRoundedIcon />} />
            <CameraButton label="Zoom in" onClick={() => send("zoomIn")} icon={<ZoomInRoundedIcon />} />
            <CameraButton label="Zoom out" onClick={() => send("zoomOut")} icon={<ZoomOutRoundedIcon />} />
            <CameraButton label="Reset view" onClick={() => send("reset")} icon={<CenterFocusStrongRoundedIcon />} />
            <CameraButton
              label={autoRotate ? "Pause auto-rotate" : "Start auto-rotate"}
              pressed={autoRotate}
              onClick={() => setUserAutoRotate(!autoRotate)}
              icon={autoRotate ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
            />
          </Stack>
        )}
      </Box>

      <Stack
        component="figcaption"
        id="farm-preview-caption"
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 1.5, md: 3 }}
        sx={{ mt: 1.5, justifyContent: "space-between", alignItems: { md: "center" } }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
          {caption ??
            "A placeholder farm with four rotation strips, used to develop the 3D view. Crop shapes are stylised. Drag to orbit, scroll or pinch to zoom, or use the buttons."}
          {ready && quality === "reduced" && " Shown at reduced detail because this browser is using software graphics."}
        </Typography>
        <Stack component="ul" direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1.5, listStyle: "none", p: 0, m: 0 }} aria-label="Strips shown">
          {ILLUSTRATIVE_STRIPS.map((s) => (
            <Stack component="li" key={s.id} direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 12, height: 12, borderRadius: "3px", bgcolor: CROP_COLORS[s.crop].plant }} aria-hidden="true" />
              <Typography variant="body2">{s.label}</Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

function CameraButton({ label, icon, onClick, pressed }: { label: string; icon: ReactNode; onClick: () => void; pressed?: boolean }) {
  return (
    <Tooltip title={label}>
      <IconButton size="small" aria-label={label} aria-pressed={pressed} onClick={onClick} sx={{ color: tokens.forest[900] }}>
        {icon}
      </IconButton>
    </Tooltip>
  );
}
