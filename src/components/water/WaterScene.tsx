"use client";

import { Html, Line } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";

import type { BoundaryGeometry, Position } from "@/domain/geo/boundary";
import { createLocalFrame, projectField } from "@/domain/geo/local-frame";
import type { SourceGeometry } from "@/domain/water/distance";
import { CameraRig, FieldSlab, Ground, Outline, SLAB } from "@/components/field3d/FieldScene";
import { SCENE_SIZE } from "@/components/field3d/model";
import type { SceneCommon } from "@/components/field3d/FieldViewport";
import { tokens } from "@/theme/tokens";

export type WaterPart = "source" | "pipe" | "pump" | "pv" | "tank";

export type WaterSceneProps = SceneCommon & {
  boundary: BoundaryGeometry;
  source: { kind: "surface" | "well"; label: string; geometry: SourceGeometry | null; fieldPoint: Position | null; sourcePoint: Position | null; distanceM: number | null } | null;
  pvKwp: number | null;
  tankM3: number | null;
  /** The selected scenario pumps water (demand > 0 and a pump calculation exists). */
  flowing: boolean;
  reducedMotion: boolean;
  selected: WaterPart | null;
  onSelect: (p: WaterPart | null) => void;
};

/** Farthest scene distance at which a source is drawn in place; beyond it an edge marker points to it. */
const VIEW_UNITS = 230;
const WATER = "#2E7DB5";
const HOME = new THREE.Vector3(90, 110, 150);

type V2 = [number, number];

function useProjector(boundary: BoundaryGeometry) {
  return useMemo(() => {
    const projected = projectField(boundary);
    const frame = createLocalFrame(projected.origin);
    const { minX, maxX, minY, maxY } = projected.bounds;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const k = SCENE_SIZE / Math.max(projected.extentM, 1);
    const toScene = (p: Position): V2 => { const [x, y] = frame.toLocal(p); return [(x - cx) * k, (y - cy) * k]; };
    const field = projected.polygons.map((p) => ({ outer: p.outer.map(([x, y]) => [(x - cx) * k, (y - cy) * k] as V2), holes: p.holes.map((h) => h.map(([x, y]) => [(x - cx) * k, (y - cy) * k] as V2)) }));
    return { toScene, field, metresPerUnit: 1 / k };
  }, [boundary]);
}

const v3 = ([x, n]: V2, y: number): [number, number, number] => [x, y, -n];

function Selectable({ part, selected, onSelect, children, label }: { part: WaterPart; selected: WaterPart | null; onSelect: (p: WaterPart | null) => void; children: React.ReactNode; label: string }) {
  return (
    <group
      onClick={(e) => { e.stopPropagation(); onSelect(selected === part ? null : part); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => (document.body.style.cursor = "")}
      name={label}
    >
      {children}
    </group>
  );
}

function FlowLine({ points, flowing, animate, selected }: { points: [number, number, number][]; flowing: boolean; animate: boolean; selected: boolean }) {
  const ref = useRef<ComponentRef<typeof Line>>(null);
  useFrame((_, dt) => {
    const m = ref.current?.material as unknown as { dashOffset: number } | undefined;
    if (m && animate && flowing) m.dashOffset -= dt * 2.5;
  });
  return (
    <>
      <Line points={points} color={selected ? tokens.lime[400] : "#3B4A42"} lineWidth={selected ? 7 : 5} />
      {flowing && <Line ref={ref} points={points} color="#8FD3FF" lineWidth={2.5} dashed dashSize={2.2} gapSize={2.2} />}
    </>
  );
}

function Label({ position, children }: { position: [number, number, number]; children: React.ReactNode }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div style={{ whiteSpace: "nowrap", font: "600 12px/1.3 var(--font-body), sans-serif", color: tokens.neutral[50], background: "rgba(10,29,22,.84)", padding: "3px 8px", borderRadius: 6 }}>{children}</div>
    </Html>
  );
}

