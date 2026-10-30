import { z } from "zod";

/**
 * Input schemas for farmer-owned records. They mirror the database CHECK constraints in
 * supabase/migrations/20261030130100_farm_records.sql so farmers get specific messages before a
 * write; the database remains the final authority. Every value here is a farmer report or a
 * farmer-supplied measurement; none is derived or estimated.
 */

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());
const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : typeof v === "string" ? Number(v) : v),
  z.number({ error: "Enter a number" }).finite().nullable(),
);
const optionalDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.iso.date({ error: "Use a date (YYYY-MM-DD)" }).nullable());
const name = z.string().trim().min(1, "Required").max(120, "At most 120 characters");

export const farmInput = z.object({
  name,
  countryCode: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim().toUpperCase()) : v),
    z.string().regex(/^[A-Z]{2}$/, "Use a two-letter ISO country code").nullable(),
  ),
  notes: optionalText(2000),
});
export type FarmInput = z.infer<typeof farmInput>;

export const fieldInput = z.object({ name, notes: optionalText(2000) });

export const BOUNDARY_SOURCES = ["farmer_drawn", "farmer_uploaded", "farmer_entered_coordinates"] as const;
export const ZONE_BASES = ["farmer_knowledge", "soil_survey", "yield_map", "other_farmer_record"] as const;
export const ZONE_BASIS_LABELS: Record<(typeof ZONE_BASES)[number], string> = {
  farmer_knowledge: "Farmer knowledge",
  soil_survey: "Soil survey map",
  yield_map: "Yield map",
  other_farmer_record: "Other farm record",
};

export const zoneInput = z.object({ name, basis: z.enum(ZONE_BASES), notes: optionalText(2000) });

export const SEASONS = ["main", "winter", "spring", "summer", "double_crop", "cover"] as const;
export const TILLAGE = ["conventional", "reduced", "no_till", "strip_till", "unknown"] as const;

export const cropHistoryInput = z
  .object({
    seasonYear: z.coerce.number().int().min(1950, "Year must be 1950 or later").max(2100),
    season: z.enum(SEASONS),
    cropName: z.string().trim().min(1, "Required").max(80),
    zoneId: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
    plantedOn: optionalDate,
    harvestedOn: optionalDate,
    tillage: z.preprocess((v) => (v === "" ? null : v), z.enum(TILLAGE).nullable()),
    reportedYield: optionalNumber.refine((v) => v === null || v >= 0, "Yield cannot be negative"),
    reportedYieldUnit: optionalText(24),
    notes: optionalText(2000),
  })
  .refine((v) => !v.plantedOn || !v.harvestedOn || v.harvestedOn >= v.plantedOn, { path: ["harvestedOn"], message: "Harvest must be on or after planting" })
  .refine((v) => (v.reportedYield === null) === !v.reportedYieldUnit, { path: ["reportedYieldUnit"], message: "Give a yield and its unit together" });

/** Soil properties and the single unit each is stored in (matches the DB constraint). */
export const SOIL_PROPERTIES = {
  ph_water: { label: "pH (water)", unit: "pH", min: 0, max: 14 },
  organic_matter: { label: "Organic matter", unit: "%", min: 0, max: 100 },
  soil_organic_carbon: { label: "Soil organic carbon", unit: "%", min: 0, max: 100 },
  clay: { label: "Clay", unit: "%", min: 0, max: 100 },
  sand: { label: "Sand", unit: "%", min: 0, max: 100 },
  silt: { label: "Silt", unit: "%", min: 0, max: 100 },
  cation_exchange_capacity: { label: "Cation exchange capacity", unit: "cmol(+)/kg", min: 0, max: 200 },
  bulk_density: { label: "Bulk density", unit: "g/cm3", min: 0.1, max: 2.6 },
  available_water_capacity: { label: "Available water capacity", unit: "cm/cm", min: 0, max: 0.7 },
  nitrate_n: { label: "Nitrate-N", unit: "mg/kg", min: 0, max: Number.POSITIVE_INFINITY },
  phosphorus: { label: "Phosphorus", unit: "mg/kg", min: 0, max: Number.POSITIVE_INFINITY },
  potassium: { label: "Potassium", unit: "mg/kg", min: 0, max: Number.POSITIVE_INFINITY },
  texture_class: { label: "Texture class", unit: null, min: null, max: null },
  drainage_class: { label: "Drainage class", unit: null, min: null, max: null },
} as const;
export type SoilProperty = keyof typeof SOIL_PROPERTIES;

