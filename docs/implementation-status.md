# Implementation status

Last updated: 2026-10-30, end of Phase 1.

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Phase 0 foundation | Done | Scaffold, theme and shell, illustrative 3D preview, env validation, boundaries. See git history. |
| Challenge source verified | Done | `docs/research/challenge-source.md`. The official Resources tab publishes 13 Nov 2026 and must be re-checked. |
| Data source research (all 8 named NASA families plus soil, calendars, crop parameters) | Done | `docs/research/data-sources.md`, typed registry `src/domain/sources/`, `/sources` page |
| NASA POWER daily client + validation | **Live-verified** | `src/server/providers/nasa-power.ts`, `data/verification/nasa-power-daily.json` |
| MODIS MOD13Q1 NDVI via ORNL subsets | **Live-verified** | `src/server/providers/ornl-modis.ts`, `data/verification/modis-mod13q1-ornl.json` |
| USDA SSURGO via SDA (US soil, AWC) | **Live-verified** | `src/server/providers/usda-sda.ts`, `data/verification/usda-ssurgo-sda.json` |
| CMR metadata/freshness for IMERG, SMAP, HLS, NASADEM, MOD13Q1 | Metadata live-verified; data **credential-blocked** | `src/server/providers/cmr.ts`, `data/verification/cmr-collections.json` |
| ISRIC SoilGrids client | Implemented; service **unavailable** | REST service paused. Observed 503, timeouts, and an all-null HTTP 200. |
| IMERG / SMAP / NASADEM adapters | Pending (Phase 3) | Needs `NASA_EARTHDATA_TOKEN` and `OPENTOPOGRAPHY_API_KEY` |
| Authentication, schema, migrations (Phase 2) | **Pending** | No dev Supabase project designated yet |
| Simulation engine (Phase 4) | **Pending** | n/a |
| Real-data 3D simulator, comparison, saved runs (Phases 5–6) | **Pending** | n/a |

## Verified in Phase 1

- `pnpm verify:sources`, run live on 2026-10-30. POWER, MODIS (ORNL) and SSURGO verified; SoilGrids unavailable; CMR data access credential-blocked for 7 collections. Details are in `docs/research/data-sources.md`.
- A validator defect was found and fixed: an all-null SoilGrids HTTP 200 had been accepted as live data. A regression test now covers it.
- `pnpm lint` passes. This includes a new rule that bans importing `__fixtures__` outside tests (verified with a probe file).
- `pnpm typecheck` passes.
- `pnpm test`: 36 tests in 5 files pass.
- `pnpm build` passes; `/sources` is a static page.
- Headless Chrome checks:
  - `/sources` (13 source cards), `/setup` and `/` render at 1440 px and 375 px with no horizontal overflow and no console errors.
  - Fixed in this phase: the header overflowed at 375 px after the Sources link was added, and long product IDs overflowed on phones.
  - 3D workspace regression check: controls, resize and frame rate unchanged.

## Known limitations

- Live verification covered one location (Iowa, USA).
- Provider clients are not yet wired into any user-facing workflow.
- MOD13Q1 reliability labels come from a secondary mirror of the official guide.
- Non-US soil water capacity has no implemented method and is reported as unknown.
- The 3D scene is still illustrative.
- Not configured: dev Supabase project, Earthdata token, OpenTopography key, AI key.
