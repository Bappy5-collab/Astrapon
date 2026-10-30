/**
 * Layout for the *illustrative* preview farm. Nothing here represents a real
 * field, crop calendar, or measurement; it exists to exercise the 3D engine and
 * visual language until real field geometry and simulation outputs are wired in.
 */
export type IllustrativeCrop = "maize" | "soybean" | "wheat" | "cover";

export type IllustrativeStrip = {
  id: string;
  crop: IllustrativeCrop;
  label: string;
  /** Centre x of the strip in scene units (1 unit ≈ illustrative metre scale, not to survey). */
  x: number;
  width: number;
};

export const FIELD_DEPTH = 44;

export const ILLUSTRATIVE_STRIPS: IllustrativeStrip[] = [
  { id: "a", crop: "maize", label: "Tall row crop", x: -21, width: 13 },
  { id: "b", crop: "soybean", label: "Broadleaf legume", x: -7, width: 13 },
  { id: "c", crop: "wheat", label: "Small grain", x: 7, width: 13 },
  { id: "d", crop: "cover", label: "Cover crop", x: 21, width: 13 },
];

export const CROP_COLORS: Record<IllustrativeCrop, { plant: string; accent: string; soil: string }> = {
  maize: { plant: "#3F7A3A", accent: "#E3C770", soil: "#6E5034" },
  soybean: { plant: "#2F6B3F", accent: "#4F8F4F", soil: "#76563A" },
  wheat: { plant: "#C9A443", accent: "#E2C46B", soil: "#80603F" },
  cover: { plant: "#7FAE4E", accent: "#A9C82E", soil: "#7A5A3C" },
};

/** Small deterministic PRNG so plant jitter is identical on every render. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
