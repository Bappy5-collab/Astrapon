import { tokens } from "@/theme/tokens";

/** Field strips turning: rotation bands inside a rounded plot. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="8" fill={tokens.forest[700]} />
      <path d="M6 22 L14 8 L18 8 L10 22 Z" fill={tokens.lime[400]} />
      <path d="M13 22 L21 8 L24 8 L16 22 Z" fill={tokens.neutral[200]} opacity="0.9" />
      <path d="M19 22 L26 10 L26 15 L22 22 Z" fill={tokens.lime[300]} opacity="0.75" />
      <rect x="6" y="24" width="20" height="2" rx="1" fill={tokens.neutral[300]} opacity="0.6" />
    </svg>
  );
}
