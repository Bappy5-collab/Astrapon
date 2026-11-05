/**
 * Pumping head, power and energy. Pure, deterministic, unit-explicit.
 *
 * Methods (see docs/water-energy-methodology.md):
 *  - Total dynamic head (TDH) = vertical lift + friction loss (pipe walls, elbows, valves, fittings)
 *    + pressure head at the delivery point, as defined in Virginia Cooperative Extension BSE-346NP,
 *    "Solar Powered Water Pumping Systems" (Ignosh, Booher & Iqbal, 2024). Astrapon adds the outlet
 *    velocity head v²/2g explicitly (it can be switched off) and splits friction into pipe (Darcy–
 *    Weisbach) and fitting (Σ K) terms. For a well the vertical lift starts at the pumping water level.
 *  - Pipe friction: Darcy–Weisbach h_f = f (L/D) v²/2g with the Swamee–Jain (1976) explicit
 *    approximation of the Colebrook friction factor for turbulent flow (Re ≥ 4000) and f = 64/Re
 *    for laminar flow (Re < 2000). Between them the turbulent value is used and the result is
 *    flagged as transitional.
 *  - Minor losses: Σ K · v²/2g with a farmer- or default-supplied Σ K.
 *  - Hydraulic power P_h = ρ g Q H; electrical input P_e = P_h / η at the motor terminals, where η
 *    is the stated pump-and-motor ("wire-to-water") efficiency.
 *  - Energy E = ρ g V H / (3.6e6 η) kWh, calculated per interval and summed.
 *
 * Scope limits: no pump model is selected (no verified performance curve or operating point);
 * surface-pump suction lift and cavitation (NPSH) are not evaluated; head is steady per interval.
 */

import { DEFAULT_G, DEFAULT_RHO, J_PER_KWH, kPaToHeadM, NU_WATER_20C } from "./units";

export class WaterInputError extends Error {}

export type LiftInput =
  /**
   * A well. Depths are metres below the ground at the well head; negative = water above ground
   * (artesian), kept as negative. `pumping` is a measured pumping water level (already includes
   * drawdown). `static_plus_drawdown` adds a stated drawdown to a static level, exactly once.
   */
  | { source: "well"; level: { kind: "pumping"; depthM: number } | { kind: "static_plus_drawdown"; staticDepthM: number; drawdownM: number }; deliveryAboveGroundM: number }
  /** A surface source: the delivery point's height above the water surface (negative = below it). */
  | { source: "surface"; deliveryAboveWaterM: number };

export type PipeInput = {
  /** Route length of the pipe (m), farmer-confirmed or a stated scenario. Not the straight-line distance unless the farmer says so. */
  lengthM: number;
  innerDiameterMm: number;
  /** Absolute roughness ε (mm). */
  roughnessMm: number;
  /** Sum of minor-loss coefficients of fittings, valves, entrance and bends. */
  minorLossK: number;
};

export type HeadInput = {
  lift: LiftInput;
  /** Pressure required at the delivery point (kPa); 0 for free discharge into a channel or tank. */
  deliveryPressureKPa: number;
  pipe: PipeInput;
  /** Include the outlet velocity head v²/2g (default true). */
  includeVelocityHead?: boolean;
  rho?: number;
  g?: number;
};

export type HeadBreakdown = {
  flowM3PerS: number;
  velocityMPerS: number;
  reynolds: number;
  regime: "none" | "laminar" | "transitional" | "turbulent";
  frictionFactor: number | null;
  staticLiftM: number;
  pressureHeadM: number;
  frictionHeadM: number;
  minorHeadM: number;
  velocityHeadM: number;
  /** Algebraic sum; may be ≤ 0 for a gravity-fed layout. */
  totalHeadM: number;
};

const finite = (v: number, name: string) => {
  if (!Number.isFinite(v)) throw new WaterInputError(`${name} must be a number`);
  return v;
};

export function validateEfficiency(eta: number, name = "Efficiency"): number {
  if (!Number.isFinite(eta) || eta <= 0 || eta > 1) throw new WaterInputError(`${name} must be greater than 0 and at most 1 (100 %)`);
  return eta;
}

export function staticLiftM(lift: LiftInput): number {
  if (lift.source === "surface") return finite(lift.deliveryAboveWaterM, "Delivery height above water");
  const depth =
    lift.level.kind === "pumping"
      ? finite(lift.level.depthM, "Pumping water level")
      : (() => {
          const dd = finite(lift.level.drawdownM, "Drawdown");
          if (dd < 0) throw new WaterInputError("Drawdown cannot be negative");
          return finite(lift.level.staticDepthM, "Static water level") + dd;
        })();
  return depth + finite(lift.deliveryAboveGroundM, "Delivery height above ground");
}

/** Swamee–Jain explicit friction factor (turbulent), valid ≈ 5e3 ≤ Re ≤ 1e8, 1e-6 ≤ ε/D ≤ 1e-2. */
export function swameeJain(reynolds: number, relRoughness: number): number {
  return 0.25 / Math.log10(relRoughness / 3.7 + 5.74 / reynolds ** 0.9) ** 2;
}

