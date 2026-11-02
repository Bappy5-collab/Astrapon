import { describe, expect, it } from "vitest";

import { formatterFor } from "./format";

describe("deterministic formatting (no Intl, identical on server and browser)", () => {
  it("formats English dates and numbers unambiguously", () => {
    const f = formatterFor("en");
    expect(f.date("2024-04-17")).toBe("17 April 2024");
    expect(f.shortDate("2025-12-31")).toBe("31 Dec 2025");
    expect(f.month("2024-02")).toBe("February 2024");
    expect(f.dayMonth("05-01")).toBe("1 May");
    expect(f.num(1234.56, 1)).toBe("1,234.6");
    expect(f.num(0.8934, 3)).toBe("0.893");
    expect(f.num(5, 2)).toBe("5");
    expect(f.num(-20, 0)).toBe("−20");
    expect(f.num(null)).toBe("—");
    expect(f.pct(0.311)).toBe("31%");
  });
  it("uses Bangla digits and month names", () => {
    const f = formatterFor("bn");
    expect(f.date("2024-04-17")).toBe("১৭ এপ্রিল ২০২৪");
    expect(f.num(176.5, 1)).toBe("১৭৬.৫");
    expect(f.int(1611)).toBe("১,৬১১");
  });
});
