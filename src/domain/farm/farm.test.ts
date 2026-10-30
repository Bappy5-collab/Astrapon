import { describe, expect, it } from "vitest";

import { findSelfIntersection, parseBoundary } from "@/domain/geo/boundary";
import { canonicalJson } from "@/domain/reference/canonical";
import { buildReferenceDatasets } from "@/domain/reference/datasets";
import { scenarioSettingsV1 } from "@/domain/scenario/settings";

import { cropHistoryInput, fieldConstraintsInput, prioritiesInput, soilObservationInput } from "./records";

// ~200 m × ~220 m square near Ames, Iowa (≈4.5 ha). Synthetic test geometry, not a real field.
const square = {
  type: "Polygon",
  coordinates: [[[-93.625, 42.025], [-93.6225, 42.025], [-93.6225, 42.027], [-93.625, 42.027], [-93.625, 42.025]]],
};

describe("parseBoundary", () => {
  it("accepts a valid polygon and computes geodesic area", () => {
    const r = parseBoundary(square);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 0.0025° lon × cos(42.026°) × 111.32 km ≈ 206.9 m; 0.002° lat ≈ 222.4 m → ≈ 4.60 ha
    expect(r.areaHa).toBeGreaterThan(4.5);
    expect(r.areaHa).toBeLessThan(4.7);
    expect(r.notes).toEqual([]);
  });

  it("unwraps a Feature and closes an open ring with a note", () => {
    const open = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [square.coordinates[0]!.slice(0, 4)] } };
    const r = parseBoundary(JSON.stringify(open));
    expect(r.ok && r.notes[0]).toMatch(/not closed/);
  });

  it("rejects a bow-tie (self-intersection)", () => {
    const bow = { type: "Polygon", coordinates: [[[-93.625, 42.025], [-93.6225, 42.027], [-93.6225, 42.025], [-93.625, 42.027], [-93.625, 42.025]]] };
    const r = parseBoundary(bow);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/crosses itself/);
  });

  it("rejects out-of-range and swapped-looking coordinates, points, and tiny areas", () => {
    expect(parseBoundary({ type: "Polygon", coordinates: [[[200, 1], [201, 1], [201, 2], [200, 1]]] }).ok).toBe(false);
    expect(parseBoundary({ type: "Point", coordinates: [0, 0] }).ok).toBe(false);
    const tiny = { type: "Polygon", coordinates: [[[0, 0], [0.00001, 0], [0.00001, 0.00001], [0, 0]]] };
    expect(!parseBoundary(tiny).ok && (parseBoundary(tiny) as { error: string }).error).toMatch(/minimum/);
    expect(parseBoundary("not json").ok).toBe(false);
  });

  it("does not flag adjacent edges as crossings", () => {
    expect(findSelfIntersection(square.coordinates[0]! as [number, number][])).toBeNull();
  });
});

describe("record schemas", () => {
  it("stores soil values only in the unit the database accepts", () => {
    const ok = soilObservationInput.safeParse({ property: "ph_water", observedOn: "2025-04-02", depthTopCm: "0", depthBottomCm: "15", value: "6.4", zoneId: "", evidenceClass: "ground_measurement" });
    expect(ok.success && ok.data).toMatchObject({ valueNumeric: 6.4, unit: "pH", valueText: null });
    const bad = soilObservationInput.safeParse({ property: "ph_water", observedOn: "2025-04-02", depthTopCm: "0", depthBottomCm: "15", value: "19", zoneId: "", evidenceClass: "farmer_report" });
    expect(bad.success).toBe(false);
    const text = soilObservationInput.safeParse({ property: "texture_class", observedOn: "2025-04-02", depthTopCm: "0", depthBottomCm: "30", value: "silty clay loam", zoneId: "", evidenceClass: "farmer_report" });
    expect(text.success && text.data).toMatchObject({ valueNumeric: null, valueText: "silty clay loam", unit: null });
    const depth = soilObservationInput.safeParse({ property: "clay", observedOn: "2025-04-02", depthTopCm: "30", depthBottomCm: "15", value: "20", zoneId: "", evidenceClass: "farmer_report" });
    expect(depth.success).toBe(false);
  });

  it("requires yield and unit together and harvest after planting", () => {
    const base = { seasonYear: "2024", season: "main", cropName: "Maize", zoneId: "", plantedOn: "2024-05-01", harvestedOn: "2024-10-10", tillage: "", reportedYield: "", reportedYieldUnit: "" };
    expect(cropHistoryInput.safeParse(base).success).toBe(true);
    expect(cropHistoryInput.safeParse({ ...base, reportedYield: "11" }).success).toBe(false);
    expect(cropHistoryInput.safeParse({ ...base, harvestedOn: "2024-04-01" }).success).toBe(false);
  });

  it("rejects an irrigation method on a rainfed field and parses excluded crops", () => {
    expect(fieldConstraintsInput.safeParse({ irrigation: "none", irrigationMethod: "drip", seasonalWaterAllocationMm: "", waterSource: "", equipment: [] }).success).toBe(false);
    const p = prioritiesInput.parse({ water_use: "5", soil_health: "4", income_stability: "3", workload: "2", weather_risk: "1", diversification: "0", excludedCrops: " rice, Rice , rice,cotton" });
    expect(p.excludedCrops).toEqual(["rice", "Rice", "cotton"]);
  });
});

describe("scenario settings v1", () => {
  const schema = scenarioSettingsV1(2026);
  const base = { candidateCrops: ["Maize", "Soybean"], rotationYears: 2, replayFromYear: 2001, replayToYear: 2025, irrigationAssumption: "rainfed" };

  it("accepts complete past years only (historical replay, not forecast)", () => {
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, replayToYear: 2026 }).success).toBe(false);
    expect(schema.safeParse({ ...base, replayFromYear: 1970 }).success).toBe(false);
  });

  it("rejects duplicate crops and unknown keys", () => {
    expect(schema.safeParse({ ...base, candidateCrops: ["Maize", "maize"] }).success).toBe(false);
    expect(schema.safeParse({ ...base, yieldTarget: 12 }).success).toBe(false);
  });
});

describe("reference datasets", () => {
  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe('{"a":{"d":[1,{"x":1,"y":2}]},"b":1}');
  });

  it("imports only sourced content, every item cites a known citation, and no parameter tables", () => {
    const { citations, datasets } = buildReferenceDatasets();
    const keys = new Set(citations.map((c) => c.citationKey));
    expect(keys.size).toBe(citations.length);
    for (const d of datasets) for (const i of d.items) for (const k of i.citationKeys) expect(keys.has(k)).toBe(true);
    expect(datasets.map((d) => d.kind).sort()).toEqual(["data_source_registry", "reference_library"]);
    for (const c of citations) expect(c.url === null || c.url.startsWith("https://")).toBe(true);
  });
});