export const soilObservationInput = z
  .object({
    property: z.enum(Object.keys(SOIL_PROPERTIES) as [SoilProperty, ...SoilProperty[]]),
    observedOn: z.iso.date({ error: "Use a date (YYYY-MM-DD)" }),
    depthTopCm: z.coerce.number().min(0, "Depth cannot be negative"),
    depthBottomCm: z.coerce.number().max(500, "At most 500 cm"),
    value: z.string().trim().min(1, "Required").max(80),
    zoneId: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()),
    evidenceClass: z.enum(["ground_measurement", "farmer_report"]),
    method: optionalText(200),
    source: optionalText(200),
  })
  .refine((v) => v.depthBottomCm > v.depthTopCm, { path: ["depthBottomCm"], message: "Bottom depth must be below the top depth" })
  .transform((v, ctx) => {
    const spec = SOIL_PROPERTIES[v.property];
    if (spec.unit === null) return { ...v, valueNumeric: null, valueText: v.value, unit: null };
    const n = Number(v.value);
    if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
      ctx.addIssue({ code: "custom", path: ["value"], message: `${spec.label} must be a number between ${spec.min} and ${Number.isFinite(spec.max) ? spec.max : "any"} ${spec.unit}` });
      return z.NEVER;
    }
    return { ...v, valueNumeric: n, valueText: null, unit: spec.unit };
  });

export const IRRIGATION = ["none", "full", "deficit", "supplemental", "unknown"] as const;
export const IRRIGATION_METHODS = ["center_pivot", "drip", "furrow", "sprinkler", "flood", "other"] as const;
export const EQUIPMENT = [
  "row_planter", "grain_drill", "no_till_drill", "combine_grain_header", "combine_corn_header",
  "forage_harvester", "baler", "sprayer", "manure_spreader", "cultivator",
] as const;

export const fieldConstraintsInput = z
  .object({
    irrigation: z.enum(IRRIGATION),
    irrigationMethod: z.preprocess((v) => (v === "" ? null : v), z.enum(IRRIGATION_METHODS).nullable()),
    seasonalWaterAllocationMm: optionalNumber.refine((v) => v === null || (v >= 0 && v <= 3000), "Between 0 and 3000 mm"),
    waterSource: optionalText(200),
    equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length),
    equipmentNotes: optionalText(2000),
  })
  .refine((v) => v.irrigationMethod === null || ["full", "deficit", "supplemental"].includes(v.irrigation), {
    path: ["irrigationMethod"],
    message: "Only set a method when the field is irrigated",
  });

export const PRIORITY_KEYS = ["water_use", "soil_health", "income_stability", "workload", "weather_risk", "diversification"] as const;
export const PRIORITY_LABELS: Record<(typeof PRIORITY_KEYS)[number], string> = {
  water_use: "Use less water",
  soil_health: "Soil health",
  income_stability: "Stable income",
  workload: "Manageable workload",
  weather_risk: "Lower weather risk",
  diversification: "Crop diversity",
};
const weight = z.coerce.number().int().min(0).max(5);
export const prioritiesInput = z.object({
  water_use: weight,
  soil_health: weight,
  income_stability: weight,
  workload: weight,
  weather_risk: weight,
  diversification: weight,
  excludedCrops: z
    .string()
    .transform((s) => [...new Set(s.split(",").map((c) => c.trim()).filter(Boolean))])
    .pipe(z.array(z.string().max(80)).max(30, "At most 30 crops")),
  notes: optionalText(2000),
});

export const MARKET_PREFERENCES = ["preferred", "acceptable", "avoid", "no_market_access"] as const;
export const marketPreferenceInput = z.object({
  cropName: z.string().trim().min(1, "Required").max(80),
  preference: z.enum(MARKET_PREFERENCES),
  hasContract: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  notes: optionalText(2000),
});

/** Turns zod issues into a field → message map for forms. */
export function issuesByField(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