export default function WaterScene(props: WaterSceneProps) {
  const { boundary, source, pvKwp, tankM3, flowing, reducedMotion, selected, onSelect, quality, active, command, onAzimuth, onContextLost } = props;
  const proj = useProjector(boundary);
  const { toScene, metresPerUnit } = proj;

  const layout = useMemo(() => {
    // The pump sits where the straight line to the source meets the field edge; without a mapped
    // source it sits at the field's east edge (position illustrative).
    const xs = proj.field.flatMap((p) => p.outer.map((q) => q[0]));
    const fallback: V2 = [Math.max(...xs) + 4, 0];
    const pump = source?.fieldPoint ? toScene(source.fieldPoint) : fallback;
    const target = source?.sourcePoint ? toScene(source.sourcePoint) : null;
    let end: V2 | null = target;
    let offscene = false;
    if (target) {
      const d = Math.hypot(target[0] - pump[0], target[1] - pump[1]);
      if (Math.hypot(...target) > VIEW_UNITS && d > 0) {
        const s = (VIEW_UNITS - Math.hypot(...pump)) / d;
        end = [pump[0] + (target[0] - pump[0]) * Math.max(0.2, s), pump[1] + (target[1] - pump[1]) * Math.max(0.2, s)];
        offscene = true;
      }
    }
    // PV and tank sit just outside the field beside the pump, away from the source direction.
    const dir: V2 = end ? [end[0] - pump[0], end[1] - pump[1]] : [1, 0];
    const len = Math.hypot(...dir) || 1;
    const side: V2 = [-dir[1] / len, dir[0] / len];
    const pv: V2 = [pump[0] + side[0] * 16, pump[1] + side[1] * 16];
    const tank: V2 = [pump[0] - side[0] * 12, pump[1] - side[1] * 12];
    return { pump, end, offscene, pv, tank, angle: Math.atan2(dir[1], dir[0]) };
  }, [proj.field, source, toScene]);

  const sourceLines = useMemo(() => {
    if (!source?.geometry || layout.offscene) return [] as [number, number, number][][];
    const g = source.geometry;
    const lines = g.type === "Point" ? [] : g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : g.coordinates;
    return lines.map((l) => l.map((p) => v3(toScene(p), 0.15))).filter((l) => l.length >= 2);
  }, [source, layout.offscene, toScene]);

  const panels = pvKwp && pvKwp > 0 ? Math.min(40, Math.max(1, Math.round(pvKwp / 0.4))) : 0;
  // Panel ≈ 1.1 m × 1.9 m (400 W module, illustrative), drawn at true scale relative to the field.
  const pw = 1.1 / metresPerUnit, ph = 1.9 / metresPerUnit;
  const pScale = Math.max(1, 3 / Math.max(pw, 0.01)); // keep panels visible on large fields; noted in the label
  const tankR = tankM3 && tankM3 > 0 ? Math.sqrt(tankM3 / (Math.PI * 2)) / metresPerUnit : 0;
  const tankVisible = Math.max(tankR, 1.5);
  const pipePoints = useMemo(() => (layout.end ? [v3(layout.pump, SLAB + 0.6), v3(layout.end, SLAB + 0.6)] : null), [layout]);
  const sel = (p: WaterPart) => selected === p;

  return (
    <Canvas
      dpr={quality === "low" ? 1 : quality === "balanced" ? [1, 1.5] : [1, 2]}
      frameloop={!active ? "never" : flowing && !reducedMotion ? "always" : "demand"}
      camera={{ position: HOME.toArray(), fov: 36, near: 0.5, far: 3000 }}
      gl={{ antialias: quality !== "low", powerPreference: quality === "low" ? "low-power" : "high-performance" }}
      onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onContextLost(); })}
      onPointerMissed={() => onSelect(null)}
      aria-hidden="true"
    >
      <color attach="background" args={[tokens.sky]} />
      <fog attach="fog" args={[tokens.sky, SCENE_SIZE * 2.6, SCENE_SIZE * 6]} />
      <hemisphereLight args={["#F3F1E7", "#58673F", 1.0]} />
      <directionalLight position={[70, 110, 40]} intensity={2.0} color="#FFF2DA" />
      <Ground />
      <FieldSlab polygons={proj.field} bearing={0} rowPeriod={3} />
      <Outline polygons={proj.field} y={SLAB + 0.08} color="#F5F6F0" width={2} />

      {source && (
        <Selectable part="source" selected={selected} onSelect={onSelect} label="Water source">
          {sourceLines.map((l, i) => (
            <Line key={i} points={l} color={sel("source") ? tokens.lime[400] : WATER} lineWidth={sel("source") ? 7 : 5} />
          ))}
          {source.kind === "surface" && source.geometry?.type === "Point" && !layout.offscene && layout.end && (
            <mesh position={v3(layout.end, 0.4)}>
              <cylinderGeometry args={[2.5, 2.5, 0.8, 24]} />
              <meshStandardMaterial color={sel("source") ? tokens.lime[400] : WATER} />
            </mesh>
          )}
          {layout.end && layout.offscene && (
            <group position={v3(layout.end, 2)} rotation={[0, layout.angle, 0]}>
              <mesh rotation={[0, 0, -Math.PI / 2]}>
                <coneGeometry args={[3, 7, 16]} />
                <meshStandardMaterial color={sel("source") ? tokens.lime[400] : WATER} />
              </mesh>
            </group>
          )}
          {layout.end && (
            <Label position={v3(layout.end, 8)}>
              {source.label}
              {source.distanceM != null ? ` · ${source.distanceM < 1000 ? `${Math.round(source.distanceM)} m` : `${(source.distanceM / 1000).toFixed(1)} km`} straight line` : ""}
              {layout.offscene ? " (off-scene, direction true)" : ""}
            </Label>
          )}
        </Selectable>
      )}

      {pipePoints && (
        <Selectable part="pipe" selected={selected} onSelect={onSelect} label="Pipe">
          <FlowLine points={pipePoints} flowing={flowing} animate={!reducedMotion} selected={sel("pipe")} />
        </Selectable>
      )}

      <Selectable part="pump" selected={selected} onSelect={onSelect} label="Pump">
        <mesh position={v3(layout.pump, SLAB + 1.4)}>
          <boxGeometry args={[3.2, 2.8, 3.2]} />
          <meshStandardMaterial color={sel("pump") ? tokens.lime[400] : "#C8CDBF"} metalness={0.3} roughness={0.5} />
        </mesh>
        {source?.kind === "well" && (
          <mesh position={v3(layout.pump, SLAB - 2)}>
            <cylinderGeometry args={[0.8, 0.8, 5, 16]} />
            <meshStandardMaterial color="#5E6759" />
          </mesh>
        )}
        <Label position={v3(layout.pump, SLAB + 5)}>{source?.kind === "well" ? "Well pump" : "Pump"}</Label>
      </Selectable>

      {panels > 0 && (
        <Selectable part="pv" selected={selected} onSelect={onSelect} label="Solar array">
          <group position={v3(layout.pv, 0)} rotation={[0, layout.angle, 0]}>
            {Array.from({ length: panels }, (_, i) => {
              const cols = Math.ceil(Math.sqrt(panels));
              const r = Math.floor(i / cols), c = i % cols;
              return (
                <mesh key={i} position={[(c - cols / 2) * pw * pScale * 1.1, 1.2, r * ph * pScale * 1.3]} rotation={[-Math.PI / 6, 0, 0]}>
                  <boxGeometry args={[pw * pScale, 0.12, ph * pScale]} />
                  <meshStandardMaterial color={sel("pv") ? tokens.lime[400] : "#1C3554"} metalness={0.5} roughness={0.35} />
                </mesh>
              );
            })}
          </group>
          <Label position={v3(layout.pv, 7)}>{`PV ≈ ${pvKwp!.toFixed(2)} kWp (panel count illustrative${pScale > 1 ? ", enlarged" : ""})`}</Label>
        </Selectable>
      )}

      {tankM3 != null && tankM3 > 0 && (
        <Selectable part="tank" selected={selected} onSelect={onSelect} label="Storage tank">
          <mesh position={v3(layout.tank, tankVisible)}>
            <cylinderGeometry args={[tankVisible, tankVisible, tankVisible * 2, 28]} />
            <meshStandardMaterial color={sel("tank") ? tokens.lime[400] : "#DCE2D6"} />
          </mesh>
          <Label position={v3(layout.tank, tankVisible * 2 + 3)}>{`Tank ${tankM3} m³${tankR < 1.5 ? " (enlarged)" : ""}`}</Label>
        </Selectable>
      )}

      <CameraRig command={command} onAzimuth={onAzimuth} autoRotate={false} interactive home={HOME} maxDistance={700} />
    </Canvas>
  );
}
