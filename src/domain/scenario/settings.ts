import { z } from "zod";

/**
 * Scenario settings, schema version 1. A scenario is a set of what-if choices (evidence class:
 * hypothetical_input). The replay window selects past weather years to replay; it is a historical
 * replay, never a forecast. Bumping the schema means adding a v2 parser, not editing v1, so stored
 * scenarios keep parsing.
 */
export const SCENARIO_SETTINGS_SCHEMA_VERSION = 1;

/** NASA POWER daily meteorology starts in 1981 (docs/research/data-sources.md). */
export const REPLAY_EARLIEST_YEAR = 1981;

export const IRRIGATION_ASSUMPTIONS = ["as_recorded", "rainfed", "full_irrigation"] as const;

export function scenarioSettingsV1(currentYear: number) {
  const lastFullYear = currentYear - 1;
  return z
    .object({
      candidateCrops: z
        .array(z.string().trim().min(1).max(80))
        .min(1, "Add at least one crop")
        .max(8, "At most 8 crops")
        .refine((a) => new Set(a.map((c) => c.toLowerCase())).size === a.length, "Each crop only once"),
      rotationYears: z.coerce.number().int().min(1, "At least 1 year").max(10, "At most 10 years"),
      replayFromYear: z.coerce.number().int().min(REPLAY_EARLIEST_YEAR, `Replay data starts in ${REPLAY_EARLIEST_YEAR}`).max(lastFullYear),
      replayToYear: z.coerce.number().int().min(REPLAY_EARLIEST_YEAR).max(lastFullYear, `Only complete past years (≤ ${lastFullYear}) can be replayed`),
      irrigationAssumption: z.enum(IRRIGATION_ASSUMPTIONS),
      notes: z.string().trim().max(2000).optional().default(""),
    })
    .strict()
    .refine((s) => s.replayToYear >= s.replayFromYear, { path: ["replayToYear"], message: "End year must not be before start year" });
}

export type ScenarioSettingsV1 = z.infer<ReturnType<typeof scenarioSettingsV1>>;