export function headBreakdown(input: HeadInput, flowM3PerS: number): HeadBreakdown {
  const rho = input.rho ?? DEFAULT_RHO;
  const g = input.g ?? DEFAULT_G;
  if (!(rho > 0) || !(g > 0)) throw new WaterInputError("Density and gravity must be positive");
  finite(flowM3PerS, "Flow");
  if (flowM3PerS < 0) throw new WaterInputError("Flow cannot be negative");
  const { lengthM, innerDiameterMm, roughnessMm, minorLossK } = input.pipe;
  if (!(finite(lengthM, "Pipe length") >= 0)) throw new WaterInputError("Pipe length cannot be negative");
  if (!(finite(innerDiameterMm, "Pipe diameter") > 0)) throw new WaterInputError("Pipe diameter must be positive");
  if (!(finite(roughnessMm, "Pipe roughness") >= 0)) throw new WaterInputError("Pipe roughness cannot be negative");
  if (!(finite(minorLossK, "Fitting loss coefficient") >= 0)) throw new WaterInputError("Fitting loss coefficient cannot be negative");
  const pressure = finite(input.deliveryPressureKPa, "Delivery pressure");

  const D = innerDiameterMm / 1000;
  const area = (Math.PI * D * D) / 4;
  const v = flowM3PerS / area;
  const vh = (v * v) / (2 * g);
  const re = (v * D) / NU_WATER_20C;
  let f: number | null = null;
  let regime: HeadBreakdown["regime"] = "none";
  if (flowM3PerS > 0) {
    if (re < 2000) { f = 64 / re; regime = "laminar"; }
    else { f = swameeJain(Math.max(re, 4000), roughnessMm / 1000 / D); regime = re < 4000 ? "transitional" : "turbulent"; }
  }
  const staticLift = staticLiftM(input.lift);
  const pressureHead = kPaToHeadM(pressure, rho, g);
  const friction = f == null ? 0 : f * (lengthM / D) * vh;
  const minor = minorLossK * vh;
  const velocity = input.includeVelocityHead === false ? 0 : vh;
  return { flowM3PerS, velocityMPerS: v, reynolds: re, regime, frictionFactor: f, staticLiftM: staticLift, pressureHeadM: pressureHead, frictionHeadM: friction, minorHeadM: minor, velocityHeadM: velocity, totalHeadM: staticLift + pressureHead + friction + minor + velocity };
}

/** Hydraulic power (W) = ρ g Q H; 0 when H ≤ 0 (gravity can deliver; never negative). */
export function hydraulicPowerW(flowM3PerS: number, headM: number, rho = DEFAULT_RHO, g = DEFAULT_G): number {
  return headM <= 0 || flowM3PerS <= 0 ? 0 : rho * g * flowM3PerS * headM;
}

/** Electrical input power at the motor terminals (W). */
export function electricalPowerW(flowM3PerS: number, headM: number, etaPumpMotor: number, rho = DEFAULT_RHO, g = DEFAULT_G): number {
  return hydraulicPowerW(flowM3PerS, headM, rho, g) / validateEfficiency(etaPumpMotor, "Pump-and-motor efficiency");
}

/** Electrical energy (kWh) to lift volume V (m³) through head H: ρ g V H / (3.6e6 η). Never negative. */
export function electricalEnergyKWh(volumeM3: number, headM: number, etaPumpMotor: number, rho = DEFAULT_RHO, g = DEFAULT_G): number {
  validateEfficiency(etaPumpMotor, "Pump-and-motor efficiency");
  if (!Number.isFinite(volumeM3) || volumeM3 < 0) throw new WaterInputError("Volume cannot be negative");
  return headM <= 0 || volumeM3 === 0 ? 0 : (rho * g * volumeM3 * headM) / (J_PER_KWH * etaPumpMotor);
}

/** Q = V / (runtime_hours × 3600). */
export function flowFromRuntime(volumeM3: number, runtimeHours: number): number {
  if (!(runtimeHours > 0 && runtimeHours <= 24)) throw new WaterInputError("Pumping hours per day must be more than 0 and at most 24");
  if (!(volumeM3 >= 0)) throw new WaterInputError("Volume cannot be negative");
  return volumeM3 / (runtimeHours * 3600);
}

export type IntervalResult = {
  /** Interval label (e.g. "2019-07"). */
  key: string;
  days: number;
  volumeM3: number;
  /** Average volume per pumping day in the interval. */
  dailyVolumeM3: number;
  flowM3PerH: number;
  head: HeadBreakdown;
  electricalPowerKW: number;
  energyKWh: number;
  gravity: boolean;
};

/**
 * Energy for a sequence of intervals (e.g. months). Each interval has its own flow (daily volume ÷
 * runtime), its own head (friction depends on flow), and its own energy; totals are sums of the
 * intervals, never one average applied to the whole period.
 */
export function pumpIntervals(intervals: { key: string; days: number; volumeM3: number }[], head: HeadInput, runtimeHoursPerDay: number, etaPumpMotor: number): IntervalResult[] {
  validateEfficiency(etaPumpMotor, "Pump-and-motor efficiency");
  return intervals.map(({ key, days, volumeM3 }) => {
    if (!(days > 0)) throw new WaterInputError("Interval length must be positive");
    const daily = volumeM3 / days;
    const q = flowFromRuntime(daily, runtimeHoursPerDay);
    const h = headBreakdown(head, q);
    const energy = electricalEnergyKWh(volumeM3, h.totalHeadM, etaPumpMotor, head.rho, head.g);
    return {
      key, days, volumeM3, dailyVolumeM3: daily, flowM3PerH: q * 3600, head: h,
      electricalPowerKW: electricalPowerW(q, h.totalHeadM, etaPumpMotor, head.rho, head.g) / 1000,
      energyKWh: energy,
      gravity: volumeM3 > 0 && h.totalHeadM <= 0,
    };
  });
}
