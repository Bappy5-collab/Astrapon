import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CROP_CATALOG, cropParamsSchema, resolveCrop } from "./catalog";
import { applyTransformation, applyTransformations, et0Series, extraterrestrialRadiation, hargreavesEt0, weatherFromSeries } from "./climate";
import { dayIndex, isoDate, mdOffset, monthDayIn, monthSpan, offsetMd } from "./dates";
import { roundIndicator, runEngine, scoreOptions, stagesFor } from "./engine";
import { ENGINE_VERSION } from "./engine-version";
import type { EngineInput } from "./inputs";
import { parseNassUsualDates } from "./nass";
import { longestGap, occupiedDays, schedule, type Slot, slotFromWindow, yearPatterns } from "./schedule";
import { dateOf, dayValues, differences, indicatorTable, markers, monthlySummary, plantingOn, reasons, sceneStage } from "./view";
import { kcOnDay, rootDepthOnDay, runPeriod } from "./waterbalance";

const NASS = parseNassUsualDates(readFileSync(path.join(process.cwd(), "data/reference/usda-nass-usual-dates-2010.txt"), "utf8"));
const crop = (id: string) => CROP_CATALOG.find((c) => c.id === id)!;

describe("FAO-56 radiation and reference ET", () => {
  it("reproduces FAO-56 Example 8 (3 September, 20°S → Ra 32.2 MJ m⁻² d⁻¹)", () => {
    expect(extraterrestrialRadiation(-20, 246)).toBeCloseTo(32.2, 1);
    expect(0.408 * extraterrestrialRadiation(-20, 246)).toBeCloseTo(13.1, 1);
  });
  it("computes Hargreaves Eq. 52 in mm/day", () => {
    const ra = 0.408 * extraterrestrialRadiation(-20, 246);
    expect(hargreavesEt0(30, 15, -20, 246)).toBeCloseTo(0.0023 * (22.5 + 17.8) * Math.sqrt(15) * ra, 10);
    expect(() => hargreavesEt0(10, 12, 0, 100)).toThrow();
  });
  it("handles polar night without NaN", () => {
    expect(extraterrestrialRadiation(84, 355)).toBe(0);
    expect(Number.isFinite(extraterrestrialRadiation(-84, 355))).toBe(true);
  });
});

describe("calendar arithmetic", () => {
  it("round-trips dates and month-days, including cross-year spans", () => {
    expect(isoDate(dayIndex("2024-02-29"))).toBe("2024-02-29");
    expect(() => dayIndex("2023-02-29")).toThrow();
    expect(offsetMd(mdOffset("10-01"))).toBe("10-01");
    expect(monthDayIn(2024, "03-01") - monthDayIn(2024, "02-28")).toBe(2);
    expect(monthSpan(dayIndex("2024-10-01"), dayIndex("2025-07-15"))).toBe("Oct–Jul");
  });
});

