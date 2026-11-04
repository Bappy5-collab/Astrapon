/**
 * The farmer's path through one field, as plain steps. Pure: the page passes in what is stored and
 * gets back each step's state plus the single next thing to do. Nothing here judges the data; a
 * step is "done" when the farmer has recorded something for it.
 */

export type FieldFacts = {
  hasBoundary: boolean;
  historyCount: number;
  /** Seasons with both a planting and a harvest date (what the engine needs to rebuild the existing rotation). */
  datedHistoryCount: number;
  soilCount: number;
  /** A soil survey retrieval exists (SSURGO, US only). */
  hasSoilSurvey: boolean;
  waterSaved: boolean;
  prioritiesSaved: boolean;
  /** NASA POWER weather is stored for the field. */
  hasWeather: boolean;
  /** Weather job queued or running now. */
  weatherPending: boolean;
  scenarioCount: number;
  /** Id of the newest finished run, if any. */
  latestRunId: string | null;
};

export type StepId = "boundary" | "history" | "soil_water" | "priorities" | "weather" | "compare";
export type StepState = "done" | "next" | "todo" | "optional";

export type FieldStep = {
  id: StepId;
  title: string;
  /** One short sentence: what this step means for the farmer. */
  why: string;
  /** What is recorded now, in a few words. */
  status: string;
  state: StepState;
  /** Where the farmer goes to do (or review) it. */
  href: string;
  action: string;
};

type RawStep = Omit<FieldStep, "state"> & { done: boolean; optional?: boolean };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function fieldSteps(fieldId: string, f: FieldFacts): FieldStep[] {
  const rec = `/fields/${fieldId}/records`;
  const raw: RawStep[] = [
    {
      id: "boundary",
      title: "Mark your field on the map",
      why: "Tells Astrapon where the field is, so it can find its weather and soil.",
      status: f.hasBoundary ? "Field shape saved" : "Not drawn yet",
      href: `/fields/${fieldId}`,
      action: f.hasBoundary ? "View in 3D" : "Draw the field",
      done: f.hasBoundary,
    },
    {
      id: "history",
      title: "Tell us what you grew",
      why: "Your past seasons become the “existing practice” that every option is compared with.",
      status:
        f.historyCount === 0
          ? "No seasons yet"
          : f.datedHistoryCount === 0
            ? `${plural(f.historyCount, "season")}, but no planting and harvest dates`
            : `${plural(f.historyCount, "season")} recorded`,
      href: `${rec}#history`,
      action: f.historyCount ? "Add or edit seasons" : "Add a season",
      done: f.datedHistoryCount > 0,
    },
    {
      id: "soil_water",
      title: "Your soil and water",
      why: "How much water your soil holds and whether you can irrigate rules some crops in or out.",
      status: [f.soilCount ? plural(f.soilCount, "soil test") : f.hasSoilSurvey ? "Soil survey found" : "No soil test", f.waterSaved ? "water saved" : "water not set"].join(" · "),
      href: `${rec}#soil`,
      action: "Add soil and water",
      done: (f.soilCount > 0 || f.hasSoilSurvey) && f.waterSaved,
      optional: true,
    },
    {
      id: "priorities",
      title: "What matters most to you",
      why: "Saving water, less work, steady income… your choices decide how options are ranked.",
      status: f.prioritiesSaved ? "Priorities saved" : "Using equal weights",
      href: `${rec}#priorities`,
      action: f.prioritiesSaved ? "Change priorities" : "Set priorities",
      done: f.prioritiesSaved,
      optional: true,
    },
    {
      id: "weather",
      title: "Get weather for your field",
      why: "Downloads 40+ years of NASA weather for this place. It runs in the background.",
      status: f.hasWeather ? "Weather ready" : f.weatherPending ? "Downloading…" : "Not downloaded yet",
      href: `/fields/${fieldId}/evidence`,
      action: f.hasWeather ? "See weather and soil" : "Get weather",
      done: f.hasWeather,
    },
    {
      id: "compare",
      title: "Compare crop options",
      why: "Replays past weather for your rotation and for alternatives, side by side.",
      status: f.latestRunId ? "Results ready" : f.scenarioCount ? `${plural(f.scenarioCount, "comparison")} set up, not run yet` : "Not started",
      href: f.latestRunId ? `/runs/${f.latestRunId}` : `${rec}#compare`,
      action: f.latestRunId ? "See results" : f.scenarioCount ? "Run a comparison" : "Start a comparison",
      done: Boolean(f.latestRunId),
    },
  ];
  // The first required step not done is "next"; optional steps never block it.
  const nextIdx = raw.findIndex((s) => !s.done && !s.optional);
  return raw.map(({ done, optional, ...s }, i) => ({ ...s, state: done ? "done" : i === nextIdx ? "next" : optional ? "optional" : "todo" }));
}

/** The one step to suggest now (the first required step not done), or null when the path is complete. */
export const nextStep = (steps: FieldStep[]) => steps.find((s) => s.state === "next") ?? null;

export const stepsDone = (steps: FieldStep[]) => steps.filter((s) => s.state === "done").length;
