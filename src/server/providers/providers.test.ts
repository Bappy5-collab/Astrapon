import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dateKeys, parsePowerDailyPoint, type PowerDailyRequest } from "./nasa-power";
import { combineNdvi, parseBandInfo } from "./ornl-modis";
import { parseSoilGrids } from "./soilgrids";
import { parseSdaTable, rootZoneAwcMm, toHorizons, validateSda } from "./usda-sda";

const FIXTURE_DIR = join(import.meta.dirname, "__fixtures__");
const load = (name: string) => JSON.parse(readFileSync(join(FIXTURE_DIR, `${name}.fixture.json`), "utf8")) as { _fixture: { label: string }; response: unknown };
const clone = <T>(x: T): T => structuredClone(x);

describe("fixtures", () => {
  it("are explicitly labelled as test-only", () => {
    const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f).toMatch(/\.fixture\.json$/);
      const { _fixture } = JSON.parse(readFileSync(join(FIXTURE_DIR, f), "utf8"));
      expect(_fixture.label).toMatch(/^TEST FIXTURE ONLY/);
    }
  });
});

describe("NASA POWER daily point", () => {
  const req: PowerDailyRequest = {
    latitude: 42.03,
    longitude: -93.62,
    start: "2024-01-01",
    end: "2024-01-10",
    parameters: ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "RH2M", "WS2M", "GWETROOT"],
  };
  const raw = load("nasa-power-daily").response as { properties: { parameter: Record<string, Record<string, number>> }; geometry: { coordinates: number[] }; parameters: Record<string, { units: string }> };

  it("builds inclusive date keys", () => {
    expect(dateKeys("2024-02-27", "2024-03-01")).toEqual(["20240227", "20240228", "20240229", "20240301"]);
  });

  it("accepts a captured response and labels it as model-derived", () => {
    const r = parsePowerDailyPoint(raw, req);
    expect(r.checks.filter((c) => !c.passed)).toEqual([]);
    expect(r.series).toHaveLength(8);
    expect(r.series.every((s) => s.provenance.evidenceClass === "assimilated_model_product")).toBe(true);
    expect(r.series.every((s) => s.values.length === 10)).toBe(true);
  });

  it("turns fill values into null, never zero", () => {
    const bad = clone(raw);
    bad.properties.parameter.PRECTOTCORR!["20240105"] = -999;
    const r = parsePowerDailyPoint(bad, req);
    const p = r.series.find((s) => s.parameter === "PRECTOTCORR")!;
    expect(p.values[4]).toBeNull();
    expect(p.missingCount).toBe(1);
  });

  it("rejects responses for a different location, units, or incomplete period", () => {
    const moved = clone(raw);
    moved.geometry.coordinates[1] = 43;
    expect(parsePowerDailyPoint(moved, req).checks.find((c) => c.id === "location")?.passed).toBe(false);

    const units = clone(raw);
    units.parameters.T2M!.units = "K";
    expect(parsePowerDailyPoint(units, req).ok).toBe(false);

    const gap = clone(raw);
    delete gap.properties.parameter.T2M!["20240103"];
    expect(parsePowerDailyPoint(gap, req).checks.find((c) => c.id === "T2M:dates")?.passed).toBe(false);
  });

  it("fails schema validation for non-POWER payloads", () => {
    expect(parsePowerDailyPoint({ hello: "world" }, req).ok).toBe(false);
  });
});

describe("ORNL MOD13Q1 NDVI", () => {
  const band = parseBandInfo(load("ornl-mod13q1-bands").response, "250m_16_days_NDVI")!;
  const ndvi = load("ornl-mod13q1-ndvi").response as { subset: { modis_date: string; data: number[] }[] };
  const rel = load("ornl-mod13q1-reliability").response as { subset: { modis_date: string; data: number[] }[] };
  const req = { latitude: 42.03, longitude: -93.62, startDate: "2024-01-01", endDate: "2024-12-31" };

  it("reads scale and fill from band metadata", () => {
    expect(band).toMatchObject({ scale: 0.0001, fill: -3000, validRange: [-2000, 10000] });
  });

  it("scales good-quality values and excludes non-good reliability", () => {
    const r = combineNdvi([ndvi], [rel], band, req);
    expect(r.ok).toBe(true);
    for (const s of r.samples) {
      if (s.reliability === 0) expect(s.ndvi).toBeCloseTo(s.rawNdvi * 0.0001, 6);
      else expect(s.ndvi).toBeNull();
    }
  });

  it("treats fill as no-data, not zero", () => {
    const n = clone(ndvi);
    n.subset[0]!.data[0] = -3000;
    const r2 = combineNdvi([n], [rel], band, req);
    expect(r2.samples[0]!.ndvi).toBeNull();
    expect(r2.samples[0]!.excludedBecause).toBe("fill value");
  });
});

describe("USDA SSURGO via SDA", () => {
  const horizons = toHorizons(parseSdaTable(load("usda-sda-horizons").response));

  it("parses horizons and passes range checks", () => {
    expect(horizons.length).toBeGreaterThan(0);
    expect(validateSda(horizons).every((c) => c.passed)).toBe(true);
  });

  it("sums root-zone AWC from survey values and refuses to guess missing horizons", () => {
    const [comp] = rootZoneAwcMm(horizons, 100);
    const expected = horizons.reduce((mm, h) => mm + (h.awc ?? 0) * Math.max(0, Math.min(h.bottomCm, 100) - h.topCm) * 10, 0);
    expect(comp!.awcMm).toBe(Math.round(expected));

    const missing = horizons.map((h, i) => (i === 1 ? { ...h, awc: null } : h));
    expect(rootZoneAwcMm(missing, 100)[0]!.awcMm).toBeNull();
  });
});

describe("SoilGrids", () => {
  // Synthetic payload in the documented shape (no live values could be captured: service paused).
  const payload = (v: number | null) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [-93.62, 42.03] },
    properties: {
      layers: [{ name: "clay", unit_measure: { d_factor: 10, mapped_units: "g/kg", target_units: "%" }, depths: [{ label: "0-5cm", values: { "Q0.05": v, "Q0.5": v, "Q0.95": v, mean: v } }] }],
    },
  });

  it("converts mapped units with the response d_factor", () => {
    const r = parseSoilGrids(payload(254));
    expect(r.values[0]).toMatchObject({ units: "%", q50: 25.4 });
    expect(r.checks.every((c) => c.passed)).toBe(true);
  });

  it("does not accept an all-null HTTP 200 as data", () => {
    const r = parseSoilGrids(payload(null));
    expect(r.checks.find((c) => c.id === "has-values")?.passed).toBe(false);
  });
});
