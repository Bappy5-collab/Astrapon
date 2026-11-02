"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";

import { cropForm } from "@/domain/farm/crops";
import { tokens } from "@/theme/tokens";

import { CameraRig, Canopy, FieldSlab, Ground, Outline, Plants, SelectionWall, SLAB, useDisposable, BUDGET, type CameraCommand, type QualityPreset } from "@/components/field3d/FieldScene";
import { FIELD_KEY, SCENE_SIZE, type SceneData } from "@/components/field3d/model";
import { plantScale, type GrowthStage } from "@/components/field3d/plants";

/** What one copy of the field shows on the selected day. Built from stored timeline values only. */
export type ReplayPanel = {
  id: string;
  crop: string | null;
  stage: GrowthStage;
  /** 0–1 progress through the FAO-56 stages (illustrative height). */
  growth: number;
  /** Root-zone depletion Dr/TAW (0 full – 1 used up); null when soil water capacity is unknown. */
  depletion: number | null;
  irrigated: boolean;
};

export type ReplaySceneProps = {
  data: SceneData;
  panels: ReplayPanel[];
  rainMm: number | null;
  selected: { panelId: string; key: string } | null;
  onSelect: (panelId: string, key: string) => void;
  quality: QualityPreset;
  active: boolean;
  animateWeather: boolean;
  command: CameraCommand | null;
  onAzimuth: (radians: number) => void;
  onContextLost: () => void;
};

export const PANEL_GAP = SCENE_SIZE * 1.25;
export const panelOffsets = (n: number) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * PANEL_GAP);

const WET = new THREE.Color("#8F857A");
const DRY = new THREE.Color("#FFF6E6");
/** Soil shade from root-zone depletion: wetter soil is darker. Illustrative, with a legend. */
export function soilTint(depletion: number | null): string | undefined {
  if (depletion == null) return undefined;
  return "#" + WET.clone().lerp(DRY, Math.max(0, Math.min(1, depletion))).getHexString();
}

/** Restrained, illustrative rain: a few hundred thin streaks while the selected day has recorded rain. */
function Rain({ width, depth, count }: { width: number; depth: number; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({ x: ((i * 7919) % 1000) / 1000 - 0.5, z: ((i * 104729) % 1000) / 1000 - 0.5, h: ((i * 1299709) % 1000) / 1000 })), [count]);
  const geometry = useDisposable(useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 2.2, 3), []));
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.getElapsedTime();
    seeds.forEach((s, i) => {
      const y = 46 - (((s.h * 46 + t * 26) % 46) + 46) % 46;
      m.makeTranslation(s.x * width, y + 1, s.z * depth);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    state.invalidate();
  });
  return (
    <instancedMesh ref={ref} args={[geometry ?? undefined, undefined, count]} frustumCulled={false}>
      <meshBasicMaterial color="#C9DCEB" transparent opacity={0.45} depthWrite={false} />
    </instancedMesh>
  );
}

type PanelViewProps = {
  panel: ReplayPanel;
  offset: number;
  data: SceneData;
  rowPeriod: number;
  quality: QualityPreset;
  budget: number;
  selectedKey: string | null;
  onSelect: (panelId: string, key: string) => void;
  raining: boolean;
};

