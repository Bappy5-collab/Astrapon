import { describe, expect, it } from "vitest";

import { fieldSteps, nextStep, stepsDone, type FieldFacts } from "./progress";

const EMPTY: FieldFacts = {
  hasBoundary: false,
  historyCount: 0,
  datedHistoryCount: 0,
  soilCount: 0,
  hasSoilSurvey: false,
  waterSaved: false,
  prioritiesSaved: false,
  hasWeather: false,
  weatherPending: false,
  scenarioCount: 0,
  latestRunId: null,
  waterPlanCount: 0,
};

describe("field steps", () => {
  it("starts with drawing the field", () => {
    const s = fieldSteps("f1", EMPTY);
    expect(s.map((x) => x.id)).toEqual(["boundary", "history", "soil_water", "priorities", "weather", "compare", "water_energy"]);
    expect(nextStep(s)?.id).toBe("boundary");
    expect(stepsDone(s)).toBe(0);
  });

  it("optional steps never block the next required step", () => {
    const s = fieldSteps("f1", { ...EMPTY, hasBoundary: true, historyCount: 2, datedHistoryCount: 2 });
    expect(nextStep(s)?.id).toBe("weather");
    expect(s.find((x) => x.id === "soil_water")?.state).toBe("optional");
    expect(s.find((x) => x.id === "priorities")?.state).toBe("optional");
  });

  it("seasons without dates do not count, and the status says why", () => {
    const s = fieldSteps("f1", { ...EMPTY, hasBoundary: true, historyCount: 1 });
    const h = s.find((x) => x.id === "history")!;
    expect(h.state).toBe("next");
    expect(h.status).toMatch(/no planting and harvest dates/);
  });

  it("a soil survey counts as soil, and a finished run links to the result", () => {
    const s = fieldSteps("f1", { ...EMPTY, hasBoundary: true, historyCount: 2, datedHistoryCount: 2, hasSoilSurvey: true, waterSaved: true, prioritiesSaved: true, hasWeather: true, scenarioCount: 1, latestRunId: "r9" });
    expect(stepsDone(s)).toBe(6);
    expect(nextStep(s)).toBeNull();
    expect(s.find((x) => x.id === "compare")?.href).toBe("/runs/r9");
    // Water & Energy is optional and opens with the latest comparison.
    const w = s.find((x) => x.id === "water_energy")!;
    expect(w.state).toBe("optional");
    expect(w.href).toBe("/fields/f1/water?run=r9");
    expect(fieldSteps("f1", { ...EMPTY, waterPlanCount: 2 }).find((x) => x.id === "water_energy")?.state).toBe("done");
  });
});
