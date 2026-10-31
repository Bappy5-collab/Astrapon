import { describe, expect, it } from "vitest";

import { cropForm } from "@/domain/farm/crops";
import { SAMPLE_FIELD, SAMPLE_HISTORY } from "@/domain/sample/sample-field";
import { resolveCrop, timelineYears, upsertAssignment, workspaceEditsInput } from "@/domain/workspace/workspace";

import { parseBoundary, ringAreaM2, type BoundaryGeometry } from "./boundary";
import { formatLatLon, parseCoordinates } from "./coordinates";
import { createLocalFrame, localPolygonArea, MAX_SUPPORTED_EXTENT_M, pointInLocalPolygon, projectField, wrapLongitude } from "./local-frame";

const square = (lon: number, lat: number, d: number): BoundaryGeometry => ({
  type: "Polygon",
  coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
});

describe("local frame", () => {
  it("round-trips lon/lat through local metres", () => {
    const f = createLocalFrame([90.41, 23.81]);
    for (const p of [[90.41, 23.81], [90.43, 23.79], [90.39, 23.83]] as [number, number][]) {
      const back = f.toLonLat(f.toLocal(p));
      expect(back[0]).toBeCloseTo(p[0], 7);
      expect(back[1]).toBeCloseTo(p[1], 7);
    }
  });

  it("measures distance in metres, not degrees", () => {
    const f = createLocalFrame([0, 60]);
    // 0.01° of longitude at 60°N is ~558 m; 0.01° of latitude is ~1114 m (WGS84 meridional radius).
    expect(f.toLocal([0.01, 60])[0]).toBeCloseTo(558.0, 0);
    expect(f.toLocal([0, 60.01])[1]).toBeCloseTo(1114.1, 0);
  });

  it("keeps a field beside the antimeridian continuous", () => {
    const f = createLocalFrame([179.999, -16.5]);
    const [x] = f.toLocal([-179.999, -16.5]);
    expect(x).toBeGreaterThan(200);
    expect(x).toBeLessThan(220);
    expect(wrapLongitude(181)).toBe(-179);
    expect(wrapLongitude(-180)).toBe(-180);
  });

  it("projected area agrees with the spherical area within 0.5%", () => {
    const g = SAMPLE_FIELD.boundary;
    const projected = projectField(g);
    const local = projected.polygons.reduce((s, p) => s + localPolygonArea(p), 0);
    const sphere = Math.abs(ringAreaM2(g.coordinates[0] as [number, number][])) - Math.abs(ringAreaM2(g.coordinates[1] as [number, number][]));
    expect(Math.abs(local - sphere) / sphere).toBeLessThan(0.005);
  });
});

describe("parseBoundary extensions", () => {
  it("rejects a ring that crosses the 180° meridian with an explanation", () => {
    const r = parseBoundary({ type: "Polygon", coordinates: [[[179.99, -16.5], [-179.99, -16.5], [-179.99, -16.49], [179.99, -16.49], [179.99, -16.5]]] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/180° meridian/);
  });

  it("accepts a field next to (not across) the meridian", () => {
    expect(parseBoundary(square(179.99, -16.5, 0.005)).ok).toBe(true);
  });

  it("rejects holes outside or crossing the outer ring, and overlapping parts", () => {
    const outside = { type: "Polygon", coordinates: [square(0, 0, 0.01).coordinates[0], square(0.02, 0.02, 0.001).coordinates[0]] };
    expect(parseBoundary(outside)).toMatchObject({ ok: false, error: expect.stringMatching(/outside the outer ring/) });
    const crossing = { type: "Polygon", coordinates: [square(0, 0, 0.01).coordinates[0], square(0.009, 0.005, 0.003).coordinates[0]] };
    expect(parseBoundary(crossing)).toMatchObject({ ok: false, error: expect.stringMatching(/crosses the outer ring/) });
    const overlap = { type: "MultiPolygon", coordinates: [square(0, 0, 0.01).coordinates, square(0.005, 0.005, 0.01).coordinates] };
    expect(parseBoundary(overlap)).toMatchObject({ ok: false, error: expect.stringMatching(/overlap/) });
  });

  it("accepts a valid hole and subtracts it from the area", () => {
    const r = parseBoundary(SAMPLE_FIELD.boundary);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.areaHa).toBeGreaterThan(15);
  });

  it("rejects fields wider than the supported extent and beyond ±85°", () => {
    const wide = { type: "Polygon", coordinates: [[[0, 0], [0.4, 0], [0.4, 0.001], [0, 0.001], [0, 0]]] };
    expect(parseBoundary(wide)).toMatchObject({ ok: false, error: expect.stringContaining(`${MAX_SUPPORTED_EXTENT_M / 1000} km`) });
    expect(parseBoundary(square(10, 86, 0.01))).toMatchObject({ ok: false, error: expect.stringMatching(/±85/) });
  });
});

describe("parseCoordinates", () => {
  it.each([
    ["23.81, 90.41", 23.81, 90.41],
    ["23.81 90.41", 23.81, 90.41],
    ["-33.9;18.42", -33.9, 18.42],
    ["23.81N 90.41E", 23.81, 90.41],
    ["41.88 N, 93.1 W", 41.88, -93.1],
    [`23°48'36"N 90°24'36"E`, 23.81, 90.41],
    ["S 33.9, E 18.42", -33.9, 18.42],
    ["90.41E 23.81N", 23.81, 90.41],
  ])("reads %s", (input, lat, lon) => {
    const r = parseCoordinates(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.lat).toBeCloseTo(lat, 4);
      expect(r.value.lon).toBeCloseTo(lon, 4);
    }
  });

  it("does not swap silently and explains why", () => {
    expect(parseCoordinates("80.41, 23.81")).toMatchObject({ ok: true, value: { lat: 80.41, lon: 23.81 } });
    expect(parseCoordinates("120.5, 23.8")).toMatchObject({ ok: false, error: expect.stringMatching(/longitude came first/) });
    expect(parseCoordinates("Dhaka")).toMatchObject({ ok: false });
    expect(parseCoordinates("10, 200")).toMatchObject({ ok: false, error: expect.stringMatching(/Longitude/) });
  });

  it("formats with hemispheres", () => {
    expect(formatLatLon({ lat: -33.9, lon: 18.42 }, 2)).toBe("33.90° S, 18.42° E");
  });
});

