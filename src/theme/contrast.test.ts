import { describe, expect, it } from "vitest";

import { contrastRatio, PAIRINGS } from "./contrast";
import { tokens } from "./tokens";

describe("contrast", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });

  it.each(PAIRINGS)("$use ≥ $min:1", ({ fg, bg, min }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("lime accent is never usable as text on light surfaces", () => {
    expect(contrastRatio(tokens.lime[400], tokens.neutral[100])).toBeLessThan(3);
  });
});
