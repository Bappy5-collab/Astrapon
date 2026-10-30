"use client";

import { ContactShadows, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";

import { tokens } from "@/theme/tokens";

import { CROP_COLORS, FIELD_DEPTH, ILLUSTRATIVE_STRIPS, mulberry32, type IllustrativeStrip } from "./illustrativeFarm";

export type CameraCommand = { kind: "reset" | "rotateLeft" | "rotateRight" | "zoomIn" | "zoomOut"; nonce: number };

export type SceneQuality = "full" | "reduced";

export type FarmPreviewSceneProps = {
  autoRotate: boolean;
  /** "reduced" drops shadows and caps pixel ratio for software renderers. */
  quality: SceneQuality;
  /** False while offscreen or the tab is hidden; rendering pauses entirely. */
  active: boolean;
  command: CameraCommand | null;
  onContextLost: () => void;
};

const HALF_DEPTH = FIELD_DEPTH / 2;
const FIELD_HALF_WIDTH = 28;
const CAMERA_START = new THREE.Vector3(46, 34, 52);

// ------------------------------------------------------------ instancing ---

type Placement = { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] };

function Instances({
  geometry,
  color,
  placements,
  flatShading = false,
  roughness = 0.85,
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  placements: Placement[];
  flatShading?: boolean;
  roughness?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    placements.forEach((pl, i) => {
      p.set(...pl.position);
      q.setFromEuler(e.set(...pl.rotation));
      s.set(...pl.scale);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, placements.length]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={roughness} flatShading={flatShading} />
    </instancedMesh>
  );
}

/** Grid of plant positions within a strip, with deterministic jitter. */
function gridPositions(strip: IllustrativeStrip, rowSpacing: number, plantSpacing: number, seed: number, jitter: number) {
  const rand = mulberry32(seed);
  const out: { x: number; z: number; r: () => number }[] = [];
  const half = strip.width / 2 - 0.6;
  for (let x = -half; x <= half; x += rowSpacing) {
    for (let z = -HALF_DEPTH + 1; z <= HALF_DEPTH - 1; z += plantSpacing) {
      out.push({ x: strip.x + x + (rand() - 0.5) * jitter, z: z + (rand() - 0.5) * jitter * 2, r: rand });
    }
  }
  return out;
}

// ------------------------------------------------------------------ crops ---

function MaizeStrip({ strip }: { strip: IllustrativeStrip }) {
  const colors = CROP_COLORS.maize;
  const geo = useMemo(
    () => ({
      stalk: new THREE.CylinderGeometry(0.05, 0.08, 1, 5),
      leaf: new THREE.ConeGeometry(0.55, 1, 4, 1, true),
      tassel: new THREE.ConeGeometry(0.12, 0.45, 5),
    }),
    [],
  );
  const { stalks, leaves, tassels } = useMemo(() => {
    const stalks: Placement[] = [];
    const leaves: Placement[] = [];
    const tassels: Placement[] = [];
    for (const { x, z, r } of gridPositions(strip, 0.95, 0.75, 11, 0.12)) {
      const h = 2.1 + r() * 0.6;
      const yaw = r() * Math.PI;
      stalks.push({ position: [x, h / 2, z], rotation: [0, 0, 0], scale: [1, h, 1] });
      leaves.push({ position: [x, h * 0.55, z], rotation: [Math.PI, yaw, 0], scale: [1, h * 0.7, 0.18] });
      tassels.push({ position: [x, h + 0.18, z], rotation: [0, yaw, 0], scale: [1, 1, 1] });
    }
    return { stalks, leaves, tassels };
  }, [strip]);
  return (
    <group>
      <Instances geometry={geo.stalk} color={colors.plant} placements={stalks} />
      <Instances geometry={geo.leaf} color="#4B8A41" placements={leaves} flatShading />
      <Instances geometry={geo.tassel} color={colors.accent} placements={tassels} flatShading />
    </group>
  );
}

function SoybeanStrip({ strip }: { strip: IllustrativeStrip }) {
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.42, 1), []);
  const placements = useMemo<Placement[]>(
    () =>
      gridPositions(strip, 0.76, 0.6, 23, 0.1).map(({ x, z, r }) => {
        const s = 0.85 + r() * 0.35;
        return { position: [x, 0.32 * s, z], rotation: [r() * 0.4, r() * Math.PI, 0], scale: [s, s * 0.78, s] };
      }),
    [strip],
  );
  return <Instances geometry={geo} color={CROP_COLORS.soybean.plant} placements={placements} flatShading roughness={0.75} />;
}

