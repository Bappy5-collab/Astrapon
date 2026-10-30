# Architecture

## Directory layout

```
src/
  app/                 Next.js App Router routes, layouts, error/loading boundaries, route handlers
  components/
    shell/             App shell, navigation, brand
    scene/             Client-only 3D (React Three Fiber). Loaded via next/dynamic with ssr:false
  domain/              Pure TypeScript: no React/Next/MUI/Three/Supabase/I/O
    provenance/        Evidence classes and lineage (implemented)
    sources/           Typed data-source + reference registry (Phase 1)
    farm/              Farmer record schemas (zod) mirroring DB constraints
    geo/               GeoJSON boundary validation and geodesic area
    scenario/          Scenario settings v1 (historical replay window, never a forecast)
    reference/         Canonical JSON + sourced reference datasets for import
    simulation/        Engine version placeholder; engine arrives in Phase 4
  lib/
    env/               Environment schemas (pure) + public env reader
    supabase/          Browser Supabase client (returns null when unconfigured)
  server/              Server-only ("server-only" import guard)
    env.ts             Secret env reader; exposes a value-free report
    auth/              getAuth/requireUser (getClaims), auth server actions
    farm/              Farm/field/scenario queries and server actions (user-scoped client, RLS)
    database/          Request-scoped Supabase client, generated types, safe error messages
    providers/         Validated public clients: NASA POWER, ORNL MODIS, CMR, USDA SDA, SoilGrids (Phase 1)
      __fixtures__/    Labelled test-only captures (lint-banned outside tests)
  theme/               MUI theme + design tokens
  proxy.ts             Session refresh + protected-route redirect (bounded; pass-through when unconfigured/unreachable)
scripts/               verify-sources.mts; db/ (migrate, rehearse, import-reference, verify + type generation)
tests/db/              Live two-user isolation tests (pnpm test:db)
data/verification/     Committed live-verification records (provenance, hashes, traces)
supabase/migrations/   SQL migrations (applied to the dev project; see supabase/README.md)
docs/                  Contract, plan, status, alignment matrix
```

## Boundary rules (enforced in `eslint.config.mjs`)

| Module | May import | Must not import |
|--------|-----------|-----------------|
| `src/domain/**` | other domain modules, `zod` if needed | React, Next, MUI, Three/R3F, Supabase, `@/server`, `@/components`, `@/app`, `@/lib` |
| `src/components/**`, `src/theme/**` | domain, lib, theme | `@/server/**` |
| `src/server/**` | anything server-side | n/a (guarded by `import "server-only"`) |

Why:

- The simulation engine stays deterministic and unit-testable.
- Reproducible runs depend only on pinned inputs and the engine version.
- Secrets can never reach a client bundle.

## Rendering strategy for 3D

- `FarmPreview` (client) probes WebGL once with `useSyncExternalStore`, then picks one of four outcomes:
  - **checking** state during server rendering,
  - **unavailable** message when there is no WebGL,
  - **reduced** quality on software renderers (no shadows, DPR 1, no default auto-rotate),
  - **full** quality otherwise.
- The R3F scene is dynamically imported with `ssr:false`. A component error boundary and a `webglcontextlost` listener turn runtime failures into readable messages.
- Rendering pauses (`frameloop="never"`) while the stage is offscreen or the tab is hidden. Without auto-rotate it renders on demand only.
- Measured with headless Chrome using SwiftShader (software) at 1440×1000: full quality ran at ~1.5 fps and froze the page; the reduced tier runs at 42–61 fps.

## Environment

- Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (read in `src/lib/env/public.ts`).
- Server: `SUPABASE_SECRET_KEY`, `NASA_EARTHDATA_TOKEN`, `OPENTOPOGRAPHY_API_KEY`, `ANTHROPIC_API_KEY` (read in `src/server/env.ts`). The app never uses the secret key; scripts and DB tests do.
- Scripts only: `SUPABASE_DB_URL`, read by `scripts/db/connect.mts`, which refuses a URL whose project ref differs from the app's.

## Data security

- RLS on every table: owner policies for user tables, read-only published reference data, no client writes to evidence or results.
- Composite owner foreign keys stop a user attaching a child to another user's parent even with a guessed id.
- Input snapshots are immutable copies with a server-computed SHA-256 and FK-pinned reference dataset versions.
- Parsers in `src/lib/env/schema.ts` report `configured | missing | invalid` per feature and only ever name variables, never values.
