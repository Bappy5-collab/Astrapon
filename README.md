# Astrapon

Astrapon helps farmers and agronomists compare crop rotation options for a specific field. The comparison draws on environmental evidence, soil and crop history, water limits, and the farmer's priorities. It explains the tradeoffs to review locally. The main workspace is an interactive 3D farm simulator.

> **Status: Phase 4 (evidence pipeline).** On top of the 3D field workspace, a saved field can fetch NASA POWER weather (1981 onwards), MODIS greenness and US soil survey data through a background worker, with indicators, an evidence inspector and data-footprint maps. Run `pnpm evidence:worker` beside `pnpm dev`.
>
> **Phase 3 (3D field workspace).**
>
> - Find a place by search, coordinates or device location.
> - Draw the field boundary on a street map or NASA HLS imagery.
> - Add planting zones and assign crops by season.
> - Inspect the field in an illustrative 3D view.
>
> Changes are saved together after a confirmation. A public sample works without an account. There is no rotation model yet, so no results are shown. See `docs/implementation-status.md` and `docs/design-system.md`.

## Requirements

- Node.js ≥ 22.12 (developed on 22.17.1)
- pnpm 12 (`npm i -g pnpm@12`, or `corepack enable`)

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Production build:

```bash
pnpm build
pnpm start
```

Checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check          # all three
pnpm verify:sources # live provider checks; writes data/verification/*.json
pnpm db:status      # database scripts: see supabase/README.md
pnpm test:db        # live two-user isolation tests against the dev project
pnpm evidence:worker # background worker that downloads and processes evidence (needs SUPABASE_DB_URL)
pnpm evidence:trace  # live end-to-end evidence trace (creates and deletes a throwaway user)
pnpm simulation:trace # live end-to-end simulation trace: real POWER + SSURGO → run → identical re-run
```

## Configuration

The app runs with **no credentials**. To enable services:

1. Create a **new, dedicated** Supabase project for Astrapon development. Do not reuse another app's project.
2. Run `cp .env.example .env.local` and fill in the values. See the comments in the file.
3. Add `SUPABASE_DB_URL` (session pooler URI with your database password) for the database scripts, then run `pnpm db:migrate`, `pnpm db:import-reference` and `pnpm db:verify`.
4. In Supabase → Authentication → URL Configuration, set the Site URL to your app URL (`http://localhost:3000` locally) and allow `http://localhost:3000/**` (and your deployed URL with `/**`) as redirect URLs. Set `NEXT_PUBLIC_SITE_URL` on the deployment so email links use it.
5. Restart `pnpm dev` and open `/setup` to confirm each service shows **Configured**. The page never displays values.

`/api/health` returns the same configuration states as JSON.

## Project docs

- `docs/astrapon-product-contract.md`: permanent product, scientific, and design contract
- `docs/architecture.md`: module layout and enforced boundaries
- `docs/implementation-plan.md`: phases 1–7
- `docs/implementation-status.md`: what is done and verified
- `docs/challenge-alignment.md`: requirement matrix C1–C8
- `docs/research/`: challenge source and data-source research

Astrapon is being built to use publicly available NASA data products. It is not affiliated with or endorsed by NASA.