function WheatStrip({ strip }: { strip: IllustrativeStrip }) {
  const geo = useMemo(
    () => ({ blade: new THREE.ConeGeometry(0.07, 1, 4), head: new THREE.CapsuleGeometry(0.05, 0.16, 2, 4) }),
    [],
  );
  const { blades, heads } = useMemo(() => {
    const blades: Placement[] = [];
    const heads: Placement[] = [];
    for (const { x, z, r } of gridPositions(strip, 0.36, 0.32, 37, 0.14)) {
      const h = 0.85 + r() * 0.3;
      const tiltX = (r() - 0.5) * 0.25;
      const tiltZ = (r() - 0.5) * 0.25;
      blades.push({ position: [x, h / 2, z], rotation: [tiltX, 0, tiltZ], scale: [1, h, 1] });
      heads.push({ position: [x + tiltZ * -h * 0.5, h + 0.05, z + tiltX * h * 0.5], rotation: [tiltX, 0, tiltZ], scale: [1, 1, 1] });
    }
    return { blades, heads };
  }, [strip]);
  return (
    <group>
      <Instances geometry={geo.blade} color={CROP_COLORS.wheat.plant} placements={blades} />
      <Instances geometry={geo.head} color={CROP_COLORS.wheat.accent} placements={heads} />
    </group>
  );
}

function CoverStrip({ strip }: { strip: IllustrativeStrip }) {
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.24, 0), []);
  const placements = useMemo<Placement[]>(() => {
    const rand = mulberry32(53);
    const out: Placement[] = [];
    for (let i = 0; i < 2600; i++) {
      const x = strip.x + (rand() - 0.5) * (strip.width - 1.2);
      const z = (rand() - 0.5) * (FIELD_DEPTH - 2);
      const s = 0.7 + rand() * 0.8;
      out.push({ position: [x, 0.08 * s, z], rotation: [0, rand() * Math.PI, 0], scale: [s, s * 0.5, s] });
    }
    return out;
  }, [strip]);
  return <Instances geometry={geo} color={CROP_COLORS.cover.plant} placements={placements} flatShading />;
}

const STRIP_RENDERERS = { maize: MaizeStrip, soybean: SoybeanStrip, wheat: WheatStrip, cover: CoverStrip } as const;

// ----------------------------------------------------------- landscape ---

