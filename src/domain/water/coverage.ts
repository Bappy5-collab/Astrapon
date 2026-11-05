/**
 * Groundwater provider coverage and routing (pure).
 *
 * Routing uses the search box built from the field's own coordinates. A provider is consulted
 * when its coverage box intersects the search box; the country from reverse geocoding is only a
 * hint for display and ordering, never proof that a dataset covers the point. Coverage boxes are
 * deliberately generous jurisdiction envelopes: the provider's own answer decides whether
 * stations exist. The global source (IGRAC GGMN) is always consulted, even where a national
 * adapter exists, so useful shared records are not suppressed.
 */

import type { ProviderId } from "./groundwater";

export type Box = { west: number; south: number; east: number; north: number };

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  operator: string;
  scope: "global" | "national";
  jurisdiction: string;
  coverage: Box[] | "global";
  /** Integration state for runtime routing. */
  integration: "live" | "credential_required" | "access_restricted" | "not_integrated";
  homepage: string;
  licence: string;
  measurementTypes: string;
  units: string;
  updateCadence: string;
  note: string;
};

export const GROUNDWATER_PROVIDERS: ProviderInfo[] = [
  {
    id: "usgs",
    name: "USGS Water Data APIs (OGC API – Features)",
    operator: "U.S. Geological Survey (non-NASA)",
    scope: "national",
    jurisdiction: "United States and territories",
    coverage: [
      { west: -125.0, south: 24.3, east: -66.9, north: 49.5 }, // conterminous US
      { west: -170.0, south: 51.0, east: -129.9, north: 71.5 }, // Alaska (west of 180° excluded)
      { west: -160.5, south: 18.8, east: -154.7, north: 22.4 }, // Hawaii
      { west: -67.95, south: 17.6, east: -64.5, north: 18.6 }, // Puerto Rico & USVI
    ],
    integration: "live",
    homepage: "https://api.waterdata.usgs.gov/",
    licence: "U.S. Government work, public domain (USGS data policy); cite USGS as the source.",
    measurementTypes: "Field-measured depth to water below land surface (parameter 72019), with static/pumping qualifier; monitoring-location metadata (well depth, aquifer, altitude and datum).",
    units: "ft as delivered (converted to m explicitly)",
    updateCadence: "Continuous; field visits irregular (often yearly or less).",
    note: "Records include USGS and cooperating state agencies; the measuring agency is kept.",
  },
  {
    id: "hubeau",
    name: "Hub'Eau Piézométrie API (ADES)",
    operator: "OFB / BRGM, French national water information system (non-NASA)",
    scope: "national",
    jurisdiction: "France (metropolitan and overseas departments)",
    coverage: [
      { west: -5.3, south: 41.3, east: 9.7, north: 51.2 }, // metropolitan France and Corsica
      { west: -61.9, south: 15.8, east: -60.9, north: 16.6 }, // Guadeloupe
      { west: -61.3, south: 14.3, east: -60.8, north: 14.9 }, // Martinique
      { west: -54.7, south: 2.1, east: -51.5, north: 5.8 }, // French Guiana
      { west: 55.2, south: -21.4, east: 55.9, north: -20.8 }, // Réunion
      { west: 44.9, south: -13.1, east: 45.4, north: -12.6 }, // Mayotte
    ],
    integration: "live",
    homepage: "https://hubeau.eaufrance.fr/page/api-piezometrie",
    licence: "Licence Ouverte / Etalab 2.0 (French open licence); attribute Hub'Eau / ADES.",
    measurementTypes: "Groundwater level as elevation (NGF, m) and depth below the station's reference (m), with validation status and qualification; station investigation depth and BD LISA aquifer codes.",
    units: "m",
    updateCadence: "Daily for automatic stations; manual stations irregular.",
    note: "profondeur_nappe is depth below the measuring reference; it is shown as such, not as depth below ground.",
  },
  {
    id: "igrac_ggmn",
    name: "IGRAC Global Groundwater Monitoring Network (GGMN) via GGIS",
    operator: "IGRAC (UNESCO/WMO centre) — shared data from national providers (non-NASA)",
    scope: "global",
    jurisdiction: "Participating countries (coverage varies by country and monitoring network)",
    coverage: "global",
    integration: "live",
    homepage: "https://ggis.un-igrac.org/groundwater/dashboard/view?data-type=ggmn",
    licence: "Reuse conditions are set by each data provider (GGIS disclaimer and data licensing); the original provider is credited on every record.",
    measurementTypes: "Groundwater level time series (water-level elevation a.m.s.l. or water depth from the ground surface, as the provider supplied) with station metadata.",
    units: "m (as stated per value)",
    updateCadence: "Depends on each provider's uploads.",
    note: "Public WFS station layer and the documented public measurement URL; the SOS service needs a partner key and is not used.",
  },
  {
    id: "bwdb",
    name: "Bangladesh Water Development Board — Hydrology groundwater data",
    operator: "BWDB Hydrology (non-NASA)",
    scope: "national",
    jurisdiction: "Bangladesh",
    coverage: [{ west: 88.0, south: 20.5, east: 92.7, north: 26.7 }],
    integration: "access_restricted",
    homepage: "https://hydrology.bwdb.gov.bd/",
    licence: "Data supplied on registered request under BWDB's published rates; no open API found.",
    measurementTypes: "Groundwater table (weekly manual, daily, real-time) — on request.",
    units: "m (per BWDB tables)",
    updateCadence: "Weekly manual readings; some real-time stations.",
    note: "The portal offers registration, a data application form and rate list. No public machine endpoint was found on 2026-11-05, so no BWDB record is fetched automatically.",
  },
  {
    id: "bom",
    name: "Bureau of Meteorology — Australian Groundwater Explorer / NGIS",
    operator: "Bureau of Meteorology (non-NASA)",
    scope: "national",
    jurisdiction: "Australia",
    coverage: [{ west: 112.0, south: -44.0, east: 154.0, north: -9.0 }],
    integration: "not_integrated",
    homepage: "https://www.bom.gov.au/water/groundwater/",
    licence: "Not confirmed: the site refused automated access, so its terms were not read (https://www.bom.gov.au/other/copyright.shtml).",
    measurementTypes: "Bore water levels (NGIS), offered as bulk state downloads and an interactive explorer.",
    units: "m",
    updateCadence: "Periodic NGIS releases.",
    note: "Automated requests to bom.gov.au were refused (HTTP 403) on 2026-11-05, and NGIS is a bulk download. BoM bore levels are reached through GGMN, which serves BoM as the original provider.",
  },
];

