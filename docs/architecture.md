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
    scenario/          Scenario settings v1/v2 (replay window, planting windows, transformations; never a forecast)
    reference/         Canonical JSON + sourced reference datasets for import
    simulation/        Pure rotation + FAO-56 water-balance engine (docs/scientific-methodology.md), crop catalogue, NASS parser
  lib/
    env/               Environment schemas (pure) + public env reader
    supabase/          Browser Supabase client (returns null when unconfigured)
  server/              Server-only ("server-only" import guard)
    env.ts             Secret env reader; exposes a value-free report
    auth/              getAuth/requireUser (getClaims), auth server actions
    farm/              Farm/field/scenario queries and server actions (user-scoped client, RLS)
    simulation/        Run queries and actions (request_simulation, re-run, cancel); runs execute in the worker
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

## Field workspace (Phase 3)

- Geometry pipeline (pure, `src/domain/geo`):
  - `boundary.ts` validates GeoJSON: closure, crossings, holes inside the shell, non-overlapping parts, area, ±85° latitude and ≤ 30 km extent. It rejects rings that cross the 180° meridian, with an explanation.
  - `drawing.ts` is the undoable map-drawing state (outer ring plus holes).
  - `local-frame.ts` converts lon/lat to local east/north metres via WGS84 ECEF → ENU (never degrees as metres), unwrapping longitudes around the field centre.
  - `coordinates.ts` parses typed coordinates (decimal, N/S/E/W, DMS).
- `src/components/field3d`:
  - `model.ts` scales the local-metre field uniformly into the scene and places plants on rows aligned with the longest edge.
  - `plants.ts` builds original merged plant geometries per crop form, one instanced draw call per form.
  - `FieldScene.tsx` is the R3F scene.
  - `FieldViewport.tsx` wraps the scene with capability detection, quality presets, context-loss restart, a compass and camera controls.
  - `HeroField.tsx` reuses the scene on the landing page.
- `src/components/map`: Leaflet (lazy, client-only) with OSM tiles and NASA GIBS HLS imagery. A custom vertex editor supports click to add, drag, midpoint insert, select + delete, and a keyboard "add point at centre".
- `src/components/workspace`:
  - `useWorkspace` holds staged edits (boundary, zones, crop assignments) and produces the save payload.
  - After the farmer confirms a change summary, `saveWorkspace` → `save_field_workspace` commits the edits together in one transaction (SECURITY INVOKER).
  - The sample uses the same component and applies edits to localStorage instead.
- Place search: `/api/geocode` → `src/server/geocode/nominatim.ts`. It is submit-only, with a shared 1 req/s queue, a 24 h cache and a kill switch.
- i18n: `src/lib/i18n` holds an English/Bangla dictionary, read from the cookie `fs_locale`, with `useT()` on the client and `getT()` on the server.

## Evidence pipeline (Phase 4)

```text
UI (evidence page / workspace drawer)
  └─ server action requestEvidence → rpc request_evidence → evidence_jobs (queued)        [web request returns at once]
scripts/evidence-worker.mts  (separate Node process, SUPABASE_DB_URL, trusted role)
  └─ claim job (SKIP LOCKED + lease) → src/server/pipeline/{power,modis,ssurgo}.ts
       └─ fetchText (allowlist, per-host limit, retries) ↔ .cache/evidence (raw chunks, atomic, resumable)
       └─ normalise + aggregate (src/domain/evidence) → one transaction: evidence_retrievals + evidence_aggregates
UI reads latest retrieval per source + aggregates → buildEvidenceView (pure) → metrics, charts, footprints, inspector
create_input_snapshot → inputs.evidence (v2) + snapshot_evidence_retrievals pins (FK blocks deletion)
```

Rules: `docs/evidence-methods.md`.

## Rendering strategy for 3D

- The viewport probes WebGL once with `useSyncExternalStore`:
  - **checking** during server rendering;
  - an **unavailable** message without WebGL (the map and tables still work);
  - otherwise, the scene at a quality preset.
- Quality presets are set in Settings or the viewport menu and stored per device. Auto picks Low on software renderers.

  | Preset | DPR | Other settings | Plants |
  |---|---|---|---|
  | Low | 1 | no antialias | ~2.5k |
  | Balanced | ≤ 1.5 | | ~8k |
  | High | ≤ 2 | shadows | ~18k |

- The R3F scene is dynamically imported with `ssr:false`. An error boundary and a `webglcontextlost` listener turn failures into readable messages. After context loss there is a "Restart 3D view" action.
- `frameloop` settings:
  - `demand` by default, rendering only on change;
  - `never` while the scene is offscreen or the tab is hidden;
  - `always` only for the landing hero while it turns, and never under reduced motion.
- Geometries and textures created outside JSX are disposed when replaced or unmounted (`useDisposable`).
- An earlier measurement used headless Chrome with SwiftShader (software rendering) at 1440×1000. Full quality ran at ~1.5 fps; the reduced tier ran at 42–61 fps.

## Environment

- Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (read in `src/lib/env/public.ts`). Optional `NEXT_PUBLIC_OSM_TILE_URL` replaces the OpenStreetMap tile URL.
- Optional server switch: `GEOCODER_DISABLED=1` turns place search off without a code change.
- Server: `SUPABASE_SECRET_KEY`, `NASA_EARTHDATA_TOKEN`, `OPENTOPOGRAPHY_API_KEY`, `ANTHROPIC_API_KEY` (read in `src/server/env.ts`). The app never uses the secret key; scripts and DB tests do.
- Scripts only: `SUPABASE_DB_URL`, read by `scripts/db/connect.mts`, which refuses a URL whose project ref differs from the app's.

## Data security

- RLS on every table: owner policies for user tables, read-only published reference data, no client writes to evidence or results.
- Composite owner foreign keys stop a user attaching a child to another user's parent even with a guessed id.
- Input snapshots are immutable copies with a server-computed SHA-256 and FK-pinned reference dataset versions.
- Parsers in `src/lib/env/schema.ts` report `configured | missing | invalid` per feature and only ever name variables, never values.
