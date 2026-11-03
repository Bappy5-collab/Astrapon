import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CROP_CATALOG } from "@/domain/simulation/catalog";
import { dayIndex } from "@/domain/simulation/dates";
import { runEngine } from "@/domain/simulation/engine";
import { ENGINE_VERSION } from "@/domain/simulation/engine-version";
import type { EngineInput } from "@/domain/simulation/inputs";
import { parseNassUsualDates } from "@/domain/simulation/nass";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

const { RunExplorer } = await import("./RunExplorer");

const NASS = parseNassUsualDates(readFileSync(path.join(process.cwd(), "data/reference/usda-nass-usual-dates-2010.txt"), "utf8"));

/** Deterministic synthetic weather (not real data). */
function weather(fromYear: number, toYear: number) {
  const tmax: number[] = [];
  const tmin: number[] = [];
  const precip: number[] = [];
  for (let d = dayIndex(`${fromYear}-01-01`); d <= dayIndex(`${toYear}-12-31`); d++) {
    const s = Math.sin((((d % 365) - 110) / 365) * 2 * Math.PI);
    tmin.push(Math.round((4 + 13 * s) * 10) / 10);
    tmax.push(Math.round((16 + 14 * s) * 10) / 10);
    precip.push(d % 5 === 0 ? 9 : 0);
  }
  return { retrievalId: "synthetic", productVersion: "test", start: `${fromYear}-01-01`, tmax, tmin, precip };
}

function input(settings: Record<string, unknown>, history: unknown[]): EngineInput {
  return {
    engineVersion: ENGINE_VERSION,
    snapshot: {
      id: "snap-1",
      inputsSha256: "a".repeat(64),
      inputs: {
        input_schema_version: 2,
        scenario: {
          id: "sc-1", name: "Test", settings_schema_version: 2,
          settings: { candidateCrops: ["maize", "soybean"], rotationYears: 2, replayFromYear: 2010, replayToYear: 2019, irrigationAssumption: "rainfed", calendarRegion: "Iowa", plantingWindows: [], turnaroundDays: 7, precipitationChangePct: 0, temperatureChangeC: 0, notes: "", ...settings },
        },
        field: { id: "f-1", name: "Test field", area_ha: 20, centroid: { type: "Point", coordinates: [-93.8, 42.1] } },
        zones: [],
        crop_history: history as EngineInput["snapshot"]["inputs"]["crop_history"],
        soil_observations: [],
        constraints: { irrigation: "none", seasonal_water_allocation_mm: null } as EngineInput["snapshot"]["inputs"]["constraints"],
        priorities: { water_use: 3, soil_health: 3, income_stability: 3, workload: 3, weather_risk: 3, diversification: 3, excluded_crops: [] } as EngineInput["snapshot"]["inputs"]["priorities"],
        market_preferences: [],
      },
    },
    cropDataset: { id: "ds-crops", name: "crop-parameters", version: 1, sha256: "b".repeat(64), items: CROP_CATALOG },
    calendarDataset: { id: "ds-cal", name: "usda-nass-usual-dates-2010", version: 1, sha256: "c".repeat(64), items: NASS },
    weather: weather(2009, 2020) as EngineInput["weather"],
    soilSurvey: null as EngineInput["soilSurvey"],
  };
}

const noop = async () => ({ ok: true, message: "" });
const render = (result: ReturnType<typeof runEngine>) =>
  renderToString(
    createElement(RunExplorer, {
      runId: "run-1", result, plans: [], geometry: null, outdated: false, snapshotDate: null, scenarioId: "sc-1", aiAvailable: false,
      details: createElement("p", null, "DETAILS"),
      actions: { save: noop, update: noop, remove: noop, deleteRun: noop, rerun: noop, savePriorities: noop, draft: async () => ({ state: "auth" as const }) },
    } as Parameters<typeof RunExplorer>[0]),
  );

describe("run page", () => {
  it("explains a run in which every option was ruled out instead of crashing", () => {
    // No planting window outside the US calendar and no dated history: nothing can be compared.
    const result = runEngine(input({ calendarRegion: null, candidateCrops: ["maize"] }, []));
    const run = result.runs[0]!;
    expect(run.baseline).toBeNull();
    expect(run.alternatives).toHaveLength(0);
    const html = render(result);
    expect(html).toContain("No option could be compared in this run.");
    expect(html).toContain("DETAILS");
  });

  it("still renders the replay for a normal run", () => {
    const result = runEngine(input({ candidateCrops: ["maize", "soybean", "oats", "winter wheat"] }, [
      { id: "h1", zone_id: null, season_year: 2018, season: "main", crop_name: "Corn", planted_on: "2018-05-01", harvested_on: "2018-10-15" },
      { id: "h2", zone_id: null, season_year: 2019, season: "main", crop_name: "Soybeans", planted_on: "2019-05-15", harvested_on: "2019-10-01" },
    ]));
    expect(result.runs[0]!.alternatives.length).toBeGreaterThan(0);
    expect(render(result)).not.toContain("No option could be compared in this run.");
  });
});