describe("FAO-56 water balance", () => {
  const stages = { ini: 20, dev: 30, mid: 40, late: 30 };
  const kc = { ini: 0.3, mid: 1.2, end: 0.35 };
  const L = 120;
  it("follows the four-stage Kc curve and root growth", () => {
    expect(kcOnDay(0, stages, kc)).toBe(0.3);
    expect(kcOnDay(60, stages, kc)).toBe(1.2);
    expect(kcOnDay(119, stages, kc)).toBeCloseTo(0.35, 10);
    expect(rootDepthOnDay(0, stages, 1.7)).toBeGreaterThan(0.15);
    expect(rootDepthOnDay(49, stages, 1.7)).toBeCloseTo(1.7, 10);
  });
  it("conserves water and respects storage bounds with no rain", () => {
    const r = runPeriod({ et0: Array(L).fill(6), precip: Array(L).fill(0), stages, kc, soil: { awcMmPerM: 150, rootMaxM: 1.7, p: 0.55 }, initial: "field_capacity", irrigation: "rainfed" });
    expect(r.complete).toBe(true);
    expect(Math.abs(r.conservationErrorMm!)).toBeLessThan(1e-6);
    expect(r.etaMm!).toBeLessThan(r.etcMm!);
    expect(r.storageEndMm!).toBeGreaterThanOrEqual(0);
    expect(r.drainageMm).toBe(0);
    expect(r.stressDays!).toBeGreaterThan(0);
  });
  it("drains excess under saturating rain and never stresses", () => {
    const r = runPeriod({ et0: Array(L).fill(4), precip: Array(L).fill(60), stages, kc, soil: { awcMmPerM: 150, rootMaxM: 1.7, p: 0.55 }, initial: "field_capacity", irrigation: "rainfed" });
    expect(r.stressDays).toBe(0);
    expect(r.etaMm!).toBeCloseTo(r.etcMm!, 9);
    expect(r.drainageMm!).toBeGreaterThan(0);
    expect(Math.abs(r.conservationErrorMm!)).toBeLessThan(1e-6);
    expect(r.storageEndMm!).toBeCloseTo(150 * 1.7, 6);
  });
  it("full irrigation refills before stress and reports the requirement", () => {
    const r = runPeriod({ et0: Array(L).fill(6), precip: Array(L).fill(0), stages, kc, soil: { awcMmPerM: 150, rootMaxM: 1.7, p: 0.55 }, initial: "readily_available_depleted", irrigation: "full" });
    expect(r.stressDays).toBe(0);
    expect(r.irrigationMm!).toBeGreaterThan(0);
    expect(r.etaMm!).toBeCloseTo(r.etcMm!, 9);
    expect(Math.abs(r.conservationErrorMm!)).toBeLessThan(1e-6);
  });
  it("returns potential demand only without soil, and nothing with a missing day", () => {
    const pot = runPeriod({ et0: Array(L).fill(5), precip: Array(L).fill(1), stages, kc, soil: null, initial: "field_capacity", irrigation: "rainfed" });
    expect(pot.etcMm).toBeGreaterThan(0);
    expect(pot.etaMm).toBeNull();
    const gap = runPeriod({ et0: [...Array(L - 1).fill(5), null], precip: Array(L).fill(1), stages, kc, soil: null, initial: "field_capacity", irrigation: "rainfed" });
    expect(gap.complete).toBe(false);
    expect(gap.etcMm).toBeNull();
    expect(() => runPeriod({ et0: Array(10).fill(5), precip: Array(10).fill(1), stages, kc, soil: null, initial: "field_capacity", irrigation: "rainfed" })).toThrow();
  });
});

describe("weather transformations", () => {
  const w = weatherFromSeries("2000-01-01", [20, 25], [10, 12], [5, 0]);
  it("applies each transformation once, recorded, within physical ranges", () => {
    const t = applyTransformations(w, [{ kind: "precipitation_scale", percent: -50 }, { kind: "temperature_offset", celsius: 2 }]);
    expect(t.precip).toEqual([2.5, 0]);
    expect(t.tmax).toEqual([22, 27]);
    expect(t.applied).toHaveLength(2);
    expect(w.applied).toHaveLength(0);
    expect(() => applyTransformation(t, { kind: "precipitation_scale", percent: 10 })).toThrow(/already applied/);
    expect(() => applyTransformation(w, { kind: "temperature_offset", celsius: 9 })).toThrow();
    expect(() => weatherFromSeries("2000-01-01", [5], [10], [0])).toThrow();
    expect(() => weatherFromSeries("2000-01-01", [5], [1], [-1])).toThrow();
  });
  it("keeps missing days missing", () => {
    const m = weatherFromSeries("2000-01-01", [20, null], [10, null], [null, 3]);
    expect(et0Series(m, 40)[1]).toBeNull();
    expect(applyTransformation(m, { kind: "precipitation_scale", percent: 20 }).precip[0]).toBeNull();
  });
});

