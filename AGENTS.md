# AGENTS.md

Astrapon: crop-rotation decision support with an interactive 3D farm simulator.

**Read first:** `docs/astrapon-product-contract.md`, the permanent product, scientific, design, and operating contract. It overrides convenience.

## Where things are

- `docs/implementation-plan.md`: phases 1–7.
- `docs/implementation-status.md`: what is done and verified.
- `docs/challenge-alignment.md`: C1–C8 matrix. Update it every phase.
- `docs/architecture.md`: module layout and enforced boundaries.
- `docs/design-system.md`: tokens, contrast table, layout, 3D scene rules, map/search terms.
- `docs/evidence-methods.md`: evidence pipeline rules (sources, completeness, harmonisation, provenance, jobs).
- `docs/scientific-methodology.md`: the simulation and rotation engine contract (equations, parameter sources, constraints, ranking, limits). Change it only together with a new engine version.
- `docs/research/challenge-source.md`: verified official challenge page (Resources tab publishes 13 Nov 2026; re-check).
- `docs/research/data-sources.md` + `src/domain/sources/`: source registry, decisions, statuses, live evidence.

## Commands (pnpm only; one lockfile)

```
pnpm install
pnpm dev          # http://localhost:3000
pnpm build && pnpm start
pnpm lint         # ESLint flat config incl. module-boundary rules
pnpm typecheck    # next typegen + tsc --noEmit
pnpm test         # vitest
pnpm check        # lint + typecheck + test
pnpm verify:sources [power|modis|sda|soilgrids|cmr] [--write-fixtures]   # live provider checks → data/verification/
pnpm db:status | db:rehearse | db:migrate | db:import-reference | db:types | db:verify   # see supabase/README.md
pnpm test:db      # live two-user isolation tests (dev project; creates and deletes throwaway users)
pnpm evidence:worker [--once]   # background worker for evidence jobs AND simulation runs (needs SUPABASE_DB_URL); keep it running beside pnpm dev. Deployed site: .github/workflows/evidence-worker.yml runs it with --once every 10 min (repo secret SUPABASE_DB_URL); with GITHUB_DISPATCH_TOKEN set on the server, queueing also dispatches it at once (src/server/worker/dispatch.ts)
pnpm evidence:trace             # LIVE end-to-end trace → data/verification/evidence-trace.json
pnpm simulation:trace           # LIVE simulation trace → data/verification/simulation-trace.json
```

## Rules that bite

- `src/domain/**` is pure TypeScript with no React, Next, MUI, Three, Supabase, or server imports (ESLint-enforced).
- `src/server/env.ts` and `src/server/database/**` import `server-only` (secrets). `src/server/providers/**` holds credential-free public clients without that guard so scripts and tests can run them; ESLint still forbids importing any `@/server` module from components. A provider that needs a secret must get it from `@/server/env`.
- MUI components that need `component={NextLink}` from a Server Component must use `ButtonLink`/`TextLink` from `src/components/links.tsx`. Passing the component directly fails prerendering.
- 3D code is client-only and dynamically imported with `ssr:false`. Keep these working:
  - the WebGL fallback;
  - quality presets (Low on software renderers);
  - context-loss restart;
  - the `demand` frameloop, paused while offscreen;
  - geometry disposal.
- Never convert lon/lat degrees to metres directly: use `src/domain/geo/local-frame.ts`. Fields across the 180° meridian are rejected with `ANTIMERIDIAN_MESSAGE`.
- The 3D scene is flat and illustrative: no invented terrain, buildings or trees. Plants come from `cropForm()` and are labelled illustrative. Every scene fact needs a text equivalent (zone list, timeline table, Inspect panel).
- Colours, spacing and radii come from `src/theme/tokens.ts`. Add any new text/background pairing to `src/theme/contrast.ts` (tested). Lime is never text on light surfaces.
- Strings in the workspace, navigation, location search and settings go through `useT()`/`getT()`, with both English and Bangla entries in `src/lib/i18n/messages.ts`.
- Place search must stay submit-only through `/api/geocode`. The Nominatim policy requires a shared 1 req/s limit, a cache, no autocomplete and attribution. Map tiles must keep visible attribution; never prefetch or bulk-download tiles.
- Save workspace edits only through `saveWorkspace` → `save_field_workspace`, after the confirmation dialog.
- Never put device location in URLs; hand it off via sessionStorage.
- Evidence pipeline (`src/server/pipeline`, credential-free, usable by scripts):
  - Every provider request goes through `fetchText` (host allowlist, per-host concurrency, timeouts, bounded retries). Add a host to `ALLOWED_HOSTS` only with a reason.
  - Downloads run only in `scripts/evidence-worker.mts`, never in a web request. The app only enqueues (`request_evidence`) and cancels.
  - Raw responses go to the disk cache (`.cache/evidence`), never to PostgreSQL. Only the normalised POWER daily series the engine needs are stored (`evidence_daily_series`, immutable, processing version ≥ 1.1.0). Cache keys include product, location key, period and request parameters. Retrievals carry `PROCESSING_VERSION`: bump it when any rule in `docs/evidence-methods.md` changes.
  - Missing = null, never zero, never interpolated. Respect the completeness thresholds in `src/domain/evidence`. Never combine incompatible quantities (moisture depths, temperature definitions, two precipitation products).
  - Snapshots (input schema v2) pin evidence retrievals by id + hash; pinned retrievals cannot be deleted. Never update a retrieval or aggregate; refresh creates a new retrieval.
  - Evidence UI: every metric opens `EvidenceInspector`. Label evidence classes with `EvidenceClassChip`. Show within-field variation only when the source resolves it.
