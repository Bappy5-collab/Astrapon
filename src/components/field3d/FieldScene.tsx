"use client";

import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";

import type { CropForm } from "@/domain/farm/crops";
import type { LocalPolygon } from "@/domain/geo/local-frame";
import { tokens } from "@/theme/tokens";

import { FIELD_KEY, plantPlacements, SCENE_SIZE, type Placement, type RegionCrop, type SceneData } from "./model";
import { buildPlantGeometry, canopyColor, canopyOpacity, makeFurrowTexture, plantScale, type GrowthStage } from "./plants";

export type QualityPreset = "low" | "balanced" | "high";
export type CameraCommand = { kind: "reset" | "rotateLeft" | "rotateRight" | "zoomIn" | "zoomOut" | "top"; nonce: number };

export type FieldSceneProps = {
  data: SceneData;
  /** Crop per region key (zone key or FIELD_KEY). */
  crops: Record<string, RegionCrop>;
  stage: GrowthStage;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  quality: QualityPreset;
  active: boolean;
  command: CameraCommand | null;
  onAzimuth: (radians: number) => void;
  onContextLost: () => void;
  /** Slow turntable for the landing hero; never used when reduced motion is requested. */
  autoRotate?: boolean;
  /** False disables orbit input (hero). */
  interactive?: boolean;
  cameraHome?: [number, number, number];
};

const BUDGET: Record<QualityPreset, number> = { low: 2500, balanced: 8000, high: 18000 };
const SLAB = 0.5;
const CAMERA_HOME = new THREE.Vector3(62, 74, 96);

function shapeFrom(p: LocalPolygon): THREE.Shape {
  const s = new THREE.Shape(p.outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of p.holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}

const ringPoints = (ring: [number, number][], y: number): [number, number, number][] => [...ring, ring[0]!].map(([x, n]) => [x, y, -n]);

/** Disposes a geometry/texture created outside JSX when it is replaced or unmounted. */
function useDisposable<T extends { dispose: () => void } | null>(value: T): T {
  useEffect(() => () => value?.dispose(), [value]);
  return value;
}

// ------------------------------------------------------------------ ground ---

function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
      <circleGeometry args={[SCENE_SIZE * 6, 64]} />
      <meshStandardMaterial color="#AEB596" roughness={1} />
    </mesh>
  );
}

function FieldSlab({ polygons, bearing, rowPeriod }: { polygons: LocalPolygon[]; bearing: number; rowPeriod: number }) {
  const geometry = useDisposable(useMemo(() => {
    const g = new THREE.ExtrudeGeometry(polygons.map(shapeFrom), { depth: SLAB, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [polygons]));
  const texture = useDisposable(useMemo(() => {
    const t = makeFurrowTexture();
    if (t) {
      t.repeat.set(1 / rowPeriod, 1 / rowPeriod);
      t.rotation = (-bearing * Math.PI) / 180;
    }
    return t;
  }, [bearing, rowPeriod]));
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial attach="material-0" map={texture ?? undefined} color={texture ? "#FFFFFF" : tokens.soil} roughness={0.95} />
      <meshStandardMaterial attach="material-1" color="#4E3A27" roughness={1} />
    </mesh>
  );
}

function Canopy({
  polygons,
  crop,
  stage,
  y,
  selected,
  pickKey,
  onPick,
}: {
  polygons: LocalPolygon[];
  crop: RegionCrop;
  stage: GrowthStage;
  y: number;
  selected: boolean;
  pickKey: string;
  onPick: (key: string) => void;
}) {
  const geometry = useDisposable(useMemo(() => {
    const g = new THREE.ShapeGeometry(polygons.map(shapeFrom));
    g.rotateX(-Math.PI / 2);
    return g;
  }, [polygons]));
  const opacity = Math.max(canopyOpacity(stage), pickKey === FIELD_KEY ? 0 : 0.08) + (selected ? 0.12 : 0);
  const paddyWater = crop.form === "paddy" && (stage === "emerging" || stage === "growing");
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // a drag to orbit, not a click
    e.stopPropagation();
    onPick(pickKey);
  };
  return (
    <group position-y={y}>
      {paddyWater && (
        <mesh geometry={geometry} position-y={0.01}>
          <meshStandardMaterial color="#6F8F8C" roughness={0.12} metalness={0.15} transparent opacity={0.75} />
        </mesh>
      )}
      <mesh
        geometry={geometry}
        position-y={0.03}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <meshStandardMaterial
          color={selected ? tokens.lime[400] : canopyColor(crop.form, stage)}
          transparent
          opacity={opacity}
          depthWrite={false}
          roughness={0.9}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    </group>
  );
}

function Outline({ polygons, y, color, width, dashed = false }: { polygons: LocalPolygon[]; y: number; color: string; width: number; dashed?: boolean }) {
  return (
    <>
      {polygons.flatMap((p, i) =>
        [p.outer, ...p.holes].map((ring, j) => (
          <Line key={`${i}-${j}`} points={ringPoints(ring as [number, number][], y)} color={color} lineWidth={width} dashed={dashed} dashSize={1.2} gapSize={0.8} />
        )),
      )}
    </>
  );
}

/** Translucent ribbon standing on the edges of the selected region, so selection reads from any angle. */
function SelectionWall({ polygons, y }: { polygons: LocalPolygon[]; y: number }) {
  const geometry = useDisposable(
    useMemo(() => {
      const pos: number[] = [];
      const h = 1.6;
      for (const p of polygons)
        for (const ring of [p.outer, ...p.holes])
          ring.forEach(([x1, n1], i) => {
            const [x2, n2] = ring[(i + 1) % ring.length]!;
            const a = [x1, y, -n1], b = [x2, y, -n2], c = [x2, y + h, -n2], d = [x1, y + h, -n1];
            pos.push(...a, ...b, ...c, ...a, ...c, ...d);
          });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const alpha: number[] = [];
      for (let i = 0; i < pos.length / 18; i++) alpha.push(1, 1, 0, 1, 0, 0);
      g.setAttribute("alpha", new THREE.Float32BufferAttribute(alpha, 1));
      return g;
    }, [polygons, y]),
  );
  const material = useDisposable(
    useMemo(
      () =>
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          uniforms: { color: { value: new THREE.Color(tokens.lime[400]) } },
          vertexShader: "attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader: "uniform vec3 color; varying float vA; void main() { gl_FragColor = vec4(color, 0.55 * vA); }",
        }),
      [],
    ),
  );
  return <mesh geometry={geometry} material={material} renderOrder={2} />;
}

