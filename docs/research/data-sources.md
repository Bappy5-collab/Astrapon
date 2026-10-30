# Data source research and verification (Phase 1)

- **Checked:** 2026-10-30.
- **Canonical machine-readable registry:** `src/domain/sources/registry.ts`, rendered at `/sources`. Agronomic references are in `src/domain/sources/references.ts`.
- **Live evidence:** `data/verification/*.json`, produced by `pnpm verify:sources`.

## Status vocabulary

| Status | Meaning |
|---|---|
| researched | Official documentation reviewed. No data retrieved. |
| implemented | Client code exists, but no passing live response has been recorded. |
| live_verified | A scripted request returned real values that passed content checks: location, period, units, fill handling, plausibility, and QA. The artifact is committed and includes a traceable sample. |
| credential_blocked | Collection metadata is confirmed, but data requires an account or key that is not configured. The actual unauthenticated response is recorded. |
| unavailable | Service failed or returned no usable data at check time. The failure is recorded. |

## Selection decision

The initial subset is chosen for concrete decisions, not mission count.

| Source | Decision | Status | Why |
|---|---|---|---|
| NASA POWER daily (AG) | **Initial** | live_verified | No-auth JSON, global, 1981 onwards. Supports GDD, heat and frost days, rainfall, and reference-ET inputs. |
| MODIS MOD13Q1 v061 via ORNL subsets | **Initial** | live_verified | No-auth JSON with a 25-year vegetation record. Gives greenness seasonality and bare-period context at about 250 m. |
| USDA SSURGO via Soil Data Access | **Initial** (US only) | live_verified | Survey AWC directly, so no texture-to-AWC inference is needed. Locally authoritative. |
| GPM IMERG Late daily V07 | Initial, pending access | credential_blocked | About 10 km, observation-driven rainfall. V07 Final has stopped (see below). |
| SMAP L3 enhanced (SPL3SMP_E v006) | Initial, pending access | credential_blocked | The only observation-based soil-moisture record. Contrasts with modelled POWER GWETROOT. |
| NASADEM via OpenTopography | Initial, pending access | credential_blocked | About 30 m. One of the few sources that legitimately differs within a field (slope, frost pockets). |
| ISRIC SoilGrids 2.0 | Initial, pending access | **unavailable** | Global soil properties with uncertainty. The REST service is paused. |
| IMERG Final V07 | Deferred | credential_blocked | Record frozen at 2025-09-30 until V08. |
| SMAP L4 (SPL4SMGP v008) | Deferred | credential_blocked | Modelled root zone, which overlaps POWER GWETROOT. |
| HLS v2.0 (Landsat + Sentinel-2) | Deferred | researched | Truly field-scale vegetation, but large effort (auth plus per-polygon COG processing). |
| ECOSTRESS C2 | Deferred | researched | 70 m stress snapshots, but irregular ISS sampling and no coverage above ~52°. |
| GRACE/GRACE-FO mascons | Rejected for field decisions | researched | ~300 km effective resolution. Regional context only. |
| HWSD v2.0 | Rejected | researched | Non-commercial licence, and AWC is class-based. |
| GEDI biomass (mentioned in the challenge harmonisation note) | Not evaluated | n/a | Not on the investigation list. Its relevance to annual-crop rotation is doubtful. Revisit only if the Resources tab emphasises it. |

## Live verification results (2026-10-30)

Test point: 42.03° N, 93.62° W (lat 42.03, lon −93.62), near Ames, Iowa. It was chosen because it is a row-crop landscape inside SSURGO coverage.

### NASA POWER: live_verified (`data/verification/nasa-power-daily.json`)

- **Request:** GET daily point, AG community, 2024-01-01 to 2024-12-31, 8 parameters, `time-standard=LST`.
- **Response:** API v2.10.1, sources `MERRA2, SYN1DEG, POWER`. It reports an elevation of 310.22 m as the third coordinate; that value's definition is unconfirmed.
- **Checks passed:**
  - Location echoed exactly; header period equals the request.
  - Fill value −999.
  - All 366 dates present for every parameter, all valid; units match expectations; values within physical bounds.
  - T2M_MIN ≤ T2M_MAX on every day.
