/**
 * Procedural, stylised plant models for the field scene. Every model is original geometry
 * built from primitives, merged into one BufferGeometry with vertex colours so each crop form
 * is a single instanced draw call. Plants are drawn larger than life and at an illustrative
 * density so they read at field scale; they are not a census or a reconstruction.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { CROP_FORM_COLORS, type CropForm } from "@/domain/farm/crops";

export const GROWTH_STAGES = ["bare", "emerging", "growing", "mature", "harvested"] as const;
export type GrowthStage = (typeof GROWTH_STAGES)[number];

function part(geo: THREE.BufferGeometry, color: string, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.getAttribute("position").count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute("uv");
  return g;
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Unit-height models (≈1 scene unit tall at maturity); instance scale sets the stage. */
export function buildPlantGeometry(form: CropForm, stage: GrowthStage): THREE.BufferGeometry | null {
  const col = CROP_FORM_COLORS[form];
  if (stage === "bare" || form === "fallow") return null;
  if (stage === "harvested") {
    // Short stubble rows in straw colour (cover and broadleaf forms leave little standing).
    const stub = new THREE.CylinderGeometry(0.03, 0.04, 1, 4, 1, true);
    const parts = [-0.12, 0, 0.12].map((dx, i) => part(stub, i === 1 ? "#B79A62" : "#A3884F", M(dx, 0.5, (i - 1) * 0.05, 0.1 * (i - 1), 0, 0.12 * (i - 1))));
    stub.dispose();
    return merged(parts);
  }
  const blade = new THREE.ConeGeometry(0.06, 1, 3, 1);
  const leaf = new THREE.ConeGeometry(0.28, 1, 4, 1, true);
  const ball = new THREE.IcosahedronGeometry(0.5, 1);
  const stalk = new THREE.CylinderGeometry(0.035, 0.055, 1, 5);
  const head = new THREE.CapsuleGeometry(0.045, 0.14, 2, 4);
  const flower = new THREE.IcosahedronGeometry(0.11, 0);
  const parts: THREE.BufferGeometry[] = [];
  const mature = stage === "mature";
  switch (form) {
    case "tall_row":
      parts.push(part(stalk, col.plant, M(0, 0.5, 0, 0, 0, 0, 1, 1, 1)));
      for (let i = 0; i < 4; i++) parts.push(part(leaf, i % 2 ? "#4C8B42" : col.plant, M(0, 0.32 + i * 0.14, 0, Math.PI, (i * Math.PI) / 2.2, 0.9, 0.9, 0.55, 0.22)));
      if (mature) parts.push(part(head, col.accent, M(0, 1.06, 0, 0, 0, 0, 1.4, 1.4, 1.4)));
      break;
    case "fibre":
      parts.push(part(stalk, "#3B6E3E", M(0, 0.55, 0, 0, 0, 0, 0.8, 1.1, 0.8)));
      for (let i = 0; i < 3; i++) parts.push(part(leaf, col.plant, M(0, 0.85 + i * 0.1, 0, Math.PI, i * 2.1, 0.55, 0.7, 0.4, 0.25)));
      break;
    case "small_grain":
    case "paddy":
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const tilt = 0.18 + (i % 3) * 0.06;
        parts.push(part(blade, i % 2 ? col.plant : col.accent, M(Math.cos(a) * 0.05, 0.42, Math.sin(a) * 0.05, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt, 1, 0.84, 1)));
        if (mature && form === "small_grain") parts.push(part(head, col.accent, M(Math.cos(a) * 0.16, 0.86, Math.sin(a) * 0.16, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt)));
        if (mature && form === "paddy") parts.push(part(head, "#C9B45A", M(Math.cos(a) * 0.2, 0.74, Math.sin(a) * 0.2, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7)));
      }
      break;
    case "broadleaf":
    case "generic":
      parts.push(part(ball, col.plant, M(0, 0.32, 0, 0, 0, 0, 0.9, 0.62, 0.9)));
      parts.push(part(ball, col.accent, M(0.14, 0.42, -0.08, 0, 0, 0, 0.5, 0.42, 0.5)));
      break;
    case "oilseed_flower":
      parts.push(part(ball, col.plant, M(0, 0.4, 0, 0, 0, 0, 0.6, 0.8, 0.6)));
      if (mature || stage === "growing")
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          parts.push(part(flower, col.accent, M(Math.cos(a) * 0.16, 0.82 + (i % 2) * 0.06, Math.sin(a) * 0.16)));
        }
      break;
    case "cover":
      for (let i = 0; i < 3; i++) parts.push(part(ball, i === 1 ? col.accent : col.plant, M((i - 1) * 0.22, 0.12, (i % 2) * 0.12, 0, i, 0, 0.55, 0.3, 0.55)));
      break;
  }
  [blade, leaf, ball, stalk, head, flower].forEach((g) => g.dispose());
  return parts.length ? merged(parts) : null;
}

/** Visual height multiplier per form and stage (scene units at the reference plant size). */
export function plantScale(form: CropForm, stage: GrowthStage): number {
  const base = { tall_row: 2.4, fibre: 2.8, small_grain: 1.0, paddy: 0.95, broadleaf: 0.9, oilseed_flower: 1.2, cover: 0.55, generic: 1.0, fallow: 0 }[form];
  const s = { bare: 0, emerging: 0.28, growing: 0.65, mature: 1, harvested: 0.18 }[stage];
  return base * s;
}

/** Canopy tint opacity: lets the crop read from far away (the far "level of detail"). */
export function canopyOpacity(stage: GrowthStage): number {
  return { bare: 0, emerging: 0.18, growing: 0.5, mature: 0.72, harvested: 0.25 }[stage];
}

export function canopyColor(form: CropForm, stage: GrowthStage): string {
  if (stage === "harvested") return "#B09A6A";
  return stage === "mature" && (form === "small_grain" || form === "oilseed_flower") ? CROP_FORM_COLORS[form].accent : CROP_FORM_COLORS[form].plant;
}

/** Striped furrow texture (drawn once, shared); UVs come from scene-unit shape coordinates. */
export function makeFurrowTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, "#5C432C");
  g.addColorStop(0.18, "#7D5E3F");
  g.addColorStop(0.5, "#8C6A47");
  g.addColorStop(0.82, "#7A5B3C");
  g.addColorStop(1, "#5C432C");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  // Fine grain so the soil does not look like flat plastic.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(${i % 2 ? "40,28,18" : "170,140,100"},${0.05 + ((i * 37) % 10) / 100})`;
    ctx.fillRect((i * 53) % 64, (i * 29) % 64, 1 + (i % 2), 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
