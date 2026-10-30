# Data providers

Credential-free public clients, each validating content (location, period, units, fill→null, plausibility, QA) and attaching `Provenance`:

- `nasa-power.ts`: NASA POWER daily point (live-verified)
- `ornl-modis.ts`: MOD13Q1 NDVI via ORNL TESViS (live-verified)
- `usda-sda.ts`: SSURGO via Soil Data Access, US only (live-verified)
- `cmr.ts`: collection metadata, freshness, and access probe
- `soilgrids.ts`: ISRIC SoilGrids 2.0 (service paused; parser unverified against live values)

Adapters never fabricate fallback values. `__fixtures__` are test-only. Credentialed adapters (IMERG, SMAP via AppEEARS, OpenTopography) arrive in Phase 3 and must read secrets via `@/server/env`.
