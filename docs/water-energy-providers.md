# Water & Energy providers: status and coverage

Checked 2026-11-05. Registry in code: `src/domain/water/sources.ts` (shown on `/sources`); routing in `src/domain/water/coverage.ts`. Live evidence: `pnpm water:trace` → `data/verification/water-*.json` (request URLs recorded without query strings).

## Status matrix

| Source | Purpose | Status | In app | Access | Live evidence |
|---|---|---|---|---|---|
| NASA POWER Daily, ALLSKY_SFC_SW_DWN, community RE | Solar | live_verified | Yes | Public | `water-power-solar.json`: kW-hr/m^2/day, 2016–2025, 12 complete months (Mymensingh mean 3.28–5.17 h/day) |
| OpenStreetMap via Overpass (overpass-api.de, fallback overpass.private.coffee) | Mapped rivers, canals, ponds, reservoirs, mapped wells, springs | live_verified | Yes | Public, ODbL | `water-overpass.json`: 550 features within 3 km of a Mymensingh test square; centreline and outline roles; a pond touching the square at 0 m |
| USGS Water Data OGC API | US groundwater (stations + parameter 72019) | live_verified | Yes (national adapter, North America) | Public, public domain | `water-groundwater.json` us-iowa: 170 wells within 10 km, observations returned (latest returned 2007-09-26 there; older-record label), 42 ft → 12.802 m |
| Hub'Eau Piézométrie (ADES) | French groundwater | live_verified | Yes (national adapter, Europe) | Public, Licence Ouverte 2.0 | fr-toulouse: 135 stations, observations to 2026-11-01, NGF level 133.83 m with station altitude 138.75 m → 4.92 m below ground (derived) |
| IGRAC GGMN via GGIS (public WFS + measurement URL) | Shared global groundwater | live_verified | Yes (global route, always consulted) | Public; reuse terms per provider | au-wagga (BoM via GGMN): 39 wells, latest 2023-03-01; za-gauteng (South African DWS): 32 wells, latest 2025-08-15; fr mirrors of BRGM de-duplicated (122) |
| IGRAC GGIS SOS | Groundwater time series | credential_blocked | No | Partner key from ggis@un-igrac.org | Not requested; public WFS route used instead |
| BWDB Hydrology (Bangladesh) | Groundwater table | unavailable (access by request) | No (routing explains it) | Registration, data application, rate list | No public machine endpoint found |
| BoM Groundwater Explorer / NGIS (direct) | Australian bores | unavailable (direct) | No — via GGMN | HTTP 403 to automated requests; NGIS is bulk download | BoM data reached through GGMN instead |
| NASA OPERA DSWx-HLS | Observed surface water extent | researched | No | Earthdata login for granules | Deferred: needs authenticated COG reads + GeoTIFF decoding |
| EC JRC Global Surface Water | Historical occurrence/seasonality | researched | No | Public tiles / 10° rasters | Deferred: whole-tile downloads for one field; historical extent ≠ today's water |
| GRACE / GRACE-FO | Regional storage context | researched | No | Earthdata | Context only; never a well depth |

## Location-driven routing (tested)

| Case | Country hint | Consulted | Outcome |
|---|---|---|---|
| Near Ames, Iowa, US | us | USGS, GGMN | USGS stations + observations; GGMN none |
| Toulouse, France | fr | Hub'Eau, GGMN | Records to 2026-11-01; GGMN mirrors merged |
| Wagga Wagga, Australia | au | GGMN (BoM direct explained as unavailable) | BoM wells via GGMN |
| Mymensingh, Bangladesh | bd | GGMN (BWDB explained as access by request) | No wells in 25 km — "Groundwater depth unavailable", not "no groundwater" |
| Johannesburg area, South Africa (no national adapter) | za | GGMN | DWS wells with observations |
| Near Nairobi, Kenya (no national adapter) | ke | GGMN | No wells in 10 km, stated honestly |
| Outage (GGIS simulated down, France) | fr | Hub'Eau, GGMN | GGMN "temporary error, not 'no groundwater'"; Hub'Eau results kept |

Routing uses the field's own coordinates: a provider is consulted when its jurisdiction envelope intersects the search box; the reverse-geocoded country (Nominatim, point rounded to 0.1°, shared 1 req/s queue) only orders providers and is shown as a hint. No locale, IP, account country or Bangladesh default is used. The global network is always consulted.

## Search bounds

- Surface water: 1, 3 (default), 5 or 10 km from the field edge; ≤ 2000 OSM elements per query; nearest 60 returned.
- Groundwater: 5, 10 (default) or 25 km from the field edge; observations since 30 years before the current year; up to 500 (USGS, Hub'Eau) / 300 (GGMN) stations per provider; observations requested for the nearest 6 stations per provider, recent ones first; never expanded silently.
- Solar: one point request per field location per year (cached).

## Operations

- Hosts are allowlisted in `src/server/providers/http.ts`; Overpass runs one request at a time per server.
- Public Overpass is not production infrastructure: for production traffic run a dedicated Overpass instance (add its host to the allowlist and to `OVERPASS_INSTANCES`).
- No credentials are needed for the live routes. USGS works without a key at low rate limits; an api.data.gov key could be added server-side later.
- Field coordinates are not written to any shared cache; lookup caches are in-process and keyed by a rounded box.
