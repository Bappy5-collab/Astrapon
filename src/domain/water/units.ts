/**
 * Units used by the Water & Energy planner. Every conversion is explicit; nothing converts
 * implicitly between depth, elevation, volume, power and energy.
 */

/** International foot, exactly (NIST). */
export const FT_TO_M = 0.3048;
/** 1 kWh = 3.6 MJ. */
export const MJ_PER_KWH = 3.6;
/** 1 kWh = 3.6e6 J. */
export const J_PER_KWH = 3.6e6;
/** Reference irradiance that defines one "peak sun hour": 1 kW/m² (STC). */
export const REFERENCE_IRRADIANCE_KW_PER_M2 = 1;

/** Default physical constants; both are stated in every result and editable as assumptions. */
export const DEFAULT_RHO = 1000; // kg/m³ (fresh water, ≈ 4–20 °C; 998 at 20 °C)
export const DEFAULT_G = 9.81; // m/s²
/** Kinematic viscosity of water at 20 °C, m²/s (used only for the Reynolds number). */
export const NU_WATER_20C = 1.004e-6;

/** 1 mm of water over 1 ha is 10 m³ (1 mm × 10 000 m² = 10 m³). */
export const mmOverHaToM3 = (mm: number, hectares: number) => mm * hectares * 10;

export type LengthUnit = "m" | "ft";
export function lengthToM(value: number, unit: LengthUnit): number {
  if (unit === "m") return value;
  if (unit === "ft") return value * FT_TO_M;
  throw new Error(`Unknown length unit: ${unit as string}`);
}

/** Parses a provider unit string; returns null for anything not explicitly a foot or metre. */
export function parseLengthUnit(unit: string | null | undefined): LengthUnit | null {
  const u = (unit ?? "").trim().toLowerCase();
  if (["m", "meter", "meters", "metre", "metres"].includes(u)) return "m";
  if (["ft", "feet", "foot", "ft."].includes(u)) return "ft";
  return null;
}

/** Converts MJ/m²/day to kWh/m²/day. Use only when the provider metadata states MJ. */
export const mjToKwh = (mj: number) => mj / MJ_PER_KWH;

/** Pressure (kPa) to head (m of water). */
export const kPaToHeadM = (kPa: number, rho = DEFAULT_RHO, g = DEFAULT_G) => (kPa * 1000) / (rho * g);

export const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