- **Traceable sample:** T2M_MAX on 2024-07-15 = 32.59 °C. Find it at JSON path `properties.parameter.T2M_MAX["20240715"]`. The artifact records the body SHA-256 and the reproduce URL.
- **Near-real-time latency:** on 2026-10-30, meteorology was valid through 2026-10-21 (9 trailing fill days) and solar through 2026-10-24. The documented "about 2 days" did not hold, so code must handle trailing fill. Fill becomes `null`, never zero.
- **Evidence class:** model/assimilated product. POWER is reanalysis (MERRA-2, then GEOS-IT), not station data.

### MODIS MOD13Q1 via ORNL: live_verified (`data/verification/modis-mod13q1-ornl.json`)

- **Service location:** the service moved to `https://modis.ornl.gov/rst/api/v1/`. The old `/rest/` path now returns an HTML "Page not found". Requests also need `Accept: application/json`.
- **Data retrieved:** 23 composites for 2024, fetched in chunks of 10 or fewer dates, for NDVI and pixel reliability.
- **Checks passed:** location, 1×1 pixel, scale 0.0001 from band metadata, period, reliability paired with every composite.
- **Usable composites:** 19 of 23. Exclusions: 2024-01-01 (cloudy), 2024-07-27 (marginal), 2024-10-31 (cloudy), 2024-12-18 (cloudy).
- **Traceable sample:** peak usable NDVI was 0.6806 on the 2024-06-09 composite (A2024161, tile h11v04, raw 6806, reliability 0).
- **Pixel size:** 231.66 m, so the value describes the neighbourhood of the point, not one field.
- **Freshness:** the newest ORNL composite is 2026-09-14, about 6 weeks behind.
- **Mission continuity:** Terra science end is projected for Feb 2027 (NASA Science). The VIIRS NOAA-20/21 successors need checking in ORNL.

### USDA SSURGO via SDA: live_verified (`data/verification/usda-ssurgo-sda.json`)

- **Map unit found:** 2765537, "Clarion loam, Bemis moraine, 2 to 6 percent slopes". The major component is Clarion at 85%, with 4 horizons.
- **Survey version:** IA169 Story County, saverest 2026-09-08.
- **Checks passed:** horizon depth order, awc_r within 0–0.7, clay + sand ≤ 100%.
- **Traceable sample:** the 0–23 cm horizon has awc_r = 0.21.
- **FieldShift-derived value:** about 187 mm available water in the top 100 cm, computed from survey values and labelled as derived. A component with any missing horizon AWC returns null rather than a smaller number.

### ISRIC SoilGrids: unavailable (`data/verification/isric-soilgrids.json`)

Three observations on 2026-10-30:

1. Query timed out at 90 s, and `rest.isric.org/` returned **HTTP 503**.
2. A later query returned **HTTP 200 with every value null** for the Iowa cropland point. The first version of the validator wrongly accepted this as live-verified, because it checked only the unit factor. It now requires non-null values, and this case is recorded as *unavailable*. A unit test covers it.
3. The latest run timed out after 120 s.

