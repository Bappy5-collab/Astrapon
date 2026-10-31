# Evidence pipeline: methods and harmonisation

Processing version: **`evidence-1.0.0`** (`PROCESSING_VERSION` in `src/domain/evidence/catalog.ts`). Every retrieval row and cache key records it. A change to any rule below requires a new processing version.

## Sources in the pipeline

| Source | Evidence class | Native support | Record used | Why |
|---|---|---|---|---|
| NASA POWER daily, AG community (`T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `GWETROOT`) | Model-derived (MERRA-2 / GEOS-IT) | ½° lat × ⅝° lon cell | 1981-01-01 to the end of the last complete month | Global, long, daily. It is the one temperature and precipitation series. |
| MODIS Terra MOD13Q1 v061 NDVI + pixel reliability, via ORNL TESViS | Satellite observation | ≈231.66 m sinusoidal pixels, 16-day composites | 2000-02-18 to the latest composite | The complementary NASA product chosen in Phase 1 research: observed vegetation seasonality and trend. |
| USDA SSURGO via Soil Data Access | Ground / survey | Map-unit polygon | Current survey version | Credible soil water capacity where surveyed (United States only). |

### Not added, and why

- **GPM IMERG:** its precipitation overlaps POWER `PRECTOTCORR`. Adding it would double-count rainfall or force an unjustified blend. Deferred until an indicator needs ~10 km observation-driven rainfall instead of POWER.
- **SMAP L3:** surface (≈5 cm) volumetric soil moisture is a different depth and quantity from POWER's root-zone wetness fraction. It is not combined, and it needs an asynchronous AppEEARS job. Deferred.
- **NASADEM:** no indicator in this phase uses slope or elevation.
- **ISRIC SoilGrids:** the REST service still returned HTTP 503 on 2026-10-31. Outside the US no survey soil value is shown; farmer soil tests on the Records page remain the source.

## Common analysis period and aggregation

- Climate normals use the WMO standard period **1991–2020**. A month's normal needs ≥ 24 of the 30 years.
- "Recent" summaries use the **last 10 complete calendar years** in the record and need ≥ 8 of them.
- POWER and MODIS are never merged into one number. When they are compared, the shared window is 2001 onwards (MODIS starts 2000-02-18).
- Time standard: POWER daily values are in local solar time (LST). MODIS composites are labelled by their first day; each covers 16 days.
- Temporal aggregation: daily → calendar month (mean for temperature and wetness, sum for precipitation) → three-month seasons named by months (Dec–Feb uses the previous December), so labels are correct in both hemispheres. Annual counts use calendar years.

## Missing data and completeness

- POWER fill values (−999) become `null`. Missing values are never zero and never interpolated.
- A month needs **≥ 90% valid days**. Otherwise the value is empty, and the valid/expected counts are stored and shown.
- Sums over incomplete months are never scaled up.
- An annual count needs **≥ 95% valid days** in the year.
- A dry spell is ended by a missing day, which is not assumed dry. Spells do not carry across years.
- MODIS uses only pixel reliability 0 (good). Marginal, snow/ice, cloudy and fill composites are dropped, not filled.
  - A field composite needs good data for at least half of the field's pixels.
  - An annual peak needs ≥ 8 good composites in the year.
  - A trend needs ≥ 8 years.
- The record ends at the last complete month, so recent near-real-time gaps are not reported as data.

## Spatial support and extraction

- **POWER** is requested at the centre of the POWER grid cell containing the field's interior point. Every field in that cell therefore shares one cached retrieval. The value describes the whole cell and is never shown as varying inside a field.
- **MODIS:**
  - Requested as a grid around the pixel containing the field's interior point. The half-width in whole kilometres covers the field, capped at 4 km.
  - The grid origin and cell size come from the response (`xllcorner`, `yllcorner`, `cellsize`). Pixel footprints are computed exactly from the sinusoidal projection.
  - Far from the central meridian these pixels are sheared parallelograms in lon/lat. Coverage is therefore sampled inside each pixel's own corners, not its lon/lat bounding box.
  - A pixel counts as "in the field" when ≥ 75% of it lies inside the boundary (holes excluded).
  - The field value is the mean of those pixels. If none qualifies, the pixel at the interior point is used and labelled as neighbourhood context.
  - Within-field variation is shown only when at least 2 pixels qualify (and at most 81). No resampling or smoothing creates detail finer than a pixel.
- **SSURGO:** the map unit containing the interior point. Plant-available water capacity is computed over the top 100 cm, weighted by component share. Components with missing horizons are excluded and reported.

## Quantities never combined

| Never combined | Because |
|---|---|
| POWER `GWETROOT` (0–1 root-zone wetness, model) with SMAP surface volumetric moisture | Different depth and quantity |
| `T2M` (daily mean air temperature) with `T2M_MAX`/`T2M_MIN` and land-surface temperature | Different temperature definitions |
| Two precipitation products | Double counting |
| Evapotranspiration types (reference ET vs actual ET) | None is computed in this phase |

## Indicators

| Indicator | Definition | Limits |
|---|---|---|
| Frost days per year | Days with `T2M_MIN` ≤ 0 °C | Generic threshold; ground frost in hollows can be more frequent |
| Hot days per year | Days with `T2M_MAX` ≥ 35 °C | Generic threshold |
| Longest dry spell; dry spells ≥ 10 days | Consecutive days with precipitation < 1 mm | Ignores irrigation and soil storage |
| Seasonal precipitation vs normal | Season total minus the 1991–2020 season normal; also % of normal | |
| Temperature vs normal | Monthly `T2M` mean minus the 1991–2020 monthly normal | |
| Root-zone soil wetness (model) | Monthly `GWETROOT` mean and its anomaly | Context only, not a field moisture measurement |
| Peak greenness (NDVI) | Highest good composite per year; Theil–Sen slope per decade | Descriptive, with no significance test |
| Plant-available water capacity, 0–100 cm | SSURGO, mm | |

None of these is crop damage, yield, disease, nutrient status or a forecast. NDVI cannot identify a crop.

## Provenance and reproducibility

- **Retrieval row** (`evidence_retrievals`) records:
  - product id and version (POWER API version; MOD13Q1 061; SSURGO survey date) and processing version;
  - cache key;
  - the request without credentials;
  - observation period, which is separate from `retrieved_at` (the earliest network fetch among the chunks used);
  - response SHA-256 over the chunk hashes, response bytes;
  - validation checks and provenance (upstream sources, grid, pixel coverage, quality counts).
- Raw responses are not stored in PostgreSQL. They live in an on-disk chunk cache (`.cache/evidence`, git-ignored). Cache keys include product, location key (POWER cell or MODIS pixel and grid size), period and request parameters.
- **Saved snapshots** (input schema v2) pin each source's newest valid retrieval by id, response hash and a digest of all its aggregate rows.
  - A database foreign key stops a pinned retrieval from being deleted.
  - A refresh creates a new retrieval and never edits an old one (rows are immutable), so a saved snapshot always reproduces.

## Operations

- **Network:** every provider request goes through `fetchText`, which enforces:
  - an allowlist of hosts, HTTPS only;
  - a per-host concurrency limit (ORNL: 1, others: 2);
  - a per-attempt timeout;
  - bounded retries with backoff for timeouts, network errors, 429 and 5xx.
- **Jobs:** `evidence_jobs` is the persisted queue. A user may only enqueue (`request_evidence`, deduplicated per field and source) or cancel. A trigger restricts status changes to the trusted worker.
- **Worker** (`pnpm evidence:worker`) is a separate Node process:
  - Claims jobs with `FOR UPDATE SKIP LOCKED` and a 3-minute lease, renewed on progress; an expired lease is reclaimed.
  - Retries "unavailable" failures with backoff up to 3 attempts; "invalid" and "not applicable" fail at once.
  - Writes each retrieval with its aggregates in one transaction.
  - Reuses the latest retrieval when nothing changed (same cache key and response hash).
- **Timings:**
  - A first MODIS retrieval for a new location took about 18 minutes: 124 sequential ORNL requests at ≈9 s each.
  - A first POWER retrieval took about 11 s (five 10-year chunks).
  - Cached repeats take seconds.
  - This is why downloads never run inside a web request. Astrapon does not promise unlimited free processing: the public services are rate-limited and best-effort.
- **Failure handling:** each source fails independently. A failed refresh keeps the previous retrieval visible and marks it **stale**. The UI shows queued, running, failed, stale and complete states with retry and cancel.
