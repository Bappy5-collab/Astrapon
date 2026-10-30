# Implementation status

Last updated: 2026-10-30, end of Phase 2.

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Phase 0 foundation | Done | Scaffold, theme and shell, illustrative 3D preview, env validation, boundaries. See git history. |
| Challenge source verified | Done | `docs/research/challenge-source.md`. The official Resources tab publishes 13 Nov 2026 and must be re-checked. |
| Data source research | Done (Phase 1) | `docs/research/data-sources.md`, typed registry `src/domain/sources/`, `/sources` page |
| NASA POWER, MODIS (ORNL), USDA SSURGO clients | **Live-verified** (Phase 1) | `src/server/providers/`, `data/verification/*.json` |
| IMERG / SMAP / NASADEM | Credentials configured; adapters pending (Phase 3) | A one-off probe on 2026-10-30 read real IMERG Late (after the owner accepted the GES DISC EULA), SMAP L3 and NASADEM bytes. Registry statuses stay `credential_blocked` until Phase 3 adapters pass content checks. |
| Dev Supabase project | **Designated and in use** | Owner confirmed it is a new FieldShift dev project. Ref verified to match between API URL and DB URL before every script run. |
| Schema, RLS, migrations | **Applied and verified** | 4 migrations in `supabase/migrations/`, history in `supabase_migrations.schema_migrations`. `pnpm db:verify` passes 14 checks; artifact `data/verification/supabase-schema.json`. |
| Reference data | **Imported** | Data-source registry and agronomic reference library, v1 each (13 items, 26 citations), published with content hashes. Re-import is a verified no-op. No crop parameters, rules or calendars (values not yet checked against sources). |
| Generated DB types | Done | `src/server/database/database.types.ts` from the live catalog (`pnpm db:types`). |
| Auth | Done | Email/password sign-up (email confirmation), sign-in, sign-out, forgot/reset password, `/auth/confirm` (token-hash and PKCE code), protected routes in `proxy.ts` plus `getClaims()` on every protected page and action. |
| Farms, fields, zones, history, soil, water/equipment, priorities, markets, scenarios, snapshots | Done (forms + persistence) | Boundary entry is GeoJSON with validation; there is no map drawing or geocoder yet. |
| Simulation engine (Phase 4) | **Pending** | Snapshots record engine `0.0.0-pre-engine`; no results exist. |
| Real-data 3D simulator, comparison (Phases 5–6) | **Pending** | n/a |

## Verified in Phase 2

- `pnpm db:status` before applying: 0 recorded migrations, 0 tables in `public`, no drift.
- `pnpm db:rehearse` (all migrations in one rolled-back transaction) caught a policy-name quoting bug before anything was committed; after the fix it passed.
- `pnpm db:migrate`: 4 migrations applied, each in its own transaction, recorded in the Supabase CLI history table.
- `pnpm db:import-reference` run twice: first run published 2 datasets and 26 citations, second run changed nothing.
- `pnpm db:verify`: 14/14 checks pass:
  - migrations recorded equal local files;
  - exactly the expected 21 tables, all with RLS;
  - anon has no privileges on user tables and cannot call RPCs;
  - reference tables are read-only to clients;
  - results and evidence aggregates are server-written only;
  - derived geometry columns are not client-writable;
  - 55 user-table policies are all `authenticated` + owner-scoped;
  - no SECURITY DEFINER function in `public`;
  - PostGIS 3.3.7 installed;
  - generated types match the live schema.
- `pnpm test:db`: 12/12 two-user tests pass against the live dev project. A separate probe confirmed every cross-user attempt fails for the intended reason (FK 23503, RLS 42501, privilege, or trigger) while an equivalent own-data insert succeeds. All throwaway test users were deleted afterwards.
- End-to-end UI run on the production build (puppeteer, 47/47):
  - sign-in redirect with `next`, wrong password, sign-in, create farm/field;
  - invalid and valid boundary, zone outside/inside the field;
  - crop history with field-level errors that keep typed values, soil with range checks, water/equipment, priorities;
  - scenario, snapshot, edit-after-snapshot detection, reload persistence;
  - reopen in a fresh session; second user sees "Page not found" for the first user's farm, field and scenario;
  - 375 px no overflow on all data pages, account page, sign-out, local sign-up validation, bogus email link → honest error page, open-redirect `next` neutralised;
  - no browser console errors.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (48 unit tests in 6 files), `pnpm build` pass.

## Defects found and fixed in Phase 2

- Policy names were formatted as literals (`%L`) in migrations. Caught by the rehearsal, before any remote commit.
- React hydration error #418 on the scenario page: record rows rendered chips, `<details>` and `<pre>` inside `<p>`. Rows now render as `div`.
- A stalled connection to Supabase made every page hang (seen on this network as 10 s connect timeouts). Server and proxy Supabase calls now have time limits. An unreachable service is reported as "Account service not reachable" and is never treated as signed out.
- The phone header clipped the Account button. Setup is now linked from the footer on phones.

## Known limitations

- Boundaries are pasted as GeoJSON; no map, drawing tool or geocoder yet.
- Not-found for another user's record is served with HTTP 200 because the page streams after `loading.tsx`. The body is the not-found page with no data.
- Supabase Auth email uses the project's default sender, which is heavily rate-limited. For real sign-ups, configure SMTP, and set the Site URL and redirect allow-list (see `supabase/README.md`).
- Storage is not used; no buckets exist (asserted by the DB tests).
- Live verification of providers covered one location (Iowa, USA).
- The 3D scene is still illustrative.
