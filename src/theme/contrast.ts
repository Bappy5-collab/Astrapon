import { color, tokens } from "./tokens";

/** WCAG 2.x relative luminance of an sRGB hex colour. */
export function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Every text/background pairing the UI actually uses. `min` is 4.5 for body text, 3 for large
 * text (≥ 24px, or ≥ 18.7px bold) and non-text UI such as focus rings and input borders.
 */
export const PAIRINGS: { use: string; fg: string; bg: string; min: 4.5 | 3 }[] = [
  { use: "Body text on surface", fg: color.ink, bg: color.surface, min: 4.5 },
  { use: "Body text on raised panel", fg: color.ink, bg: color.surfaceRaised, min: 4.5 },
  { use: "Secondary text on surface", fg: color.inkMuted, bg: color.surface, min: 4.5 },
  { use: "Secondary text on raised panel", fg: color.inkMuted, bg: color.surfaceRaised, min: 4.5 },
  { use: "Subtle text (captions) on raised panel", fg: color.inkSubtle, bg: color.surfaceRaised, min: 4.5 },
  { use: "Subtle text on sunken surface", fg: color.inkSubtle, bg: color.surfaceSunken, min: 4.5 },
  { use: "Leaf text (links, overlines) on surface", fg: color.leaf, bg: color.surface, min: 4.5 },
  { use: "Leaf text on raised panel", fg: color.leaf, bg: color.surfaceRaised, min: 4.5 },
  { use: "Surface text on forest (header, hero)", fg: color.onForest, bg: color.forest, min: 4.5 },
  { use: "Muted text on forest", fg: color.onForestMuted, bg: color.forest, min: 4.5 },
  { use: "Accent text on forest", fg: color.accent, bg: color.forest, min: 4.5 },
  { use: "Accent text on deepest forest (footer)", fg: color.accent, bg: tokens.forest[950], min: 4.5 },
  { use: "Muted text on deepest forest (footer)", fg: color.onForestMuted, bg: tokens.forest[950], min: 4.5 },
  { use: "Forest text on accent (active nav, chips)", fg: color.accentInk, bg: color.accent, min: 4.5 },
  { use: "Surface text on primary button", fg: tokens.neutral[50], bg: tokens.forest[800], min: 4.5 },
  { use: "Surface text on leaf fill", fg: tokens.neutral[50], bg: color.leaf, min: 4.5 },
  { use: "Danger text on raised panel", fg: color.danger, bg: color.surfaceRaised, min: 4.5 },
  { use: "Warning text on raised panel", fg: color.warning, bg: color.surfaceRaised, min: 4.5 },
  { use: "Ink text on scene background", fg: color.ink, bg: color.scene, min: 4.5 },
  { use: "Ink text on accent-200 (selected rows)", fg: color.ink, bg: tokens.lime[200], min: 4.5 },
  { use: "Focus ring (leaf) against surface", fg: color.focus, bg: color.surface, min: 3 },
  { use: "Focus ring (accent) against forest", fg: color.accent, bg: color.forest, min: 3 },
  { use: "Input border against raised panel", fg: tokens.neutral[500], bg: color.surfaceRaised, min: 3 },
  { use: "Large display heading (forest) on surface", fg: color.forest, bg: color.surface, min: 3 },
];
