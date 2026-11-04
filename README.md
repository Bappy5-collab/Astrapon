# Astrapon

Astrapon helps a farmer or agronomist answer one question for a specific field:

> Given my field, crop history, environmental evidence, water limits and priorities, which rotation options are plausible, and what tradeoffs should I review locally?

You draw your own field, record what you grew, fetch NASA and soil evidence for it, and compare your existing rotation with feasible alternatives on replayed past weather. An interactive 3D view replays each option day by day; every number in it is also in a table. Results are relative comparisons on past weather — **not forecasts**, and no yield, profit or soil outcome is predicted.

Built for the 2026 NASA Space Apps Challenge "Field Shift: Adapting Farms with NASA Data". Astrapon uses publicly available NASA data products; it is not affiliated with or endorsed by NASA.

## What works

- Accounts (email/password with confirmation and reset), farms, fields and private records (Supabase, row-level security).
- Locate a field by place search, coordinates or device location; draw and edit the boundary on a street map or NASA HLS imagery; planting zones; crop history; soil observations; water and equipment; priorities.
- Evidence per field through a background worker: NASA POWER daily weather (1981 onwards), MODIS MOD13Q1 greenness (optional, last 10 years), USDA SSURGO soil water capacity (US). Indicators with an inspector (source, version, period, resolution, completeness, limits).
- A deterministic, versioned rotation engine (FAO-56 water balance, hard constraints, priority-weighted relative scores, sensitivity cases) — `docs/scientific-methodology.md`.
- The run page: 3D replay with a timeline, side-by-side comparison, unsaved priority preview, "Why this option?", deterministic explanation, optional source-grounded AI draft, saved plans, JSON export and print.
- English and Bangla for the interface and the run journey. A public sample field with invented data (`/sample`).

What it does not do is listed honestly in `docs/implementation-status.md` (Known limitations) and on `/methodology`.

## Requirements

- Node.js ≥ 22.12 (developed on 22.17.1) and pnpm 12 (`corepack enable` or `npm i -g pnpm@12`).
- A **new, dedicated** Supabase project for development (PostGIS is enabled by the migrations). Never reuse another app's project.

## Set up

```bash
pnpm install
cp .env.example .env.local   # fill in values; every variable is optional and documented
```

Database (development project; see `supabase/README.md`):

```bash
pnpm db:status            # read-only: compare remote history with local migrations
pnpm db:rehearse          # apply pending migrations in a transaction and roll back
pnpm db:migrate           # apply them
pnpm db:import-reference  # sourced reference datasets (crop parameters, NASS calendar, citations)
pnpm db:verify            # schema, RLS, grants, generated types → data/verification/supabase-schema.json
```

In Supabase → Authentication → URL Configuration set the Site URL to the deployed URL (`https://astrapon.vercel.app`; use `http://localhost:3000` only if there is no deployment) and allow `http://localhost:3000/**` plus the deployed URL with `/**` as redirect URLs. A localhost Site URL makes confirmation emails open localhost (see `supabase/README.md`).

## Run

```bash
pnpm dev               # http://localhost:3000
pnpm evidence:worker   # second terminal: downloads evidence and computes runs
```

Open `/setup` to see which services are configured (values are never shown).

## Test

| Command | What it checks | Needs |
|---|---|---|
| `pnpm check` | lint (incl. module boundaries), typecheck, unit tests (engine, evidence, geometry, grounding, formatting) | nothing |
| `pnpm build` | production build | nothing |
| `pnpm test:db` | two-user isolation and immutability against the dev project | Supabase secret key |
| `pnpm verify:sources` | live provider smoke tests → `data/verification/*.json` | network |
| `pnpm evidence:trace` | raw provider response → stored evidence → snapshot pin | network, dev project |
| `pnpm simulation:trace` | real POWER + SSURGO → run → identical re-run | network, dev project |
| `pnpm global:cases` | three live cases (Iowa, Bangladesh, Australia) → `data/verification/global-cases.json` | network, dev project |

The browser end-to-end checks used for each release are described in `docs/release-readiness.md`.

## Deploy

See `docs/operations.md`: Vercel for the web app, the GitHub Actions worker (or any Node host) for evidence and runs, environment variables, cache refresh, job recovery, monitoring, backup and rollback.

## Documentation

- `docs/astrapon-product-contract.md` — the permanent product, scientific and design contract
- `docs/release-readiness.md` — release gate with pass/fail/blocked evidence and the owner checklist
- `docs/scientific-methodology.md` — engine equations, parameter sources, constraints, ranking, limits
- `docs/evidence-methods.md` — evidence pipeline rules
- `docs/global-acceptance-cases.md` — three cases across climates and what they do and do not show
- `docs/challenge-alignment.md` — requirement matrix C1–C8 with evidence
- `docs/implementation-status.md` — what is done, verified, and limited
- `docs/architecture.md`, `docs/design-system.md`, `docs/operations.md`
- `docs/submission.md` — draft submission text and demo script
- `docs/ui-test-guide-simple.md`, `docs/manual-test-guide.md` — test guides for people

## Data, methods and attribution

- NASA POWER (Prediction of Worldwide Energy Resources) Daily API, Agroclimatology community — weather.
- MODIS MOD13Q1 v061 vegetation indices via the ORNL DAAC MODIS Web Service — greenness.
- NASA GIBS (HLS imagery) — drawing aid only.
- USDA NRCS Soil Data Access (SSURGO) — US soil water capacity. USDA NASS (2010) Usual Planting and Harvesting Dates — US calendars. USDA PLANTS — crop families.
- FAO Irrigation and Drainage Paper 56 (Allen et al., 1998) — ET0, crop coefficients, stage lengths, root depth, water balance.
- Map data © OpenStreetMap contributors; place search by Nominatim (submit-only, rate-limited).
- 3D crop forms are original procedural geometry; no third-party 3D assets are used.

Full citations are in the app (`/sources`, `/methodology`) and in `src/domain/sources/references.ts`.