- Simulation engine (`src/domain/simulation`, pure):
  - No clock, randomness or I/O. Same input and `ENGINE_VERSION` give a byte-identical result (tested). Bump `ENGINE_VERSION` for any change to `docs/scientific-methodology.md`.
  - Every crop number lives in `catalog.ts`, checked against FAO-56 Tables 11/12/22 and USDA PLANTS, and is published as the `crop-parameters` reference dataset. Calendars come only from farmer records, farmer windows or the selected NASS 2010 state. Never add an unsourced parameter, and never impose one region's seasons on another.
  - Hard constraints run before ranking. Scores are relative among the options shown, never probabilities. Unsupported calculations return null (insufficient evidence), and that indicator is dropped for every compared option.
  - Runs are queued with `request_simulation` and computed by the worker (`scripts/simulation-runner.mts`) from immutable pinned rows only; results go to `simulation_results`. Never compute a run in a web request.
- `SUPABASE_DB_URL` is also used by the evidence worker (a script); never by the web app.
- Provider clients (`src/server/providers`) validate content, not just HTTP 200: location, period, units, fill→null (never 0), plausibility, QA. A source is `live_verified` only with a passing committed artifact (enforced by `registry.test.ts`).
- Fixtures live in `__fixtures__/*.fixture.json` with a `TEST FIXTURE ONLY` label; ESLint bans importing them outside tests. Never use them as fallbacks.
- ORNL MODIS service path is `/rst/api/v1` and needs `Accept: application/json`. SoilGrids REST is paused (can return all-null 200). IMERG V07 Final ends 2025-09-30.
- Scripts are `.mts` (ESM) run with tsx; they must not import `server-only` modules.
- Env: never log or render values. Use the reports from `src/lib/env/schema.ts`.
- Database:
  - The app uses only the user-scoped client (`src/server/database/supabase-server.ts`). There is no service-role client in the app. The secret key and `SUPABASE_DB_URL` are for `scripts/db` and `tests/db` only.
  - Every protected page calls `requireUser()`, and every server action re-checks `getAuth()`. Handle the `unconfigured` and `unreachable` states honestly; never treat unreachable as signed out.
  - New user tables need: `owner_id`, a composite FK `(parent_id, owner_id)`, RLS with the four owner policies, explicit grants (revoke from anon), and inclusion in `USER_TABLES` in `scripts/db/verify.mts` plus `tests/db`.
  - Never edit an applied migration. Run `db:rehearse` before `db:migrate`, then `db:types` and `db:verify`.
  - Snapshots, evidence rows, results and published reference data are immutable by design. Create new versions instead of updating them.
- Forms use `ActionForm`/`FormField`/`FormSelect` (`src/components/forms`) with server actions returning `FormState`; validation schemas live in `src/domain`.
- Pinned toolchain:
  - TypeScript is 6.0.x because typescript-eslint requires `<6.1`.
  - ESLint is 9.x for React plugin peer support.
  - React must stay `<19.4` for `@react-three/fiber` 9.8.
- Next 16 specifics:
  - `proxy.ts` replaces `middleware.ts`.
  - There is no `next lint`.
  - Request APIs are async.
  - Turbopack is the default.
- pnpm 12 blocks dependency build scripts. Review any new one and add it to `allowBuilds` in `pnpm-workspace.yaml` (unrs-resolver and esbuild are denied; prebuilt binaries suffice).

## Phase status

Phases 0–3 are complete. Phase 3 (prompt 3) delivered:

- the art-directed 3D UI and design system;
- location search;
- boundary and zone drawing;
- crop assignment;
- the transactional workspace save.

Phase 4 (prompt 4) delivered the evidence pipeline: POWER full record, MODIS NDVI grid, SSURGO; a persisted job queue with a separate worker; indicators; an evidence inspector; footprints; and snapshot pinning.

Phase 5 (prompt 5) delivered the transparent simulation and rotation engine (`docs/scientific-methodology.md`, engine 1.0.0):

- sourced crop parameters and the NASS calendar as reference datasets;
- the POWER daily series (processing version 1.1.0);
- `request_simulation` and worker-run simulations;
- the scenario settings v2 form, the run panel and the `/runs/[id]` result page;
- live and UI traces.

The next phase follows the owner's next prompt. The designated Astrapon dev Supabase project is configured in `.env.local` (owner-confirmed new project); scripts verify its ref before running.

## End-of-phase duties

Run the checks and inspect the UI. Update this file, `docs/implementation-status.md`, and `docs/challenge-alignment.md`. Commit task-owned changes locally and do not push.