describe("reference data", () => {
  it("validates every catalogue entry and keeps aliases unambiguous", () => {
    for (const c of CROP_CATALOG) expect(cropParamsSchema.safeParse(c).success).toBe(true);
    const all = CROP_CATALOG.flatMap((c) => c.aliases.map((a) => a.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
  });
  it("resolves farmer names, including Bangla and Banglish", () => {
    expect(resolveCrop("Boro dhan", CROP_CATALOG)?.id).toBe("rice");
    expect(resolveCrop("ধান", CROP_CATALOG)?.id).toBe("rice");
    expect(resolveCrop("winter wheat", CROP_CATALOG)?.id).toBe("winter_wheat");
    expect(resolveCrop("Wheat", CROP_CATALOG)?.id).toBe("spring_wheat");
    expect(resolveCrop("hybrid corn", CROP_CATALOG)?.id).toBe("maize");
    expect(resolveCrop("dragon fruit", CROP_CATALOG)).toBeNull();
  });
  it("parses the NASS 2010 state tables (Iowa corn, Kansas fall barley)", () => {
    const corn = NASS.find((e) => e.region === "Iowa" && e.cropId === "maize")!;
    expect(corn.plant).toEqual({ begin: "04-19", activeStart: "04-25", activeEnd: "05-18", end: "05-26" });
    expect(corn.harvest).toEqual({ begin: "09-21", activeStart: "10-05", activeEnd: "11-09", end: "11-21" });
    expect(NASS.find((e) => e.region === "Iowa" && e.cropId === "winter_wheat")?.plant.activeStart).toBe("09-26");
    expect(NASS.some((e) => e.region === "Kansas" && e.sourceCrop === "Barley, fall")).toBe(true);
    expect(new Set(NASS.map((e) => e.region)).size).toBeGreaterThan(40);
    expect(NASS.some((e) => e.sourceCrop.toLowerCase().includes("hay"))).toBe(false);
  });
  it("scales FAO-56 stage examples to the local season length", () => {
    const s = stagesFor(crop("maize"), 150)!;
    expect(s.ini + s.dev + s.mid + s.late).toBe(150);
    expect(stagesFor(crop("rapeseed"), 150)).toBeNull();
    expect(stagesFor(crop("mustard"), 150)).toBeNull();
  });
});

describe("scheduling", () => {
  const wheat = slotFromWindow("ww", crop("winter_wheat"), "Winter wheat", "farmer_window", "", "10-01", "10-20", 280);
  const soy = slotFromWindow("soy", crop("soybean"), "Soybean", "farmer_window", "", "05-05", "06-10", 130);
  const lateSoy = slotFromWindow("soy2", crop("soybean"), "Soybean", "farmer_window", "", "07-10", "07-25", 100);
  it("handles crops that cross the calendar year", () => {
    const r = schedule([{ slot: wheat, cycleYear: 0 }], 1, 0, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plantings[0]!.end - r.plantings[0]!.start).toBe(280);
  });
  it("rejects a double crop whose planting window closes before the previous harvest", () => {
    const r = schedule([{ slot: wheat, cycleYear: 0 }, { slot: soy, cycleYear: 1 }], 2, 0, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.code).toBe("overlap");
  });
  it("shifts a planting within its window after a harvest, and enforces turnaround", () => {
    const early = slotFromWindow("e", crop("oats"), "Oats", "farmer_window", "", "03-20", "03-25", 100);
    const r = schedule([{ slot: early, cycleYear: 0 }, { slot: lateSoy, cycleYear: 0 }], 1, 0, true);
    expect(r.ok).toBe(true);
    const tight = schedule([{ slot: early, cycleYear: 0 }, { slot: lateSoy, cycleYear: 0 }], 1, 120, true);
    expect(tight.ok).toBe(false);
  });
  it("detects overlap across the cycle boundary", () => {
    const long = slotFromWindow("l", crop("cotton"), "Cotton", "farmer_window", "", "03-01", "03-05", 300);
    const r = schedule([{ slot: long, cycleYear: 0 }, { slot: soy, cycleYear: 0 }], 1, 0, true);
    expect(r.ok).toBe(false);
  });
  it("measures bare days and the longest gap on the folded cycle", () => {
    const r = schedule([{ slot: soy, cycleYear: 0 }], 1, 0, true);
    if (!r.ok) throw new Error("unexpected");
    expect(occupiedDays(r.plantings, 1)).toBe(130);
    expect(longestGap(r.plantings, 1).days).toBe(235);
  });
  it("builds year patterns including the empty year", () => {
    const pats = yearPatterns([wheat, soy, lateSoy] as Slot[], 0);
    expect(pats.some((p) => p.length === 0)).toBe(true);
    expect(pats.every((p) => p.length <= 3)).toBe(true);
  });
});

// ------------------------------------------------------------- engine ---

/** Deterministic synthetic weather (not real data): seasonal temperature and a fixed rain pattern. */
function syntheticWeather(fromYear: number, toYear: number, lat = 42, rainScale = 1) {
  const start = dayIndex(`${fromYear}-01-01`);
  const end = dayIndex(`${toYear}-12-31`);
  const tmax: number[] = [];
  const tmin: number[] = [];
  const precip: number[] = [];
  for (let d = start; d <= end; d++) {
    const doy = d - dayIndex(`${new Date(d * 86400000).getUTCFullYear()}-01-01`);
    const season = Math.sin(((doy - 110) / 365) * 2 * Math.PI) * (lat >= 0 ? 1 : -1);
    const year = new Date(d * 86400000).getUTCFullYear();
    tmin.push(Math.round((4 + 13 * season) * 10) / 10);
    tmax.push(Math.round((16 + 14 * season) * 10) / 10);
    precip.push(d % 5 === 0 ? Math.round(rainScale * (8 + (year % 7)) * 10) / 10 : 0);
  }
  return { retrievalId: "synthetic-weather", productVersion: "test", start: `${fromYear}-01-01`, tmax, tmin, precip };
}

function baseInput(over: { settings?: Record<string, unknown>; history?: unknown[]; priorities?: unknown; constraints?: unknown; market?: unknown[]; weather?: unknown; soil?: unknown; soilObs?: unknown[] } = {}): EngineInput {
  return {
    engineVersion: ENGINE_VERSION,
    snapshot: {
      id: "snap-1",
      inputsSha256: "a".repeat(64),
      inputs: {
        input_schema_version: 2,
        scenario: {
          id: "sc-1", name: "Test", settings_schema_version: 2,
          settings: {
            candidateCrops: ["maize", "soybean", "oats", "winter wheat"], rotationYears: 2, replayFromYear: 2000, replayToYear: 2019,
            irrigationAssumption: "rainfed", calendarRegion: "Iowa", plantingWindows: [], turnaroundDays: 7, precipitationChangePct: 0, temperatureChangeC: 0, notes: "",
            ...over.settings,
          },
        },
        field: { id: "f-1", name: "Test field", area_ha: 20, centroid: { type: "Point", coordinates: [-93.8, 42.1] } },
        zones: [],
        crop_history: (over.history ?? [
          { id: "h1", zone_id: null, season_year: 2023, season: "main", crop_name: "Corn", planted_on: "2023-05-01", harvested_on: "2023-10-15" },
          { id: "h2", zone_id: null, season_year: 2024, season: "main", crop_name: "Soybeans", planted_on: "2024-05-15", harvested_on: "2024-10-01" },
        ]) as EngineInput["snapshot"]["inputs"]["crop_history"],
        soil_observations: (over.soilObs ?? []) as EngineInput["snapshot"]["inputs"]["soil_observations"],
        constraints: (over.constraints ?? { irrigation: "none", seasonal_water_allocation_mm: null }) as EngineInput["snapshot"]["inputs"]["constraints"],
        priorities: (over.priorities === undefined ? { water_use: 3, soil_health: 3, income_stability: 3, workload: 3, weather_risk: 3, diversification: 3, excluded_crops: [] } : over.priorities) as EngineInput["snapshot"]["inputs"]["priorities"],
        market_preferences: (over.market ?? []) as EngineInput["snapshot"]["inputs"]["market_preferences"],
      },
    },
    cropDataset: { id: "ds-crops", name: "crop-parameters", version: 1, sha256: "b".repeat(64), items: CROP_CATALOG },
    calendarDataset: { id: "ds-cal", name: "usda-nass-usual-dates-2010", version: 1, sha256: "c".repeat(64), items: NASS },
    weather: (over.weather === undefined ? syntheticWeather(1999, 2021) : over.weather) as EngineInput["weather"],
    soilSurvey: (over.soil === undefined ? { retrievalId: "ssurgo-1", awcMm0to100: 180 } : over.soil) as EngineInput["soilSurvey"],
  };
}

describe("rotation engine", () => {
  it("compares the existing practice with distinct feasible alternatives", () => {
    const r = runEngine(baseInput());
    expect(r.status).toBe("ok");
    const run = r.runs[0]!;
    expect(run.kind).toBe("historical_replay");
    expect(run.baseline?.label).toContain("Maize");
    expect(run.alternatives.length).toBeGreaterThanOrEqual(2);
    const sets = [run.baseline!, ...run.alternatives].map((s) => [...new Set(s.plantings.map((p) => p.cropId))].sort().join(","));
    expect(new Set(sets).size).toBe(sets.length);
    for (const a of run.alternatives) expect(a.violations).toEqual([]);
    for (const a of run.alternatives) expect(new Set(a.plantings.map((p) => p.cropId)).size).toBeGreaterThanOrEqual(2);
    expect(run.comparison?.ranking).toHaveLength(run.alternatives.length + 1);
    expect(run.baseline!.indicators.relative_water_supply!.value).not.toBeNull();
    expect(r.search.slots.some((s) => s.source === "calendar")).toBe(true);
    for (const v of Object.values(run.comparison!.scores)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("is byte-for-byte reproducible for identical input", () => {
    const a = JSON.stringify(runEngine(baseInput()));
    const b = JSON.stringify(runEngine(structuredClone(baseInput())));
    expect(a).toBe(b);
  });

  it("enforces exclusions and market access before ranking", () => {
    const r = runEngine(baseInput({ priorities: { water_use: 3, soil_health: 3, income_stability: 3, workload: 3, weather_risk: 3, diversification: 3, excluded_crops: ["oats"] }, market: [{ crop_name: "winter wheat", preference: "no_market_access", has_contract: false }] }));
    const run = r.runs[0]!;
    expect(r.search.cropRejections.map((c) => c.code).sort()).toEqual(["excluded", "no_market_access"]);
    for (const a of run.alternatives) expect(a.plantings.some((p) => p.cropId === "oats" || p.cropId === "winter_wheat")).toBe(false);
  });

  it("rejects crops without a local planting window instead of imposing a calendar", () => {
    const r = runEngine(baseInput({ settings: { calendarRegion: null, candidateCrops: ["maize", "lentil"] } }));
    expect(r.search.cropRejections.find((c) => c.crop === "Lentil")?.code).toBe("no_window");
    expect(r.reviewQuestions.some((q) => q.includes("Lentil"))).toBe(true);
  });

  it("changes the ranking when priorities change", () => {
    const p = (o: Record<string, number>) => ({ water_use: 0, soil_health: 0, income_stability: 0, workload: 0, weather_risk: 0, diversification: 0, excluded_crops: [], ...o });
    const a = runEngine(baseInput({ priorities: p({ workload: 5 }) })).runs[0]!;
    const b = runEngine(baseInput({ priorities: p({ soil_health: 5, diversification: 5 }) })).runs[0]!;
    const top = (run: typeof a) => {
      const id = run.comparison!.ranking[0]!;
      return [run.baseline!, ...run.alternatives].find((s) => s.id === id)!.label;
    };
    expect(top(a)).not.toBe(top(b));
    expect(a.comparison!.ablation.length).toBeGreaterThan(0);
  });

  it("returns insufficient evidence for water without weather, and potential demand only without soil", () => {
    const noWeather = runEngine(baseInput({ weather: null }));
    expect(noWeather.status).toBe("ok");
    expect(noWeather.runs[0]!.baseline!.indicators.relative_water_supply?.value ?? null).toBeNull();
    expect(noWeather.gaps.some((g) => g.includes("NASA POWER"))).toBe(true);
    const noSoil = runEngine(baseInput({ soil: null }));
    expect(noSoil.runs[0]!.baseline!.indicators.relative_water_supply).toBeUndefined();
    expect(noSoil.runs[0]!.baseline!.indicators.climatic_water_balance!.value).not.toBeNull();
  });

  it("asks for history rather than inventing the existing practice", () => {
    const r = runEngine(baseInput({ history: [] }));
    expect(r.runs[0]!.baseline).toBeNull();
    expect(r.gaps.some((g) => g.includes("Existing practice is unknown"))).toBe(true);
    const partial = runEngine(baseInput({ settings: { rotationYears: 3 } }));
    expect(partial.gaps.some((g) => g.includes("incomplete"))).toBe(true);
  });

  it("reports historical replay and the transformed scenario separately", () => {
    const r = runEngine(baseInput({ settings: { precipitationChangePct: -40 } }));
    expect(r.runs.map((x) => x.kind)).toEqual(["historical_replay", "scenario"]);
    expect(r.runs[1]!.transformations).toEqual([{ kind: "precipitation_scale", percent: -40 }]);
    const h = r.runs[0]!.baseline!.indicators.relative_water_supply!.value!;
    const s = r.runs[1]!.baseline!.indicators.relative_water_supply!.value!;
    expect(s).toBeLessThan(h);
  });

  it("schedules multiple crops per year from farmer windows (no regional calendar)", () => {
    const r = runEngine(
      baseInput({
        settings: {
          calendarRegion: null, candidateCrops: ["boro rice", "jute", "lentil", "mustard"], rotationYears: 1, replayFromYear: 2001, replayToYear: 2019,
          plantingWindows: [
            { crop: "lentil", plantFrom: "11-01", plantTo: "11-20", lengthDays: 110 },
            { crop: "jute", plantFrom: "03-20", plantTo: "04-10", lengthDays: 110 },
            { crop: "mustard", plantFrom: "10-25", plantTo: "11-10", lengthDays: 85 },
          ],
        },
        history: [{ id: "b1", zone_id: null, season_year: 2024, season: "boro", crop_name: "Boro dhan", planted_on: "2024-01-15", harvested_on: "2024-05-10" }],
        weather: syntheticWeather(2000, 2021, 24),
        soil: null,
      }),
    );
    const run = r.runs[0]!;
    expect(run.alternatives.some((a) => a.plantings.length >= 2)).toBe(true);
    expect(r.search.slots.find((s) => s.crop === "Rice (paddy)")?.source).toBe("history");
  });

  it("applies the canola return interval and the water allocation", () => {
    const canola = runEngine(baseInput({ settings: { candidateCrops: ["canola", "oats"], calendarRegion: null, rotationYears: 2, plantingWindows: [{ crop: "canola", plantFrom: "04-20", plantTo: "05-05", lengthDays: 100 }, { crop: "oats", plantFrom: "04-01", plantTo: "04-10", lengthDays: 110 }] }, history: [] }));
    expect(canola.search.rejectionCounts.return_interval).toBeGreaterThan(0);
    const alloc = runEngine(baseInput({ settings: { irrigationAssumption: "as_recorded" }, constraints: { irrigation: "full", seasonal_water_allocation_mm: 1 } }));
    expect(alloc.irrigationMode).toBe("full");
    expect(alloc.search.rejectionCounts.water_allocation).toBeGreaterThan(0);
  });

  it("does not propose whole fallow years unless fallow is a candidate", () => {
    const only = runEngine(baseInput({ settings: { candidateCrops: ["winter wheat"] }, history: [] }));
    expect(only.search.rejectionCounts.fallow_year).toBeGreaterThan(0);
    for (const a of only.runs[0]!.alternatives) expect(Number(a.indicators.longest_bare_window!.value)).toBeLessThan(365);
    const withFallow = runEngine(baseInput({ settings: { candidateCrops: ["winter wheat", "fallow"] }, history: [] }));
    expect(withFallow.search.rejectionCounts.fallow_year ?? 0).toBe(0);
  });

  it("labels stability across sensitivity cases", () => {
    const run = runEngine(baseInput()).runs[0]!;
    expect(["stable", "fragile"]).toContain(run.comparison!.stability);
    expect(run.comparison!.cases.map((c) => c.id)).toContain("dry_start");
  });

  it("refuses inputs for another engine version and fields without a location", () => {
    expect(runEngine({ ...baseInput(), engineVersion: "0.0.0-pre-engine" }).status).toBe("insufficient");
    const i = baseInput();
    i.snapshot.inputs.field.centroid = null;
    expect(runEngine(i).status).toBe("insufficient");
  });

  it("stays within a bounded computation time (benchmark)", () => {
    const t0 = performance.now();
    const r = runEngine(baseInput({ settings: { rotationYears: 3, candidateCrops: ["maize", "soybean", "oats", "winter wheat", "sorghum", "dry bean"], replayFromYear: 1999, replayToYear: 2020 } }));
    const ms = performance.now() - t0;
    console.log(`benchmark: 3-year rotation, ${r.search.sequencesExamined} sequences examined, ${r.search.feasible} feasible, ${Math.round(ms)} ms`);
    expect(r.status).toBe("ok");
    expect(ms).toBeLessThan(20_000);
  });

  it("bounds the search for long rotations with many crops (benchmark)", () => {
    const t0 = performance.now();
    const r = runEngine(baseInput({ settings: { rotationYears: 4, calendarRegion: "Kansas", candidateCrops: ["maize", "soybean", "oats", "winter wheat", "sorghum", "barley", "sunflower", "cotton"], replayFromYear: 1999, replayToYear: 2020 }, history: [] }));
    const ms = performance.now() - t0;
    console.log(`benchmark: 4-year rotation, bounded=${r.search.bounded}, ${r.search.sequencesExamined} sequences examined, ${r.search.feasible} feasible, ${Math.round(ms)} ms, result ${Math.round(JSON.stringify(r).length / 1024)} KB`);
    expect(r.status).toBe("ok");
    expect(r.search.feasible).toBeGreaterThan(0);
    expect(ms).toBeLessThan(60_000);
  }, 120_000);
});

describe("timeline (engine 1.1.0)", () => {
  it("replays the compared options day by day over the latest complete window", () => {
    const r = runEngine(baseInput());
    const run = r.runs[0]!;
    const tl = run.timeline!;
    expect(tl).not.toBeNull();
    expect(tl.years).toEqual([2018, 2019]);
    expect(tl.startDate).toBe("2018-01-01");
    expect(tl.days).toBe(730);
    expect(tl.weather.precip).toHaveLength(730);
    expect(tl.strategies.map((s) => s.id)).toEqual([run.baseline!.id, ...run.alternatives.map((a) => a.id)]);
    for (const s of tl.strategies) {
      expect(s.kc).toHaveLength(730);
      expect(s.plantings.length).toBeGreaterThan(0);
      // Bare days carry no crop state; planted days within the window do.
      const planted = new Set<number>();
      for (const p of s.plantings) for (let d = Math.max(0, p.start); d < Math.min(730, p.end); d++) planted.add(d);
      for (let d = 0; d < 730; d++) if (!planted.has(d)) expect(s.kc[d]).toBeNull();
      for (const d of planted) expect(s.kc[d]).not.toBeNull();
      for (const v of s.depletion) if (v != null) expect(v >= 0 && v <= 1).toBe(true);
    }
    const maize = tl.strategies[0]!.plantings.find((p) => p.cropId === "maize")!;
    expect(maize.start).toBe(dayIndex("2018-05-01") - dayIndex("2018-01-01"));
  });

  it("matches the period balance it is drawn from (same FAO-56 code path)", () => {
    const stages = { ini: 20, dev: 30, mid: 40, late: 30 };
    const trace = { kc: [], etc: [], rootM: [], depletion: [], ks: [], eta: [], irrigation: [], drainage: [] } as Record<string, number[]>;
    const r = runPeriod({ et0: Array(120).fill(5), precip: Array.from({ length: 120 }, (_, i) => (i % 9 === 0 ? 20 : 0)), stages, kc: { ini: 0.3, mid: 1.2, end: 0.35 }, soil: { awcMmPerM: 150, rootMaxM: 1.7, p: 0.55 }, initial: "field_capacity", irrigation: "rainfed", trace: trace as never });
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(trace.eta).toHaveLength(120);
    expect(sum(trace.eta!)).toBeCloseTo(r.etaMm!, 9);
    expect(sum(trace.etc!)).toBeCloseTo(r.etcMm!, 9);
    expect(sum(trace.drainage!)).toBeCloseTo(r.drainageMm!, 9);
  });

  it("states why there is no timeline instead of drawing one", () => {
    const r = runEngine(baseInput({ weather: null }));
    expect(r.runs[0]!.timeline).toBeNull();
    expect(r.runs[0]!.timelineNote).toMatch(/No daily weather/);
  });
});

describe("scoreOptions (shared by the engine and the priority preview)", () => {
  it("reproduces the engine ranking from the published indicator table", () => {
    const run = runEngine(baseInput()).runs[0]!;
    const opts = [run.baseline!, ...run.alternatives];
    const table = Object.fromEntries(opts.map((o) => [o.id, Object.fromEntries(Object.entries(o.indicators).map(([k, v]) => [k, v.value]))]));
    const again = scoreOptions(run.indicatorDefinitions, opts.map((o) => o.id), table, runEngine(baseInput()).priorities);
    expect(again.ranking).toEqual(run.comparison!.ranking);
    expect(again.scores).toEqual(run.comparison!.scores);
    const other = scoreOptions(run.indicatorDefinitions, opts.map((o) => o.id), table, { water_use: 0, soil_health: 0, diversification: 0, weather_risk: 0, workload: 5, income_stability: 0 });
    expect(Object.keys(other.scores).sort()).toEqual(opts.map((o) => o.id).sort());
    expect(roundIndicator("ratio", 0.12345)).toBe(0.123);
    expect(roundIndicator("mm/year", 12.345)).toBe(12.3);
  });
});

describe("result views (replay tables, explanations)", () => {
  const run = runEngine(baseInput()).runs[0]!;
  const tl = run.timeline!;
  const base = tl.strategies[0]!;

  it("looks up the FAO-56 stage and stored values for a day without recomputing", () => {
    const maize = base.plantings.find((p) => p.cropId === "maize" && p.start >= 0)!;
    const first = plantingOn(base, maize.start)!;
    expect(first.stage).toBe("initial");
    expect(sceneStage(first)).toBe("emerging");
    const mid = plantingOn(base, maize.start + maize.stages!.ini + maize.stages!.dev + 1)!;
    expect(mid.stage).toBe("mid_season");
    expect(mid.growth).toBe(1);
    expect(plantingOn(base, maize.start - 1)?.planting.cropId ?? null).not.toBe("maize");
    const v = dayValues(tl, base, maize.start + 10);
    expect(v.kc).toBe(base.kc[maize.start + 10]);
    expect(v.date).toBe(dateOf(tl, maize.start + 10));
  });

  it("lists planting and harvest markers inside the window and sums months from stored days", () => {
    const m = markers(tl, [base.id]);
    expect(m.some((x) => x.kind === "plant")).toBe(true);
    expect(m.every((x) => x.day >= 0 && x.day < tl.days)).toBe(true);
    const months = monthlySummary(tl, base);
    expect(months).toHaveLength(24);
    expect(months.reduce((a, r) => a + r.days, 0)).toBe(tl.days);
    const rain = months.reduce((a, r) => a + (r.rainMm ?? 0), 0);
    expect(rain).toBeCloseTo(tl.weather.precip.reduce<number>((a, v) => a + (v ?? 0), 0), 0);
  });

  it("derives differences and reasons from the stored tables", () => {
    const table = indicatorTable(run);
    const alt = run.alternatives[0]!;
    const d = differences(run.indicatorDefinitions, table, "baseline", alt.id);
    for (const x of d) expect(x.from).not.toBe(x.to);
    const r = reasons(run.comparison!, alt.id);
    const total = r.reduce((a, x) => a + x.contribution, 0);
    expect(total).toBeCloseTo(run.comparison!.scores[alt.id]!, 2);
  });
});

describe("accounting invariants and sensitivity (Phase 7)", () => {
  // Deterministic pseudo-random generator so the property test is reproducible.
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

  it("conserves water and keeps storage within bounds for 300 random periods", () => {
    const r = rng(42);
    for (let i = 0; i < 300; i++) {
      const L = 60 + Math.floor(r() * 200);
      const ini = Math.max(1, Math.floor(L * (0.1 + r() * 0.15)));
      const dev = Math.max(1, Math.floor(L * (0.2 + r() * 0.15)));
      const mid = Math.max(1, Math.floor(L * (0.25 + r() * 0.15)));
      const stages = { ini, dev, mid, late: L - ini - dev - mid };
      if (stages.late < 0) continue;
      const res = runPeriod({
        et0: Array.from({ length: L }, () => r() * 9),
        precip: Array.from({ length: L }, () => (r() < 0.25 ? r() * 60 : 0)),
        stages,
        kc: { ini: 0.2 + r() * 0.5, mid: 0.8 + r() * 0.5, end: 0.2 + r() * 0.8 },
        soil: { awcMmPerM: 40 + r() * 260, rootMaxM: 0.5 + r() * 1.8, p: 0.3 + r() * 0.4 },
        initial: r() < 0.5 ? "field_capacity" : "readily_available_depleted",
        irrigation: r() < 0.5 ? "rainfed" : "full",
      });
      expect(Math.abs(res.conservationErrorMm!)).toBeLessThan(1e-6);
      expect(res.etaMm!).toBeLessThanOrEqual(res.etcMm! + 1e-9);
      expect(res.storageEndMm!).toBeGreaterThanOrEqual(-1e-9);
      expect(res.drainageMm!).toBeGreaterThanOrEqual(0);
    }
  });

  it("more rain never lowers relative water supply; less rain never raises it", () => {
    const at = (scale: number) => runEngine(baseInput({ weather: syntheticWeather(1999, 2021, 42, scale) })).runs[0]!.baseline!.indicators.relative_water_supply!.value!;
    const dry = at(0.5), base = at(1), wet = at(2);
    expect(dry).toBeLessThanOrEqual(base);
    expect(base).toBeLessThanOrEqual(wet);
    expect(dry).toBeLessThan(wet);
  });

  it("a −20 % rainfall scenario lowers the existing practice's water supply and is kept separate", () => {
    const r = runEngine(baseInput({ settings: { precipitationChangePct: -20 } }));
    const hist = r.runs.find((x) => x.kind === "historical_replay")!.baseline!.indicators.relative_water_supply!.value!;
    const scen = r.runs.find((x) => x.kind === "scenario")!.baseline!.indicators.relative_water_supply!.value!;
    expect(scen).toBeLessThanOrEqual(hist);
    expect(r.runs.find((x) => x.kind === "scenario")!.timeline!.weather.precip.some((v) => v != null)).toBe(true);
  });
});