// ------------------------------------------------------------------ plants ---

function PlantInstances({ form, stage, placements, shadows }: { form: CropForm; stage: GrowthStage; placements: Placement[]; shadows: boolean }) {
  const geometry = useDisposable(useMemo(() => buildPlantGeometry(form, stage), [form, stage]));
  const ref = useRef<THREE.InstancedMesh>(null);
  const height = plantScale(form, stage);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    placements.forEach((pl, i) => {
      const h = height * pl.jitter;
      const w = Math.max(0.6, Math.min(1.4, h)) * (form === "tall_row" || form === "fibre" ? 0.9 : 1.15);
      mesh.setMatrixAt(i, m.compose(p.set(pl.x, SLAB, pl.z), q.setFromEuler(e.set(0, pl.yaw, 0)), s.set(w, h, w)));
      mesh.setColorAt(i, c.setScalar(0.88 + (pl.jitter - 0.85) * 0.6));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements, height, form]);

  if (!geometry || placements.length === 0 || height === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, placements.length]} castShadow={shadows} receiveShadow={false} frustumCulled>
      <meshStandardMaterial vertexColors roughness={0.82} flatShading />
    </instancedMesh>
  );
}

function Plants({ data, crops, stage, quality }: { data: SceneData; crops: Record<string, RegionCrop>; stage: GrowthStage; quality: QualityPreset }) {
  const placements = useMemo(() => plantPlacements(data, BUDGET[quality]), [data, quality]);
  const byForm = useMemo(() => {
    const out = new Map<CropForm, Placement[]>();
    for (const [key, list] of placements) {
      const form = crops[key]?.form ?? "fallow";
      if (form === "fallow") continue;
      out.set(form, [...(out.get(form) ?? []), ...list]);
    }
    return out;
  }, [placements, crops]);
  return (
    <>
      {[...byForm].map(([form, list]) => (
        <PlantInstances key={`${form}-${stage}-${list.length}`} form={form} stage={stage} placements={list} shadows={quality === "high"} />
      ))}
    </>
  );
}

// ------------------------------------------------------------------ camera ---

