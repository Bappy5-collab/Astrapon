import { z } from "zod";

import { isMonthDay } from "@/domain/simulation/dates";

/**
 * Scenario settings. A scenario is a set of what-if choices (evidence class: hypothetical_input).
 * The replay window selects past weather years to replay; it is a historical replay, never a
 * forecast. Bumping the schema means adding a parser, not editing an old one, so stored scenarios
 * keep parsing: v1 rows are upgraded in memory by `parseScenarioSettings`.
 */
export const SCENARIO_SETTINGS_SCHEMA_VERSION = 2;

/** NASA POWER daily meteorology starts in 1981 (docs/research/data-sources.md). */
export const REPLAY_EARLIEST_YEAR = 1981;

export const IRRIGATION_ASSUMPTIONS = ["as_recorded", "rainfed", "full_irrigation"] as const;

/** The engine compares rotations up to this many years (docs/scientific-methodology.md §10). */
export const MAX_ROTATION_YEARS = 4;
export const MAX_PLANTING_WINDOWS = 6;

const candidateCrops = z
  .array(z.string().trim().min(1).max(80))
  .min(1, "Add at least one crop")
  .max(8, "At most 8 crops")
  .refine((a) => new Set(a.map((c) => c.toLowerCase())).size === a.length, "Each crop only once");

export function scenarioSettingsV1(currentYear: number) {
  const lastFullYear = currentYear - 1;
  return z
    .object({
      candidateCrops,
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

export const plantingWindowSchema = z
  .object({
    crop: z.string().trim().min(1, "Crop required").max(80),
    plantFrom: z.string().refine(isMonthDay, "Use MM-DD, e.g. 11-15"),
    plantTo: z.string().refine(isMonthDay, "Use MM-DD, e.g. 12-10"),
    lengthDays: z.coerce.number().int().min(20, "At least 20 days").max(330, "At most 330 days"),
  })
  .strict();
export type PlantingWindow = z.infer<typeof plantingWindowSchema>;

/** Scenario settings v2: v1 plus calendar region, planting windows, turnaround and weather transformations. */
export function scenarioSettingsV2(currentYear: number) {
  const lastFullYear = currentYear - 1;
  return z
    .object({
      candidateCrops,
      rotationYears: z.coerce.number().int().min(1, "At least 1 year").max(MAX_ROTATION_YEARS, `At most ${MAX_ROTATION_YEARS} years`),
      replayFromYear: z.coerce.number().int().min(REPLAY_EARLIEST_YEAR, `Replay data starts in ${REPLAY_EARLIEST_YEAR}`).max(lastFullYear),
      replayToYear: z.coerce.number().int().min(REPLAY_EARLIEST_YEAR).max(lastFullYear, `Only complete past years (≤ ${lastFullYear}) can be replayed`),
      irrigationAssumption: z.enum(IRRIGATION_ASSUMPTIONS),
      /** A USDA NASS 2010 state name, or null for "only my own dates". */
      calendarRegion: z.string().trim().min(1).max(60).nullable(),
      plantingWindows: z.array(plantingWindowSchema).max(MAX_PLANTING_WINDOWS),
      /** Days needed between a harvest and the next planting; null = not stated (0 is assumed and disclosed). */
      turnaroundDays: z.coerce.number().int().min(0).max(120).nullable(),
      precipitationChangePct: z.coerce.number().min(-50, "At least −50%").max(50, "At most +50%"),
      temperatureChangeC: z.coerce.number().min(-5, "At least −5 °C").max(5, "At most +5 °C"),
      notes: z.string().trim().max(2000).optional().default(""),
    })
    .strict()
    .refine((s) => s.replayToYear >= s.replayFromYear, { path: ["replayToYear"], message: "End year must not be before start year" })
    .refine((s) => s.replayToYear - s.replayFromYear + 1 <= 45, { path: ["replayFromYear"], message: "At most 45 replay years" });
}

export type ScenarioSettingsV2 = z.infer<ReturnType<typeof scenarioSettingsV2>>;

/** Parses stored settings of either version into v2. v1 gets explicit, neutral defaults. */
export function parseScenarioSettings(version: number, raw: unknown, currentYear: number): { ok: true; settings: ScenarioSettingsV2; upgradedFrom: number | null } | { ok: false } {
  if (version === 2) {
    const r = scenarioSettingsV2(currentYear).safeParse(raw);
    return r.success ? { ok: true, settings: r.data, upgradedFrom: null } : { ok: false };
  }
  if (version === 1) {
    const r = scenarioSettingsV1(currentYear).safeParse(raw);
    if (!r.success) return { ok: false };
    return {
      ok: true,
      upgradedFrom: 1,
      settings: {
        ...r.data,
        rotationYears: Math.min(r.data.rotationYears, MAX_ROTATION_YEARS),
        calendarRegion: null,
        plantingWindows: [],
        turnaroundDays: null,
        precipitationChangePct: 0,
        temperatureChangeC: 0,
      },
    };
  }
  return { ok: false };
}

/** Engine-side parse of settings frozen in a snapshot: no clock (years were validated when saved). */
export const frozenSettingsV2 = z
  .object({
    candidateCrops: z.array(z.string()).min(1).max(8),
    rotationYears: z.number().int().min(1).max(10),
    replayFromYear: z.number().int().min(REPLAY_EARLIEST_YEAR),
    replayToYear: z.number().int().min(REPLAY_EARLIEST_YEAR),
    irrigationAssumption: z.enum(IRRIGATION_ASSUMPTIONS),
    calendarRegion: z.string().nullable().optional().default(null),
    plantingWindows: z.array(plantingWindowSchema).optional().default([]),
    turnaroundDays: z.number().int().min(0).max(120).nullable().optional().default(null),
    precipitationChangePct: z.number().min(-50).max(50).optional().default(0),
    temperatureChangeC: z.number().min(-5).max(5).optional().default(0),
    notes: z.string().optional().default(""),
  })
  .passthrough();
export type FrozenSettings = z.infer<typeof frozenSettingsV2>;