ISRIC states the REST service is temporarily paused (https://www.isric.org/explore/soilgrids). The parser was written from documentation and unit-tested on a synthetic payload. **It has not been checked against real values.** Alternatives for Phase 3 are ISRIC's WebDAV COGs and WCS.

### CMR metadata plus unauthenticated data probe: credential_blocked (`data/verification/cmr-collections.json`)

Collections are confirmed by short name and version, with concept ID, DOI, temporal extent, and newest granule:

| Collection | Newest granule | Note |
|---|---|---|
| IMERG Late | 2026-10-28 | |
| IMERG Final | **2025-09-30** | Record frozen |
| SPL3SMP_E | 2026-10-28 | |
| SPL4SMGP | 2026-10-27 | |
| MOD13Q1 (LP DAAC) | 2026-09-30 | |
| HLSL30 | 2026-10-26 | |
| NASADEM | 2000-02-11 | Static |

Every sample data URL answered **HTTP 302 to urs.earthdata.nasa.gov** without credentials. No data values from these products were retrieved.

## Per-product details

The registry holds, for every product: official URLs, ID and version, DOI, citation, licence, coverage and exclusions, spatial support, temporal resolution and archive, documented and observed latency, variables (units, scale, fill, valid range, QA), auth, extraction route, limits, processing path, workload, supported decisions, limits of inference, and unconfirmed items. Highlights that affect design:

**NASA POWER**
- At most 20 parameters per point request.
- Repeated identical requests may be blocked, so cache per grid cell.
- POWER's documentation states both a ½° × ⅝° and a 0.5° × 0.5° meteorology grid; this is unresolved.
- GWETROOT is a modelled 0–1 wetness, not m³/m³.

**IMERG**
- V07 Final has ended at 2025-09-30, pending the V08 transition (gpm.nasa.gov news, 2026-04-28 and 2026-08-06). Late V07C is the current daily record.
- Every numeric route needs Earthdata Login: download, OPeNDAP, and Giovanni time series (401 without token).
- netcdfjs reads only netCDF-3, so use h5wasm or the Giovanni API.
- The daily product has no `precipitationQualityIndex`.

**SMAP L3E**
- Soil moisture is in cm³/cm³, valid 0.02–0.5, fill −9999.
- `retrieval_qual_flag` of 0 or 8 means high quality.
- `surface_flag` bits mark water, urban, precipitation, snow, ice, frozen ground, mountains, and dense vegetation.
- Recommended route is AppEEARS asynchronous point tasks (login → task → status → bundle), which avoids HDF5 parsing.

**MOD13Q1**
- NDVI is int16, scale 0.0001, fill −3000, valid −2000 to 10000.
- Pixel reliability has range 0–3, fill −1.
- The rank labels (0 good, 1 marginal, 2 snow/ice, 3 cloudy) come from the MOD13 user guide as mirrored in secondary sources. The V6.1 guide PDF could not be text-extracted here, so verify them.
- The filter keeps only rank 0 and stores the raw rank.

**SSURGO**
- `SDA_Get_Mukey_from_intersection_with_WktWgs84` gives a point-to-map-unit lookup.
- At most 100,000 rows per query.
- awc_r units are believed to be cm/cm but are not confirmed from NRCS column metadata (the `mdstattabcols` table is not exposed by SDA).

**OpenTopography**
- A free key is required and must stay server-side.
- 50 calls per day non-academic, 200 academic. At most 450,000 km² per request.

## Soil water capacity method decision

- **US:** use SSURGO survey `awc_r` (with `awc_l` and `awc_h` as the range) per horizon. Aggregate to rooting depth by component. No texture inference.
- **Outside the US:** no method is implemented yet. Candidates:
  1. SoilGrids water-retention layers (wv0033 − wv1500; Turek et al. 2023), if an access route exists.
  2. The Saxton & Rawls (2006) pedotransfer function on SoilGrids texture and organic carbon, propagating Q0.05/Q0.95 through the function to report a range.

  Its RMSE must be read from the paper before implementation. Until then non-US water capacity is reported as **unknown**, not estimated.
- Water capacity is never inferred from a texture class alone.

## Agronomic references

See `src/domain/sources/references.ts`:
- FAO-56 Kc, stage lengths, rooting depth and p
- FAO frost protection critical temperatures
- Schlenker & Roberts heat thresholds (statistical, US)
- Rotation meta-analyses (Zhao 2022, Bowles 2020, Smith 2023)
- Canola Council return intervals
- Crop calendars (GEOGLAM v1.3 CC-BY, Sacks 2010, FAO Crop Calendar)

Several table values and titles are flagged unconfirmed and must be checked against the source before Phase 4 uses them.

## Not yet confirmed (aggregate)

- The official challenge Resources list (published 13 Nov 2026).
- MOD13Q1 reliability labels in the V6.1 user guide.
- POWER grid statement, rate limits, and the meaning of the elevation coordinate.
- IMERG V08 identifiers and date. Giovanni time-series response format.
- SMAP official latency.
- SoilGrids restore date and live response values.
- SSURGO awc_r units from primary metadata, and public-domain wording.
- ECOSTRESS latency and ETdaily units.
- Saxton & Rawls RMSE.
- Most FAO-56 Kc ini values.
- Crop base temperatures and frost critical temperatures from primary sources.
