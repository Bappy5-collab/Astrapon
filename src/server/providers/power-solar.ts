import { mjToKwh } from "@/domain/water/units";
import { cleanIrradiation, POWER_SOLAR_FILL, summariseSolar, type DailyIrradiation } from "@/domain/water/solar";

import { fetchText } from "./http";

import type { SolarOutcome, SolarProvenance } from "@/domain/water/lookup-types";

export type { SolarOutcome, SolarProvenance };

/**
 * NASA POWER daily ALLSKY_SFC_SW_DWN (all-sky surface shortwave downward irradiance) for the
 * Water & Energy planner. Renewable Energy (RE) community, which reports kWh/m²/day; the unit is
 * read from each response and MJ is converted only if the response says MJ.
 * Docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
 * Upstream: CERES SYN1deg, then FLASHFlux for recent dates (named in the response header).
 * Spatial support: the POWER solar grid cell (≈ 1°), not the field.
 */
export const POWER_SOLAR_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";


/** The 10 most recent complete calendar years before `now`. */
export function solarYears(now: Date): [number, number] {
  const last = now.getUTCFullYear() - 1;
  return [last - 9, last];
}

export function buildSolarUrl(lat: number, lon: number, years: [number, number]): string {
  const p = new URLSearchParams({ parameters: "ALLSKY_SFC_SW_DWN", community: "RE", longitude: lon.toFixed(4), latitude: lat.toFixed(4), start: `${years[0]}0101`, end: `${years[1]}1231`, format: "JSON", "time-standard": "LST" });
  return `${POWER_SOLAR_URL}?${p}`;
}

export async function fetchSolar(lat: number, lon: number, now = new Date()): Promise<SolarOutcome> {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return { ok: false, error: "Invalid location" };
  const years = solarYears(now);
  const url = buildSolarUrl(lat, lon, years);
  const res = await fetchText(url, { timeoutMs: 45_000, attempts: 2, headers: { Accept: "application/json" } });
  if (!res.ok) return { ok: false, error: `NASA POWER did not answer (${res.error}).` };
  let body: {
    geometry?: { coordinates?: number[] };
    properties?: { parameter?: { ALLSKY_SFC_SW_DWN?: Record<string, number> } };
    header?: { api?: { version?: string }; sources?: string[]; fill_value?: number };
    parameters?: { ALLSKY_SFC_SW_DWN?: { units?: string } };
  };
  try {
    body = JSON.parse(res.body);
  } catch {
    return { ok: false, error: "NASA POWER returned an unreadable answer." };
  }
  const series = body.properties?.parameter?.ALLSKY_SFC_SW_DWN;
  const units = body.parameters?.ALLSKY_SFC_SW_DWN?.units ?? "";
  if (!series || !Object.keys(series).length) return { ok: false, error: "NASA POWER returned no solar values for this location." };
  const isKwh = /^kW-?hr\/m\^2\/day$/i.test(units);
  const isMj = /^MJ\/m\^2\/day$/i.test(units);
  if (!isKwh && !isMj) return { ok: false, error: `NASA POWER reported an unexpected unit (${units || "none"}); solar values were not used.` };
  const fill = body.header?.fill_value ?? POWER_SOLAR_FILL;
  const days: DailyIrradiation[] = Object.entries(series)
    .map(([k, v]) => {
      const date = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
      const raw = v === fill ? null : v;
      const kwh = raw == null ? null : isMj ? mjToKwh(raw) : raw;
      return { date, kwhPerM2: cleanIrradiation(kwh) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const c = body.geometry?.coordinates;
  return {
    ok: true,
    days,
    summary: summariseSolar(days),
    provenance: {
      provider: "NASA POWER",
      product: "Daily API, ALLSKY_SFC_SW_DWN, community RE",
      apiVersion: body.header?.api?.version ?? null,
      upstream: body.header?.sources ?? [],
      units: isMj ? `${units} (converted to kWh/m²/day ÷ 3.6)` : units,
      fillValue: fill,
      cellNote: "All-sky irradiation on a horizontal surface for the POWER solar grid cell (≈ 1° × 1°), not measured at the field. Local shading is unknown.",
      url,
      retrievedAt: res.retrieval.retrievedAt,
      bodySha256: res.retrieval.bodySha256,
      requestedYears: years,
      gridPoint: Array.isArray(c) && c.length >= 2 ? [c[0]!, c[1]!] : null,
    },
  };
}