function CameraRig({ command, onAzimuth, autoRotate, interactive, home }: { command: CameraCommand | null; onAzimuth: (r: number) => void; autoRotate: boolean; interactive: boolean; home: THREE.Vector3 }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate } = useThree();
  const last = useRef(Number.NaN);

  useEffect(() => {
    const c = controls.current;
    if (!c || !command) return;
    const offset = camera.position.clone().sub(c.target);
    switch (command.kind) {
      case "reset":
        c.target.set(0, 0, 0);
        camera.position.copy(home);
        break;
      case "top":
        c.target.set(0, 0, 0);
        camera.position.set(0, 150, 0.01);
        break;
      case "rotateLeft":
      case "rotateRight":
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), ((command.kind === "rotateLeft" ? -1 : 1) * Math.PI) / 12);
        camera.position.copy(c.target).add(offset);
        break;
      case "zoomIn":
      case "zoomOut": {
        const len = THREE.MathUtils.clamp(offset.length() * (command.kind === "zoomIn" ? 0.8 : 1.25), c.minDistance, c.maxDistance);
        camera.position.copy(c.target).add(offset.setLength(len));
        break;
      }
    }
    c.update();
    invalidate();
  }, [command, camera, invalidate, home]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const a = c.getAzimuthalAngle();
    if (!(Math.abs(a - last.current) < 0.005)) {
      last.current = a;
      onAzimuth(a);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={interactive}
      autoRotate={autoRotate}
      autoRotateSpeed={0.35}
      enableDamping
      dampingFactor={0.1}
      minDistance={18}
      maxDistance={320}
      maxPolarAngle={Math.PI / 2.15}
      screenSpacePanning={false}
      target={[0, 0, 0]}
    />
  );
}

// ------------------------------------------------------------------- scene ---

export default function FieldScene({ data, crops, stage, selectedKey, onSelect, quality, active, command, onAzimuth, onContextLost, autoRotate = false, interactive = true, cameraHome }: FieldSceneProps) {
  const home = useMemo(() => (cameraHome ? new THREE.Vector3(...cameraHome) : CAMERA_HOME), [cameraHome]);
  const high = quality === "high";
  const rowPeriod = Math.max(0.6, Math.sqrt(data.areaUnits / BUDGET[quality]) * 1.25);
  const fieldCrop = crops[FIELD_KEY] ?? { form: "fallow", cropName: null };

  return (
    <Canvas
      shadows={high}
      dpr={quality === "low" ? 1 : quality === "balanced" ? [1, 1.5] : [1, 2]}
      frameloop={!active ? "never" : autoRotate ? "always" : "demand"}
      camera={{ position: home.toArray(), fov: 36, near: 0.5, far: 2400 }}
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
      <fog attach="fog" args={[tokens.sky, SCENE_SIZE * 2.2, SCENE_SIZE * 5.5]} />
      <hemisphereLight args={["#F3F1E7", "#58673F", 1.0]} />
      <directionalLight
        position={[70, 110, 40]}
        intensity={2.0}
        color="#FFF2DA"
        castShadow={high}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-bias={-0.0005}
      />
      <Ground />
      <FieldSlab polygons={data.field} bearing={data.bearing} rowPeriod={rowPeriod} />
      <Canopy polygons={data.field} crop={fieldCrop} stage={stage} y={SLAB} selected={selectedKey === FIELD_KEY} pickKey={FIELD_KEY} onPick={onSelect} />
      {data.zones.map((z) => (
        <Canopy
          key={z.key}
          polygons={z.polygons}
          crop={crops[z.key] ?? fieldCrop}
          stage={stage}
          y={SLAB + 0.02}
          selected={selectedKey === z.key}
          pickKey={z.key}
          onPick={onSelect}
        />
      ))}
      <Plants data={data} crops={crops} stage={stage} quality={quality} />
      <Outline polygons={data.field} y={SLAB + 0.08} color={selectedKey === FIELD_KEY ? tokens.lime[400] : "#F5F6F0"} width={selectedKey === FIELD_KEY ? 4 : 2} />
      {selectedKey === FIELD_KEY && <SelectionWall polygons={data.field} y={SLAB} />}
      {data.zones
        .filter((z) => z.key === selectedKey)
        .map((z) => (
          <SelectionWall key={`wall-${z.key}`} polygons={z.polygons} y={SLAB} />
        ))}
      {data.zones.map((z) => (
        <Outline key={z.key} polygons={z.polygons} y={SLAB + 0.12} color={z.key === selectedKey ? tokens.lime[400] : "#E9ECE2"} width={z.key === selectedKey ? 4 : 1.5} dashed={z.key !== selectedKey} />
      ))}
      <CameraRig command={command} onAzimuth={onAzimuth} autoRotate={autoRotate} interactive={interactive} home={home} />
    </Canvas>
  );
}
