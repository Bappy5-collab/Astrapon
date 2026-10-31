import { describe, expect, it } from "vitest";

import { pointInRing } from "@/domain/geo/boundary";

import { byYear, monthly, type DailySeries, type PeriodValue } from "./aggregate";
import { lonLatToSinusoidal, pixelFootprint, powerCell, sinusoidalToLonLat, fractionInside } from "./footprint";
import { annualPeakNdvi, anomalies, climatology, countDays, drySpells, ndviTrendPerDecade, seasonal, theilSen } from "./indicators";

function series(start: string, values: (number | null)[], variable = "X"): DailySeries {
  const d = new Date(`${start}T00:00:00Z`);
  const dates = values.map(() => {
    const s = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
    return s;
  });
  return { variable, unit: "u", dates, values };
}

describe("monthly aggregation", () => {
  it("sums and averages complete months", () => {
    const s = series("2024-02-01", Array.from({ length: 29 }, () => 2));
    const [sum] = monthly(s, "sum");
    expect(sum).toMatchObject({ value: 58, validCount: 29, expectedCount: 29, periodStart: "2024-02-01", periodEnd: "2024-02-29" });
    expect(monthly(s, "mean")[0]!.value).toBe(2);
  });

  it("leaves a month empty below 90% completeness and never scales a partial sum", () => {
    const vals: (number | null)[] = Array.from({ length: 31 }, (_, i) => (i < 27 ? 1 : null));
    const [m] = monthly(series("2024-01-01", vals), "sum");
    expect(m).toMatchObject({ value: null, validCount: 27, expectedCount: 31 });
    const ok = Array.from({ length: 31 }, (_, i) => (i < 28 ? 1 : null));
    expect(monthly(series("2024-01-01", ok), "sum")[0]!.value).toBe(28);
  });

  it("treats days outside the series as missing, not zero", () => {
    const [m] = monthly(series("2024-03-20", Array.from({ length: 12 }, () => 5)), "sum");
    expect(m).toMatchObject({ value: null, validCount: 12, expectedCount: 31 });
  });

  it("keeps only complete calendar years", () => {
    const s = series("2023-12-31", Array.from({ length: 367 }, () => 0));
    expect([...byYear(s).keys()]).toEqual([2024]);
  });
});

describe("indicators", () => {
  it("counts threshold days and refuses incomplete years", () => {
    const vals = Array.from({ length: 365 }, (_, i) => (i < 10 ? -2 : 5));
    expect(countDays(2023, vals, (v) => v <= 0).value).toBe(10);
    const gappy = vals.map((v, i) => (i % 10 === 0 ? null : v));
    expect(countDays(2023, gappy, (v) => v <= 0).value).toBeNull();
  });

  it("measures dry spells without assuming missing days are dry", () => {
    const p = Array.from({ length: 365 }, () => 5) as (number | null)[];
    for (let i = 100; i < 115; i++) p[i] = 0; // 15 dry days
    for (let i = 200; i < 212; i++) p[i] = 0.5; // 12 dry days
    p[206] = null; // the gap ends the run: 6 + 5
    const d = drySpells(2023, p);
    expect(d.longest.value).toBe(15);
    expect(d.spells.value).toBe(1);
  });

  const months = (from: number, to: number, f: (y: number, m: number) => number | null): PeriodValue[] => {
    const out: PeriodValue[] = [];
    for (let y = from; y <= to; y++)
      for (let m = 1; m <= 12; m++) {
        const ms = String(m).padStart(2, "0");
        out.push({ variable: "P", unit: "mm", aggregation: "sum", periodStart: `${y}-${ms}-01`, periodEnd: `${y}-${ms}-28`, value: f(y, m), validCount: 28, expectedCount: 28 });
      }
    return out;
  };

  it("computes a 1991–2020 normal and anomalies, and needs 24 baseline years", () => {
    const m = months(1985, 2024, (y, mo) => (mo === 7 ? (y === 2024 ? 150 : 100) : 50));
    const clim = climatology(m);
    expect(clim[6]).toMatchObject({ month: 7, value: 100, years: 30 });
    const july2024 = anomalies(m, clim, true).find((a) => a.periodStart === "2024-07-01")!;
    expect(july2024).toMatchObject({ anomaly: 50, percentOfNormal: 150 });
    const sparse = months(1991, 2010, () => 1);
    expect(climatology(sparse)[0]!.value).toBeNull();
  });

  it("builds hemisphere-neutral seasons with December from the previous year", () => {
    const m = months(2022, 2023, (y, mo) => (mo === 12 && y === 2022 ? 30 : 10));
    const djf = seasonal(m, "sum").find((s) => s.season === "DJF" && s.year === 2023)!;
    expect(djf.value).toBe(50);
    expect(seasonal(m, "sum").find((s) => s.season === "DJF" && s.year === 2022)!.value).toBeNull();
  });

  it("Theil–Sen ignores a single outlier", () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: 2000 + i, y: 0.5 + 0.01 * i }));
    pts[4]!.y = 0.1;
    expect(theilSen(pts)).toBeCloseTo(0.01, 6);
  });

  it("NDVI peaks need enough good composites; trend needs enough years", () => {
    const comps = [] as { date: string; value: number | null }[];
    for (let y = 2010; y < 2020; y++) for (let k = 0; k < 23; k++) comps.push({ date: `${y}-${String(1 + Math.floor(k / 2)).padStart(2, "0")}-01`, value: k < 9 ? 0.5 + (y - 2010) * 0.01 + k * 0.001 : null });
    const peaks = annualPeakNdvi(comps);
    expect(peaks[0]!.value).toBeCloseTo(0.508, 4);
    expect(ndviTrendPerDecade(peaks).slope).toBeCloseTo(0.1, 4);
    const thin = comps.map((c, i) => (i % 23 >= 5 ? { ...c, value: null } : c));
    expect(annualPeakNdvi(thin).every((p) => p.value === null)).toBe(true);
  });
});

describe("footprints", () => {
  it("snaps to the POWER ½° × ⅝° cell and shares its key", () => {
    const a = powerCell(42.1, -93.8);
    expect(a.centre).toEqual({ lat: 42, lon: -93.75 });
    expect(powerCell(41.9, -93.6).key).toBe(a.key);
    expect(powerCell(42.3, -93.8).key).not.toBe(a.key);
  });

  it("round-trips the MODIS sinusoidal projection and builds pixel squares", () => {
    const [x, y] = lonLatToSinusoidal([-93.8015, 42.0985]);
    const [lon, lat] = sinusoidalToLonLat(x, y);
    expect(lon).toBeCloseTo(-93.8015, 9);
    expect(lat).toBeCloseTo(42.0985, 9);
    // ORNL grid from a live response: the centre pixel of a 9×9 grid contains the requested point.
    const g = { xll: -7740333.97, yll: 4680153.37, cellsize: 231.656358264, nrows: 9, ncols: 9 };
    const ring = pixelFootprint(g, 4, 4);
    expect(fractionInside(ring, { type: "Polygon", coordinates: [ring] })).toBe(1);
    expect(pointInRing([-93.8015, 42.0985], ring)).toBe(true);
    // Far from the central meridian the pixel is sheared: its west edge shifts by more than its width.
    expect(Math.abs(ring[0]![0] - ring[3]![0])).toBeGreaterThan(Math.abs(ring[1]![0] - ring[0]![0]));
  });
});