const PanelView = memo(function PanelView({ panel: p, offset, data, rowPeriod, quality, budget, selectedKey, onSelect, raining }: PanelViewProps) {
  const form = cropForm(p.crop);
  const crops = useMemo(() => ({ [FIELD_KEY]: { form: p.crop ? form : ("fallow" as const), cropName: p.crop } }), [p.crop, form]);
  const pick = (key: string) => onSelect(p.id, key);
  const isSel = selectedKey != null;
  const selected = isSel ? { panelId: p.id, key: selectedKey } : null;
  return (
    <group position-x={offset}>
            <FieldSlab polygons={data.field} bearing={data.bearing} rowPeriod={rowPeriod} tint={soilTint(p.depletion)} />
            <Canopy polygons={data.field} crop={crops[FIELD_KEY]} stage={p.stage} y={SLAB} selected={isSel && selected?.key === FIELD_KEY} pickKey={FIELD_KEY} onPick={pick} />
            {data.zones.map((z) => (
              <Canopy key={z.key} polygons={z.polygons} crop={crops[FIELD_KEY]} stage={p.stage} y={SLAB + 0.02} selected={isSel && selected?.key === z.key} pickKey={z.key} onPick={pick} />
            ))}
            <Plants data={data} crops={crops} stage={p.stage} quality={quality} budget={budget} height={p.stage === "bare" ? 0 : plantScale(form, "mature") * p.growth} />
            <Outline polygons={data.field} y={SLAB + 0.08} color={isSel ? tokens.lime[400] : "#F5F6F0"} width={isSel ? 4 : 2} />
            {p.irrigated && <Outline polygons={data.field} y={SLAB + 0.3} color="#3B7FC4" width={3} dashed />}
            {isSel && <SelectionWall polygons={selected?.key && selected.key !== FIELD_KEY ? data.zones.find((z) => z.key === selected.key)?.polygons ?? data.field : data.field} y={SLAB} />}
            {data.zones.map((z) => (
              <Outline key={z.key} polygons={z.polygons} y={SLAB + 0.12} color={isSel && selected?.key === z.key ? tokens.lime[400] : "#E9ECE2"} width={isSel && selected?.key === z.key ? 4 : 1.5} dashed={!(isSel && selected?.key === z.key)} />
            ))}
            {raining && <Rain width={SCENE_SIZE} depth={SCENE_SIZE} count={quality === "low" ? 120 : 260} />}
    </group>
  );
});

export default function ReplayScene({ data, panels, rainMm, selected, onSelect, quality, active, animateWeather, command, onAzimuth, onContextLost }: ReplaySceneProps) {
  const n = panels.length;
  const offsets = panelOffsets(n);
  const home = useMemo(() => new THREE.Vector3(0, 70 + 38 * (n - 1), 100 + 70 * (n - 1)), [n]);
  const high = quality === "high";
  // Several copies of the field share the plant budget so side-by-side stays as light as one field.
  const budget = Math.round(BUDGET[quality] / Math.max(1, n));
  const rowPeriod = Math.max(0.6, Math.sqrt(data.areaUnits / BUDGET[quality]) * 1.25);
  const raining = animateWeather && rainMm != null && rainMm >= 1;

  return (
    <Canvas
      shadows={high}
      dpr={quality === "low" ? 1 : quality === "balanced" ? [1, 1.5] : [1, 2]}
      frameloop={active ? "demand" : "never"}
      camera={{ position: home.toArray(), fov: 36, near: 0.5, far: 3000 }}
      gl={{ antialias: quality !== "low", powerPreference: quality === "low" ? "low-power" : "high-performance" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          onContextLost();
        });
      }}
      onPointerMissed={() => (document.body.style.cursor = "")}
      aria-hidden="true"
    >
      <color attach="background" args={[tokens.sky]} />
      <fog attach="fog" args={[tokens.sky, SCENE_SIZE * (2.2 + n), SCENE_SIZE * (5.5 + 2 * n)]} />
      <hemisphereLight args={["#F3F1E7", "#58673F", 1.0]} />
      <directionalLight position={[70, 110, 40]} intensity={2.0} color="#FFF2DA" castShadow={high} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} />
      <Ground />
      {panels.map((p, i) => (
        <PanelView
          key={p.id}
          panel={p}
          offset={offsets[i]!}
          data={data}
          rowPeriod={rowPeriod}
          quality={quality}
          budget={budget}
          selectedKey={selected?.panelId === p.id ? selected.key : null}
          onSelect={onSelect}
          raining={raining}
        />
      ))}

      <CameraRig command={command} onAzimuth={onAzimuth} autoRotate={false} interactive home={home} maxDistance={320 + 220 * (n - 1)} />
    </Canvas>
  );
}
