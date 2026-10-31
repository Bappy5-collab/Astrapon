# AGENTS.md

FieldShift: crop-rotation decision support with an interactive 3D farm simulator.

**Read first:** `docs/fieldshift-product-contract.md`, the permanent product, scientific, design, and operating contract. It overrides convenience.

## Where things are

- `docs/implementation-plan.md`: phases 1–7.
- `docs/implementation-status.md`: what is done and verified.
- `docs/challenge-alignment.md`: C1–C8 matrix. Update it every phase.
- `docs/architecture.md`: module layout and enforced boundaries.
- `docs/design-system.md`: tokens, contrast table, layout, 3D scene rules, map/search terms.
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

Evidence adapters, previously planned as Phase 3, are next unless the owner's next prompt says otherwise. The designated FieldShift dev Supabase project is configured in `.env.local` (owner-confirmed new project); scripts verify its ref before running.

## End-of-phase duties

Run the checks and inspect the UI. Update this file, `docs/implementation-status.md`, and `docs/challenge-alignment.md`. Commit task-owned changes locally and do not push.