describe("crop forms", () => {
  it.each([
    ["Maize", "tall_row"],
    ["hybrid corn", "tall_row"],
    ["boro dhan", "paddy"],
    ["ধান", "paddy"],
    ["সরিষা", "oilseed_flower"],
    ["winter wheat", "small_grain"],
    ["paat", "fibre"],
    ["cereal rye cover", "cover"],
    ["quinoa", "generic"],
    ["", "fallow"],
  ])("%s → %s", (name, form) => {
    expect(cropForm(name)).toBe(form);
  });
});

describe("workspace", () => {
  it("resolves pending, zone and whole-field crops in that order", () => {
    expect(resolveCrop(SAMPLE_HISTORY, [], "sample-zone-north", 2024)).toMatchObject({ cropName: "soybean", scope: "zone" });
    expect(resolveCrop(SAMPLE_HISTORY, [], "sample-zone-north", 2023)).toMatchObject({ cropName: "maize", scope: "field" });
    // Main season preferred over the cover-crop record in 2025.
    expect(resolveCrop(SAMPLE_HISTORY, [], null, 2025)).toMatchObject({ cropName: "cereal rye cover", season: "cover" });
    expect(resolveCrop(SAMPLE_HISTORY, [], "sample-zone-north", 2025)).toMatchObject({ cropName: "maize" });
    const pending = upsertAssignment([], { zoneKey: "sample-zone-north", seasonYear: 2025, season: "main", cropName: "wheat" });
    expect(resolveCrop(SAMPLE_HISTORY, pending, "sample-zone-north", 2025)).toMatchObject({ cropName: "wheat", pending: true });
    expect(upsertAssignment(pending, { zoneKey: "sample-zone-north", seasonYear: 2025, season: "main", cropName: "lentil" })).toHaveLength(1);
    expect(resolveCrop(SAMPLE_HISTORY, [], "sample-zone-north", 2019)).toBeNull();
  });

  it("lists recent years plus every recorded year, never the future", () => {
    expect(timelineYears([{ season_year: 2012 }, { season_year: 2030 }], 2026, 3)).toEqual([2012, 2024, 2025, 2026]);
  });

  it("validates the save payload", () => {
    const ok = workspaceEditsInput.safeParse({ boundary: null, deleteZoneIds: [], zones: [{ id: null, ref: "new-1", name: "A", basis: "farmer_knowledge", notes: null, boundary: square(0, 0, 0.001) }], crops: [] });
    expect(ok.success).toBe(true);
    const dup = workspaceEditsInput.safeParse({ boundary: null, deleteZoneIds: [], zones: ["A", "a"].map((n, i) => ({ id: null, ref: `new-${i}`, name: n, basis: "farmer_knowledge", notes: null, boundary: square(0, 0, 0.001) })), crops: [] });
    expect(dup.success).toBe(false);
    const noGeom = workspaceEditsInput.safeParse({ boundary: null, deleteZoneIds: [], zones: [{ id: null, ref: "new-1", name: "A", basis: "farmer_knowledge", notes: null, boundary: null }], crops: [] });
    expect(noGeom.success).toBe(false);
  });

  it("sample zones lie inside the sample field", () => {
    const field = projectField(SAMPLE_FIELD.boundary);
    const frame = createLocalFrame(field.origin);
    for (const zone of SAMPLE_FIELD.zones) {
      expect(parseBoundary(zone.boundary).ok).toBe(true);
      for (const p of zone.boundary.coordinates[0]!) {
        const lp = frame.toLocal(p as [number, number]);
        // Allow 1 m digitising tolerance like the database.
        const inside = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => field.polygons.some((poly) => pointInLocalPolygon([lp[0] + dx!, lp[1] + dy!], poly)));
        expect(inside, `${zone.name} vertex ${p}`).toBe(true);
      }
    }
  });
});

describe("source coverage vs field size", async () => {
  const { fieldCoverage } = await import("@/domain/sources/coverage");
  it("says a coarse grid gives one value for a small field and fine grids may resolve it", () => {
    const c = fieldCoverage(42.1, 450, "US");
    const power = c.find((s) => s.id === "nasa-power-daily")!;
    expect(power.verdict).toBe("single_value");
    expect(power.cellM![0]).toBeCloseTo(55660, -2);
    expect(c.find((s) => s.id === "hls-v2")!.verdict).toBe("may_resolve");
    expect(c.find((s) => s.id === "modis-mod13q1-ornl")!.verdict).toBe("coarse");
    expect(c.find((s) => s.id === "usda-ssurgo-sda")!.verdict).toBe("polygon_survey");
  });
  it("reports regional gaps honestly", () => {
    const c = fieldCoverage(64, 450, "IS");
    expect(c.find((s) => s.id === "nasadem-opentopography")!.verdict).toBe("outside");
    expect(c.find((s) => s.id === "usda-ssurgo-sda")!.verdict).toBe("outside");
  });
});
