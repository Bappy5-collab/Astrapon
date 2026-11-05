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
  { use: "Home hero title on deepest forest", fg: tokens.neutral[50], bg: tokens.forest[950], min: 4.5 },
  { use: "Surface text on deepest forest (hero chips, globe card)", fg: color.onForest, bg: tokens.forest[950], min: 4.5 },
  { use: "Accent text on hero glow (forest 700, worst case)", fg: color.accent, bg: tokens.forest[700], min: 4.5 },
  { use: "Muted text on hero glow (forest 700, worst case)", fg: color.onForestMuted, bg: tokens.forest[700], min: 4.5 },
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
  // Evidence-class and job-status chips (src/components/evidence).
  { use: "Observed (satellite) chip", fg: "#0F3B57", bg: "#DCEBF5", min: 4.5 },
  { use: "Model-derived chip", fg: "#3E2257", bg: "#EFE6F6", min: 4.5 },
  { use: "Survey / ground chip", fg: "#1D3B1B", bg: "#E3EFDF", min: 4.5 },
  { use: "Hypothetical / stale chip", fg: "#5A3A00", bg: "#FBE7C6", min: 4.5 },
  { use: "Queued / running chip", fg: "#12344F", bg: "#E5EEF6", min: 4.5 },
  { use: "Failed / no coverage chip", fg: "#6E2A1A", bg: "#F6DED6", min: 4.5 },
  { use: "Chart marks: below-normal pole on raised panel (non-text)", fg: "#B0652A", bg: color.surfaceRaised, min: 3 },
  { use: "Chart marks: above-normal pole on raised panel (non-text)", fg: "#1F7FB0", bg: color.surfaceRaised, min: 3 },
  { use: "Chart marks: single series (leaf) on raised panel (non-text)", fg: "#3F6B4B", bg: color.surfaceRaised, min: 3 },
  // Phase 8 farmer-friendly layout (step guide, section badges, result summary, status chips).
  { use: "Step-guide body on forest", fg: tokens.neutral[300], bg: tokens.forest[900], min: 4.5 },
  { use: "Progress label on forest", fg: tokens.neutral[200], bg: tokens.forest[900], min: 4.5 },
  { use: "Light chip text on forest-700 (Ranked first)", fg: tokens.neutral[100], bg: tokens.forest[700], min: 4.5 },
  { use: "Forest-800 badge icon/number on lime-200", fg: tokens.forest[800], bg: tokens.lime[200], min: 4.5 },
  { use: "Forest text on lime-200 (next step, done chip)", fg: tokens.forest[900], bg: tokens.lime[200], min: 4.5 },
  { use: "Muted text on neutral-200 (to-do chip)", fg: color.inkMuted, bg: tokens.neutral[200], min: 4.5 },
  { use: "Forest-600 link text on raised panel (More details)", fg: tokens.forest[600], bg: color.surfaceRaised, min: 4.5 },
  { use: "Eyebrow (leaf) on surface", fg: tokens.forest[500], bg: color.surface, min: 4.5 },
  { use: "Danger title on raised panel", fg: tokens.clay, bg: color.surfaceRaised, min: 4.5 },
  { use: "Danger badge on pale clay", fg: tokens.clay, bg: "#F6DED6", min: 4.5 },
  { use: "Better-list heading on pale lime", fg: tokens.forest[800], bg: "#F4F9E6", min: 4.5 },
  { use: "Worse-list heading on pale clay", fg: tokens.clay, bg: "#FBF1ED", min: 4.5 },
  { use: "Step number (lime) on forest-900 tile", fg: tokens.lime[400], bg: tokens.forest[900], min: 4.5 },
];
