/**
 * Shapes of the Water & Energy lookups as returned to the browser. Kept in the domain so client
 * components can use them without importing server modules.
 */
import type { Box, ProviderInfo } from "./coverage";
import type { ProviderId, ProviderOutcome, RankedStation } from "./groundwater";
import type { SolarSummary } from "./solar";
import type { MappedSource } from "./surface";

export type RequestLog = { url: string; status: number | null; ok: boolean; retrievedAt: string; durationMs: number; bodySha256?: string; note?: string };

export type SurfaceLookup =
  | {
      ok: true;
      radiusM: number;
      box: Box;
      sources: MappedSource[];
      total: number;
      truncated: boolean;
      dropped: number;
      provider: { name: string; licence: string; endpoint: string; osmBase: string | null; retrievedAt: string; bodySha256: string; cached: boolean };
    }
  | { ok: false; radiusM: number; reason: "unsupported_location" | "provider_error" | "invalid"; message: string };

export type ProviderReport = {
  id: ProviderId;
  name: string;
  operator: string;
  scope: ProviderInfo["scope"];
  consulted: boolean;
  outcome: ProviderOutcome;
  message: string;
  stationsFound: number;
  stationsInRadius: number;
  seriesRequested: number;
  truncated: boolean;
  requests: RequestLog[];
  licence: string;
  homepage: string;
};

export type GroundwaterLookup =
  | { ok: true; radiusM: number; box: Box; fromDate: string; asOf: string; countryHint: string | null; providers: ProviderReport[]; stations: RankedStation[] }
  | { ok: false; radiusM: number; reason: "unsupported_location" | "invalid"; message: string };

export type SolarProvenance = {
  provider: "NASA POWER";
  product: "Daily API, ALLSKY_SFC_SW_DWN, community RE";
  apiVersion: string | null;
  upstream: string[];
  units: string;
  fillValue: number;
  cellNote: string;
  url: string;
  retrievedAt: string;
  bodySha256: string;
  requestedYears: [number, number];
  gridPoint: [number, number] | null;
};

export type SolarOutcome = { ok: true; summary: SolarSummary; provenance: SolarProvenance; days: { date: string; kwhPerM2: number | null }[] } | { ok: false; error: string };
