"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { cropForm } from "@/domain/farm/crops";
import { SAMPLE_FIELD, SAMPLE_HISTORY } from "@/domain/sample/sample-field";
import { resolveCrop } from "@/domain/workspace/workspace";
import { SceneErrorBoundary } from "@/components/scene/SceneErrorBoundary";
import { SceneMessage } from "@/components/scene/SceneMessage";
import { detectGraphicsCapability, type GraphicsCapability } from "@/components/scene/webgl";
import { useReducedMotion } from "@/lib/preferences";
import { tokens } from "@/theme/tokens";

import { buildSceneData, FIELD_KEY, type RegionCrop } from "./model";

const FieldScene = dynamic(() => import("./FieldScene"), { ssr: false, loading: () => <SceneMessage title="Loading 3D sample…" busy /> });

let cached: GraphicsCapability | undefined;
const noop = () => () => {};
const HERO_YEAR = 2025;
const HOME: [number, number, number] = [74, 58, 92];

/** Landing hero: the real sample field rendered by the workspace engine, at low cost. */
export function HeroField() {
  const capability = useSyncExternalStore<GraphicsCapability | null>(noop, () => (cached ??= detectGraphicsCapability()), () => null);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e?.isIntersecting ?? true));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const data = useMemo(() => buildSceneData(SAMPLE_FIELD.boundary, SAMPLE_FIELD.zones.map((z) => ({ key: z.key, name: z.name, boundary: z.boundary }))), []);
  const crops = useMemo(() => {
    const out: Record<string, RegionCrop> = {};
    for (const key of [FIELD_KEY, ...SAMPLE_FIELD.zones.map((z) => z.key)]) {
      const c = resolveCrop(SAMPLE_HISTORY.filter((h) => h.season === "main"), [], key === FIELD_KEY ? null : key, HERO_YEAR);
      out[key] = { form: c ? cropForm(c.cropName) : "fallow", cropName: c?.cropName ?? null };
    }
    return out;
  }, []);

  const support = capability?.support ?? "checking";
  let content;
  if (support === "checking") content = <SceneMessage title="Preparing the 3D sample…" busy />;
  else if (support === "unavailable" || lost)
    content = <SceneMessage title="3D preview not available here" body="Your browser did not provide WebGL. The sample workspace still works with its map, zone list and timeline." />;
  else
    content = (
      <SceneErrorBoundary fallback={() => <SceneMessage title="3D preview could not start" body="The sample workspace still works with its map and tables." />}>
        <FieldScene
          data={data}
          crops={crops}
          stage="mature"
          selectedKey={null}
          onSelect={() => {}}
          quality={capability?.softwareRenderer ? "low" : "balanced"}
          active={onScreen}
          command={null}
          onAzimuth={() => {}}
          onContextLost={() => setLost(true)}
          autoRotate={!reduced && !capability?.softwareRenderer}
          interactive={false}
          cameraHome={HOME}
        />
      </SceneErrorBoundary>
    );

  return (
    <Box ref={ref} component="figure" sx={{ m: 0 }} aria-labelledby="hero-figure-caption">
      <Box sx={{ position: "relative", aspectRatio: { xs: "4 / 3.2", md: "5 / 4" }, borderRadius: "14px", overflow: "hidden", bgcolor: tokens.sky, border: `1px solid ${tokens.neutral[300]}`, boxShadow: "0 30px 60px -32px rgba(10, 29, 22, 0.5)" }}>
        <Box sx={{ position: "absolute", inset: 0 }} aria-hidden="true">
          {content}
        </Box>
        <Typography variant="caption" sx={{ position: "absolute", top: 12, left: 12, px: 1.25, py: 0.5, borderRadius: 1, bgcolor: "rgba(10, 29, 22, 0.84)", color: tokens.neutral[50], fontWeight: 600 }}>
          Sample field · invented records · illustrative 3D
        </Typography>
      </Box>
      <Typography id="hero-figure-caption" component="figcaption" variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
        The sample field&apos;s invented outline and two zones, converted to local metres, with its {HERO_YEAR} crops (maize and soybean, also invented) on
        flat terrain. Crop shapes are stylised, not satellite imagery.
      </Typography>
    </Box>
  );
}