export const providerInfo = (id: ProviderId) => GROUNDWATER_PROVIDERS.find((p) => p.id === id)!;

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.west <= b.east && b.west <= a.east && a.south <= b.north && b.south <= a.north;
}

export type RouteDecision = { provider: ProviderInfo; covers: boolean; consult: boolean; reason: string };

/**
 * Decides which providers to consult for a search box. `countryHint` (ISO alpha-2, lower case)
 * only orders national providers first; it never adds or removes a provider by itself.
 */
export function routeProviders(search: Box, countryHint: string | null): RouteDecision[] {
  const hintOf: Partial<Record<ProviderId, string>> = { usgs: "us", hubeau: "fr", bwdb: "bd", bom: "au" };
  const out = GROUNDWATER_PROVIDERS.map((p): RouteDecision => {
    const covers = p.coverage === "global" || p.coverage.some((b) => boxesIntersect(b, search));
    if (!covers) return { provider: p, covers, consult: false, reason: "The searched area is outside this provider's jurisdiction." };
    if (p.integration === "live") return { provider: p, covers, consult: true, reason: p.scope === "global" ? "Global shared network: always searched." : "The searched area overlaps this provider's jurisdiction." };
    return { provider: p, covers, consult: false, reason: p.note };
  });
  return out.sort((a, b) => {
    const ah = countryHint && hintOf[a.provider.id] === countryHint ? 0 : 1;
    const bh = countryHint && hintOf[b.provider.id] === countryHint ? 0 : 1;
    return Number(b.consult) - Number(a.consult) || ah - bh || (a.provider.scope === "national" ? 0 : 1) - (b.provider.scope === "national" ? 0 : 1);
  });
}
