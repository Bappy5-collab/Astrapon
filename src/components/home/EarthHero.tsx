"use client";

import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import type { SxProps, Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { SceneErrorBoundary } from "@/components/scene/SceneErrorBoundary";
import { detectGraphicsCapability, type GraphicsCapability } from "@/components/scene/webgl";
import { useReducedMotion } from "@/lib/preferences";
import { tokens } from "@/theme/tokens";

import { GLOBE_PLACES } from "./places";

const EarthScene = dynamic(() => import("./EarthScene"), { ssr: false, loading: () => <StaticEarth /> });

let cached: GraphicsCapability | undefined;
const noop = () => () => {};
const CYCLE_MS = 5200;


function PlaceCard({ children: place, sx }: { children: (typeof GLOBE_PLACES)[number]; sx: SxProps<Theme> }) {
  return (
    <Box
      aria-live="polite"
      sx={[
        { p: 1.75, borderRadius: "14px", bgcolor: "rgba(16, 43, 34, 0.86)", border: `1px solid ${tokens.forest[600]}`, backdropFilter: "blur(8px)", boxShadow: "0 18px 40px -20px rgba(0,0,0,0.6)" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography variant="caption" sx={{ color: tokens.lime[400], fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Live test location
      </Typography>
      <Typography sx={{ color: tokens.neutral[50], fontWeight: 700, fontSize: "1.05rem", lineHeight: 1.3 }}>
        {place.name}, {place.country}
      </Typography>
      <Typography variant="body2" sx={{ color: tokens.neutral[300], mb: 0.75 }}>
        {place.crops}
      </Typography>
      <Stack spacing={0.4} component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
        {place.checks.map((c) => (
          <Stack key={c} component="li" direction="row" spacing={0.75} sx={{ alignItems: "flex-start" }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 16, mt: "2px", color: tokens.lime[400] }} />
            <Typography variant="caption" sx={{ color: tokens.neutral[100], lineHeight: 1.45 }}>
              {c}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

/** Shown while loading and when WebGL is unavailable: a still, CSS-drawn Earth. */
function StaticEarth() {
  return (
    <Box aria-hidden="true" sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
      <Box
        sx={{
          width: "72%",
          aspectRatio: "1",
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, #2A6B5A 0%, #0E3B3A 45%, #06201D 100%)`,
          boxShadow: `0 0 80px 10px rgba(199,231,122,0.18), inset -30px -30px 80px rgba(0,0,0,0.45)`,
        }}
      />
    </Box>
  );
}

/**
 * Home hero: an animated 3D Earth with Astrapon's live test locations. Rotation, the satellite and
 * pulses stop with reduced motion; the scene pauses off-screen; software renderers get fewer dots;
 * without WebGL a still Earth is drawn. Every fact on the globe is in the list beside it.
 */
export function EarthHero() {
  const capability = useSyncExternalStore<GraphicsCapability | null>(noop, () => (cached ??= detectGraphicsCapability()), () => null);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [visible, setVisible] = useState(true);
  const [lost, setLost] = useState(false);
  const [dots, setDots] = useState<Float32Array | null>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e?.isIntersecting ?? true));
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/data/globe-land-dots.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { latLon?: number[] } | null) => { if (alive && j?.latLon) setDots(Float32Array.from(j.latLon)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const animate = !reduced && !capability?.softwareRenderer;
  const running = onScreen && visible;
  useEffect(() => {
    if (!animate || !running || paused) return;
    const t = setInterval(() => setActive((a) => (a + 1) % GLOBE_PLACES.length), CYCLE_MS);
    return () => clearInterval(t);
  }, [animate, running, paused]);

  const support = capability?.support ?? "checking";
  const place = GLOBE_PLACES[active]!;
  const scene =
    support === "checking" || support === "unavailable" || lost ? (
      <StaticEarth />
    ) : (
      <SceneErrorBoundary fallback={() => <StaticEarth />}>
        <EarthScene dots={dots} places={GLOBE_PLACES} active={active} animate={animate} running={running} low={!!capability?.softwareRenderer} onContextLost={() => setLost(true)} />
      </SceneErrorBoundary>
    );

  return (
    <Box ref={ref} component="figure" sx={{ m: 0, position: "relative" }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <Box sx={{ position: "relative", aspectRatio: "1 / 1", width: "100%", maxWidth: 640, mx: "auto" }}>
        <Box sx={{ position: "absolute", inset: 0 }}>{scene}</Box>
        {/* Live caption card (text equivalent of the highlighted marker); below the globe on phones. */}
        <PlaceCard sx={{ display: { xs: "none", sm: "block" }, position: "absolute", left: 0, bottom: 24, maxWidth: 300 }}>{place}</PlaceCard>
      </Box>
      <Stack component="div" role="group" aria-label="Test locations on the globe" direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: "wrap", justifyContent: "center", mt: 1.5 }}>
        {GLOBE_PLACES.map((p, i) => (
          <ButtonBase
            key={p.key}
            onClick={() => { setActive(i); setPaused(true); }}
            aria-pressed={i === active}
            sx={{
              px: 1.5,
              py: 0.6,
              borderRadius: 99,
              fontSize: "0.82rem",
              fontWeight: 600,
              color: i === active ? tokens.forest[950] : tokens.neutral[100],
              bgcolor: i === active ? tokens.lime[400] : "rgba(255,255,255,0.06)",
              border: `1px solid ${i === active ? tokens.lime[400] : tokens.forest[600]}`,
              transition: "background-color 160ms",
              "&:hover": { bgcolor: i === active ? tokens.lime[300] : "rgba(255,255,255,0.12)" },
              "&.Mui-focusVisible": { outline: `3px solid ${tokens.lime[400]}`, outlineOffset: 2 },
            }}
          >
            {p.name}
          </ButtonBase>
        ))}
      </Stack>
      <PlaceCard sx={{ display: { xs: "block", sm: "none" }, mt: 1.5 }}>{place}</PlaceCard>
      <Typography component="figcaption" variant="caption" sx={{ display: "block", textAlign: "center", mt: 1, color: tokens.neutral[300] }}>
        Illustrative globe (land from Natural Earth). Markers are places where Astrapon&apos;s live software checks ran — test squares, not farms. The satellite is a symbol for public satellite and model data.
      </Typography>
    </Box>
  );
}
