"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { mulberry32 } from "@/components/scene/random";
import { tokens } from "@/theme/tokens";

import type { GlobePlace } from "./places";

export type EarthSceneProps = {
  dots: Float32Array | null;
  places: GlobePlace[];
  active: number;
  animate: boolean;
  running: boolean;
  low: boolean;
  onContextLost: () => void;
};

const R = 1;
const TILT = (23.4 * Math.PI) / 180;

/** Latitude/longitude (degrees) to a point on the sphere (three-globe convention). */
export function toXYZ(lat: number, lon: number, r = R): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Globe rotation (about y) that turns longitude `lon` towards the camera. */
const facing = (lon: number) => -Math.PI / 2 - (lon * Math.PI) / 180;

const atmosphereShader = {
  uniforms: { glow: { value: new THREE.Color(tokens.lime[400]) } },
  vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 glow; varying vec3 vN; void main(){ float i = pow(0.68 - dot(vN, vec3(0.0,0.0,1.0)), 3.2); gl_FragColor = vec4(glow, 1.0) * i * 0.75; }`,
};

function Atmosphere() {
  const mat = useMemo(() => new THREE.ShaderMaterial({ ...atmosphereShader, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh scale={1.13} material={mat}>
      <sphereGeometry args={[R, 64, 64]} />
    </mesh>
  );
}

function LandDots({ dots, low }: { dots: Float32Array; low: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const step = low ? 2 : 1;
  const count = Math.floor(dots.length / 2 / step);
  const geo = useMemo(() => new THREE.CircleGeometry(0.0062, 6), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const tropic = new THREE.Color(tokens.lime[400]);
    const temperate = new THREE.Color("#7FC79B");
    const cold = new THREE.Color("#B9D7C8");
    for (let i = 0; i < count; i++) {
      const lat = dots[i * 2 * step]!, lon = dots[i * 2 * step + 1]!;
      const p = toXYZ(lat, lon, R * 1.002);
      o.position.copy(p);
      o.lookAt(p.clone().multiplyScalar(2));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      const a = Math.abs(lat);
      c.copy(a < 30 ? tropic : a < 55 ? temperate : cold).lerp(a < 30 ? temperate : cold, (a % 25) / 60);
      m.setColorAt(i, c);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [dots, count, step]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** A field marker: pulsing ring, light beam and a two-leaf sprout (illustrative). */
function Marker({ place, active, animate }: { place: GlobePlace; active: boolean; animate: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const sprout = useRef<THREE.Group>(null);
  const pos = useMemo(() => toXYZ(place.lat, place.lon, R * 1.004), [place]);
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pos.clone().normalize()), [pos]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ring.current) {
      const k = animate ? (t * 0.8 + place.lat) % 1 : 0.5;
      ring.current.scale.setScalar(1 + k * (active ? 2.6 : 1.6));
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (active ? 0.9 : 0.55);
    }
    if (sprout.current) sprout.current.scale.setScalar(active ? 1.6 + (animate ? Math.sin(t * 3) * 0.08 : 0) : 1);
  });
  const color = active ? tokens.lime[400] : "#E9F5D0";
  return (
    <group position={pos} quaternion={quat}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <circleGeometry args={[0.014, 20]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.002}>
        <ringGeometry args={[0.018, 0.024, 32]} />
        <meshBasicMaterial color={color} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh position-y={active ? 0.12 : 0.06}>
        <cylinderGeometry args={[0.0018, 0.0018, active ? 0.24 : 0.12, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} toneMapped={false} />
      </mesh>
      <group ref={sprout} position-y={0.004}>
        <mesh position-y={0.012}>
          <cylinderGeometry args={[0.0016, 0.0022, 0.024, 6]} />
          <meshStandardMaterial color="#5E9B3C" />
        </mesh>
        <mesh position={[0.008, 0.024, 0]} rotation-z={-0.7} scale={[1, 0.45, 0.6]}>
          <sphereGeometry args={[0.011, 10, 8]} />
          <meshStandardMaterial color={tokens.lime[500]} />
        </mesh>
        <mesh position={[-0.008, 0.02, 0]} rotation-z={0.7} scale={[1, 0.45, 0.6]}>
          <sphereGeometry args={[0.009, 10, 8]} />
          <meshStandardMaterial color={tokens.lime[400]} />
        </mesh>
      </group>
    </group>
  );
}

/** Illustrative satellite on an inclined orbit, with a beam to the active field marker. */
function Satellite({ globe, target, animate }: { globe: React.RefObject<THREE.Group | null>; target: THREE.Vector3; animate: boolean }) {
  const sat = useRef<THREE.Group>(null);
  const holder = useRef<THREE.Group>(null);
  const beamRef = useRef<THREE.Line | null>(null);
  const tmp = useRef({ world: new THREE.Vector3(), local: new THREE.Vector3() });
  useEffect(() => {
    // Created imperatively (three.js objects are mutated every frame) and disposed on unmount.
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineDashedMaterial({ color: tokens.lime[300], dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    const h = holder.current;
    h?.add(line);
    beamRef.current = line;
    return () => {
      h?.remove(line);
      geo.dispose();
      mat.dispose();
      beamRef.current = null;
    };
  }, []);
  useFrame(({ clock }) => {
    const beam = beamRef.current;
    const { world, local } = tmp.current;
    const t = animate ? clock.getElapsedTime() * 0.22 : 0.9;
    const s = sat.current;
    if (!s) return;
    const r = 1.55;
    s.position.set(Math.cos(t) * r, Math.sin(t) * r * 0.45 + 0.35, Math.sin(t) * r * 0.9);
    s.rotation.set(t * 0.6, t, 0);
    const g = globe.current;
    if (!g || !beam) return;
    // The beam lives in the tilted frame (like the satellite); the marker spins inside it.
    g.updateMatrix();
    local.copy(target).applyMatrix4(g.matrix);
    g.localToWorld(world.copy(target));
    const pos = beam.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, s.position.x, s.position.y, s.position.z);
    pos.setXYZ(1, local.x, local.y, local.z);
    pos.needsUpdate = true;
    beam.computeLineDistances();
    // Show the beam only while the field faces the viewer.
    beam.visible = world.z > 0.15;
  });
  return (
    <>
      <group ref={holder} />
      <group ref={sat} scale={0.065}>
        <mesh>
          <boxGeometry args={[0.6, 0.6, 0.9]} />
          <meshStandardMaterial color="#D9DDD2" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[1.1, 0, 0]}>
          <boxGeometry args={[1.5, 0.04, 0.7]} />
          <meshStandardMaterial color="#244C7A" metalness={0.4} roughness={0.3} />
        </mesh>
        <mesh position={[-1.1, 0, 0]}>
          <boxGeometry args={[1.5, 0.04, 0.7]} />
          <meshStandardMaterial color="#244C7A" metalness={0.4} roughness={0.3} />
        </mesh>
      </group>
    </>
  );
}

function Stars({ low }: { low: boolean }) {
  const geo = useMemo(() => {
    const rnd = mulberry32(7);
    const n = low ? 250 : 700;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiplyScalar(8 + rnd() * 6);
      arr.set([v.x, v.y, v.z], i * 3);
    }
    return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(arr, 3));
  }, [low]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <points geometry={geo}>
      <pointsMaterial color="#DCE8DD" size={0.025} sizeAttenuation transparent opacity={0.7} />
    </points>
  );
}

function Globe({ dots, places, active, animate, low }: Omit<EarthSceneProps, "running" | "onContextLost">) {
  const spin = useRef<THREE.Group>(null);
  const target = useMemo(() => toXYZ(places[active]!.lat, places[active]!.lon, R * 1.004), [places, active]);
  const tilt = useRef<THREE.Group>(null);
  const goal = useRef({ y: 0, x: 0, ready: false });
  const { invalidate } = useThree();
  useEffect(() => {
    // Turn (longitude) and tip (latitude) so the active place comes to the centre, the short way round.
    const g = spin.current, tg = tilt.current;
    const p = places[active]!;
    const wantY = facing(p.lon), wantX = (p.lat * Math.PI) / 180 * 0.85;
    if (!goal.current.ready && g && tg) {
      g.rotation.y = wantY;
      tg.rotation.x = wantX;
      goal.current = { y: wantY, x: wantX, ready: true };
    } else {
      const cur = g?.rotation.y ?? wantY;
      let d = (wantY - cur) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      goal.current = { y: cur + d, x: wantX, ready: true };
      if (!animate && g && tg) {
        g.rotation.y = goal.current.y;
        tg.rotation.x = wantX;
      }
    }
    invalidate();
  }, [active, places, animate, invalidate]);
  useFrame((_, dt) => {
    const g = spin.current, tg = tilt.current;
    if (!g || !tg || !animate) return;
    goal.current.y += dt * 0.035; // slow drift so the Earth keeps turning between places
    const k = Math.min(1, dt * 2.2);
    g.rotation.y += (goal.current.y - g.rotation.y) * k;
    tg.rotation.x += (goal.current.x - tg.rotation.x) * k;
  });
  return (
    <group rotation-z={TILT * 0.25}>
    <group ref={tilt}>
      <group ref={spin}>
        <mesh>
          <sphereGeometry args={[R, low ? 48 : 96, low ? 48 : 96]} />
          <meshStandardMaterial color="#0E3B3A" roughness={0.85} metalness={0.05} emissive="#06201D" emissiveIntensity={0.6} />
        </mesh>
        {dots && <LandDots dots={dots} low={low} />}
        {places.map((p, i) => (
          <Marker key={p.key} place={p} active={i === active} animate={animate} />
        ))}
      </group>
      <Satellite globe={spin} target={target} animate={animate} />
    </group>
    </group>
  );
}

export default function EarthScene(props: EarthSceneProps) {
  const { running, animate, low, onContextLost } = props;
  return (
    <Canvas
      dpr={low ? 1 : [1, 1.75]}
      frameloop={!running ? "never" : animate ? "always" : "demand"}
      camera={{ position: [0, 0, 3.75], fov: 38, near: 0.1, far: 50 }}
      gl={{ antialias: !low, alpha: true, powerPreference: low ? "low-power" : "high-performance" }}
      onCreated={({ gl }) => gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onContextLost(); })}
      aria-hidden="true"
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[-3, 2, 4]} intensity={1.6} color="#FFF4DD" />
      <directionalLight position={[3, -1, -2]} intensity={0.35} color="#7FC7F0" />
      <Stars low={low} />
      <Atmosphere />
      <Globe {...props} />
    </Canvas>
  );
}