function Ground() {
  const furrowGeo = useMemo(() => new THREE.BoxGeometry(0.18, 0.04, FIELD_DEPTH - 0.6), []);
  const furrows = useMemo<Placement[]>(() => {
    const out: Placement[] = [];
    for (const strip of ILLUSTRATIVE_STRIPS) {
      if (strip.crop === "cover") continue;
      const spacing = strip.crop === "wheat" ? 0.72 : strip.crop === "soybean" ? 0.76 : 0.95;
      for (let x = -strip.width / 2 + 0.6 + spacing / 2; x < strip.width / 2 - 0.6; x += spacing) {
        out.push({ position: [strip.x + x, 0.11, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
      }
    }
    return out;
  }, []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[420, 420]} />
        <meshStandardMaterial color="#9DAA79" roughness={1} />
      </mesh>
      {ILLUSTRATIVE_STRIPS.map((s) => (
        <mesh key={s.id} position={[s.x, 0.04, 0]} receiveShadow>
          <boxGeometry args={[s.width - 0.3, 0.12, FIELD_DEPTH]} />
          <meshStandardMaterial color={CROP_COLORS[s.crop].soil} roughness={1} />
        </mesh>
      ))}
      <Instances geometry={furrowGeo} color="#5B412A" placements={furrows} roughness={1} />
      {/* Farm track along the near edge */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, HALF_DEPTH + 3]} receiveShadow>
        <planeGeometry args={[FIELD_HALF_WIDTH * 2 + 10, 3]} />
        <meshStandardMaterial color={tokens.neutral[300]} roughness={1} />
      </mesh>
    </group>
  );
}

function FieldBoundary() {
  const y = 0.25;
  const w = FIELD_HALF_WIDTH;
  const d = HALF_DEPTH + 0.4;
  return (
    <Line
      points={[
        [-w, y, -d],
        [w, y, -d],
        [w, y, d],
        [-w, y, d],
        [-w, y, -d],
      ]}
      color={tokens.lime[400]}
      lineWidth={2.5}
      dashed={false}
    />
  );
}

function Shelterbelt() {
  const geo = useMemo(
    () => ({ crown: new THREE.ConeGeometry(1.6, 4.5, 7), trunk: new THREE.CylinderGeometry(0.18, 0.25, 1.4, 5) }),
    [],
  );
  const { crowns, trunks } = useMemo(() => {
    const rand = mulberry32(97);
    const crowns: Placement[] = [];
    const trunks: Placement[] = [];
    for (let x = -FIELD_HALF_WIDTH - 6; x <= FIELD_HALF_WIDTH + 6; x += 3.2 + rand() * 1.4) {
      const z = -HALF_DEPTH - 6 - rand() * 2.5;
      const s = 0.8 + rand() * 0.6;
      trunks.push({ position: [x, 0.7 * s, z], rotation: [0, 0, 0], scale: [s, s, s] });
      crowns.push({ position: [x, (1.4 + 2.25) * s, z], rotation: [0, rand() * Math.PI, 0], scale: [s, s, s] });
    }
    return { crowns, trunks };
  }, []);
  return (
    <group>
      <Instances geometry={geo.trunk} color="#5A4330" placements={trunks} />
      <Instances geometry={geo.crown} color={tokens.forest[600]} placements={crowns} flatShading />
    </group>
  );
}

// ------------------------------------------------------------- camera ---

function CameraRig({ autoRotate, command }: { autoRotate: boolean; command: CameraCommand | null }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const c = controls.current;
    if (!c || !command) return;
    const offset = camera.position.clone().sub(c.target);
    switch (command.kind) {
      case "reset":
        c.reset();
        break;
      case "rotateLeft":
      case "rotateRight":
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), ((command.kind === "rotateLeft" ? -1 : 1) * Math.PI) / 12);
        camera.position.copy(c.target).add(offset);
        break;
      case "zoomIn":
      case "zoomOut": {
        const len = THREE.MathUtils.clamp(offset.length() * (command.kind === "zoomIn" ? 0.85 : 1.18), c.minDistance, c.maxDistance);
        camera.position.copy(c.target).add(offset.setLength(len));
        break;
      }
    }
    c.update();
    invalidate();
  }, [command, camera, invalidate]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      autoRotate={autoRotate}
      autoRotateSpeed={0.45}
      minDistance={22}
      maxDistance={140}
      maxPolarAngle={Math.PI / 2.2}
      target={[0, 0, 0]}
    />
  );
}

// -------------------------------------------------------------- scene ---

export default function FarmPreviewScene({ autoRotate, quality, active, command, onContextLost }: FarmPreviewSceneProps) {
  const full = quality === "full";
  return (
    <Canvas
      shadows={full}
      dpr={full ? [1, 2] : 1}
      frameloop={!active ? "never" : autoRotate ? "always" : "demand"}
      camera={{ position: CAMERA_START.toArray(), fov: 38, near: 0.5, far: 600 }}
      gl={{ antialias: full, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          onContextLost();
        });
      }}
      aria-hidden="true"
    >
      <color attach="background" args={[tokens.sky]} />
      <fog attach="fog" args={[tokens.sky, 120, 320]} />
      <hemisphereLight args={["#F4F1E6", "#5D6B45", 0.9]} />
      <directionalLight
        position={[40, 60, 25]}
        intensity={2.1}
        color="#FFF4DE"
        castShadow={full}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.0004}
      />
      <Ground />
      {ILLUSTRATIVE_STRIPS.map((strip) => {
        const Renderer = STRIP_RENDERERS[strip.crop];
        return <Renderer key={strip.id} strip={strip} />;
      })}
      <FieldBoundary />
      <Shelterbelt />
      {full && <ContactShadows position={[0, 0.01, 0]} scale={120} opacity={0.25} blur={2.5} far={20} frames={1} />}
      <CameraRig autoRotate={autoRotate} command={command} />
    </Canvas>
  );
}
