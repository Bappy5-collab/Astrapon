/**
 * Astrapon design tokens. See docs/design-system.md for usage rules and the contrast table
 * (validated by src/theme/contrast.test.ts).
 *
 * Anchors: forest #102B22, leaf #3F6B4B, accent #C7E77A, surface #F5F6F0, ink #14231B.
 * Lime is a fill/accent: pair it with forest or ink text, never use it as text on light surfaces.
 */
export const tokens = {
  forest: {
    950: "#0A1D16",
    900: "#102B22",
    800: "#173A2D",
    700: "#22493A",
    600: "#2F5C47",
    500: "#3F6B4B", // leaf
    400: "#6E9277",
  },
  neutral: {
    0: "#FFFFFF",
    50: "#FAFBF7",
    100: "#F5F6F0", // surface
    150: "#ECEEE5",
    200: "#E2E5DA",
    300: "#CDD2C3",
    400: "#A9B0A0",
    500: "#7D8677",
    600: "#5E6759",
    700: "#48514A",
    800: "#2C3530",
    900: "#14231B", // ink
  },
  lime: {
    200: "#E4F3BC",
    300: "#D5EC9A",
    400: "#C7E77A", // accent
    500: "#A8CB55",
    600: "#86A93A",
    700: "#5E7A22",
  },
  soil: "#7A5A3C",
  clay: "#A3412C",
  amber: "#8A5A00",
  sky: "#DCE4DF",
} as const;

/** Semantic aliases used by components. */
export const color = {
  ink: tokens.neutral[900],
  inkMuted: tokens.neutral[700],
  inkSubtle: tokens.neutral[600],
  surface: tokens.neutral[100],
  surfaceRaised: tokens.neutral[0],
  surfaceSunken: tokens.neutral[150],
  line: tokens.neutral[300],
  lineStrong: tokens.neutral[400],
  forest: tokens.forest[900],
  leaf: tokens.forest[500],
  accent: tokens.lime[400],
  accentInk: tokens.forest[950],
  onForest: tokens.neutral[100],
  onForestMuted: tokens.neutral[300],
  focus: tokens.forest[500],
  danger: tokens.clay,
  warning: tokens.amber,
  scene: tokens.sky,
} as const;

/** Spacing steps in MUI units (1 unit = 8px). Use only these. */
export const SPACE = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 10] as const;

export const radius = { sm: 6, md: 10, lg: 14 } as const;

/** Three surface elevations: flat page, raised panel, floating overlay above the 3D scene. */
export const elevation = {
  flat: "none",
  raised: "0 1px 2px rgba(10, 29, 22, 0.06), 0 1px 1px rgba(10, 29, 22, 0.04)",
  overlay: "0 12px 32px -12px rgba(10, 29, 22, 0.35), 0 2px 6px rgba(10, 29, 22, 0.08)",
} as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

/** Tabular figures for metrics so columns of numbers align. */
export const numeric = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1' } as const;

/** Translucent overlay surface for controls floating over the 3D scene. */
export const overlaySurface = {
  bgcolor: "rgba(250, 251, 247, 0.94)",
  border: `1px solid ${tokens.neutral[300]}`,
  boxShadow: elevation.overlay,
  backdropFilter: "blur(8px)",
} as const;
