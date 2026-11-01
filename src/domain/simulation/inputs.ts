import { z } from "zod";

import { cropParamsSchema } from "./catalog";
import { calendarEntrySchema } from "./nass";

/**
 * The engine's complete input: a frozen snapshot plus the immutable rows it pins (reference
 * datasets by id and hash, the POWER daily series and the SSURGO aggregate of pinned retrievals).
 * Built by the worker; nothing else is read. Parsing is lenient about extra keys and strict about
 * the values the engine uses.
 */

const num = z.number().finite();
const nullableNum = num.nullable();

export const snapshotInputsSchema = z
  .object({
    input_schema_version: z.number().int(),
    scenario: z.object({ id: z.string(), name: z.string(), settings_schema_version: z.number().int(), settings: z.unknown() }).passthrough(),
    field: z
      .object({
        id: z.string(),
        name: z.string(),
        area_ha: nullableNum.optional().default(null),
        centroid: z.object({ type: z.literal("Point"), coordinates: z.tuple([num, num]) }).nullable(),
      })
      .passthrough(),
    zones: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()).default([]),
    crop_history: z
      .array(
        z
          .object({
            id: z.string(),
            zone_id: z.string().nullable(),
            season_year: z.number().int(),
            season: z.string(),
            crop_name: z.string(),
            planted_on: z.string().nullable(),
            harvested_on: z.string().nullable(),
          })
          .passthrough(),
      )
      .default([]),
    soil_observations: z
      .array(
        z
          .object({
            id: z.string(),
            zone_id: z.string().nullable(),
            property: z.string(),
            value_numeric: nullableNum,
            depth_top_cm: num,
            depth_bottom_cm: num,
            evidence_class: z.string(),
            observed_on: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    constraints: z.object({ irrigation: z.string().nullable(), seasonal_water_allocation_mm: nullableNum }).passthrough().nullable().default(null),
    priorities: z
      .object({
        water_use: num, soil_health: num, income_stability: num, workload: num, weather_risk: num, diversification: num,
        excluded_crops: z.array(z.string()).default([]),
      })
      .passthrough()
      .nullable()
      .default(null),
    market_preferences: z.array(z.object({ crop_name: z.string(), preference: z.string(), has_contract: z.boolean() }).passthrough()).default([]),
  })
  .passthrough();

export type SnapshotInputs = z.infer<typeof snapshotInputsSchema>;

const datasetRef = z.object({ id: z.string(), name: z.string(), version: z.number().int(), sha256: z.string() });

export const engineInputSchema = z.object({
  engineVersion: z.string(),
  snapshot: z.object({ id: z.string(), inputsSha256: z.string(), inputs: snapshotInputsSchema }),
  cropDataset: datasetRef.extend({ items: z.array(cropParamsSchema) }).nullable(),
  calendarDataset: datasetRef.extend({ items: z.array(calendarEntrySchema) }).nullable(),
  weather: z
    .object({
      retrievalId: z.string(),
      productVersion: z.string().nullable(),
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      tmax: z.array(nullableNum),
      tmin: z.array(nullableNum),
      precip: z.array(nullableNum),
    })
    .nullable(),
  soilSurvey: z.object({ retrievalId: z.string(), awcMm0to100: nullableNum }).nullable(),
});

export type EngineInput = z.infer<typeof engineInputSchema>;
