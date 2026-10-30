# Supabase

FieldShift's schema lives in `migrations/` and is applied to the dedicated FieldShift **development** project only.

## Rules

- Every script checks that the project ref in `SUPABASE_DB_URL` matches the one in `NEXT_PUBLIC_SUPABASE_URL`, and refuses to run if they differ.
- Migrations are additive. Never edit a migration that has been applied (`pnpm db:status` reports it as drift). Add a new one instead.
- Nothing here resets, truncates or drops remote objects. Destructive changes need explicit owner approval.
- The running app never uses the secret key or the DB URL. It talks to Supabase only as the signed-in user, so RLS applies.

## Commands

```
pnpm db:status            # read-only: remote history vs local files, drift
pnpm db:rehearse          # apply pending migrations in one transaction, then roll back
pnpm db:migrate           # apply pending migrations (each in its own transaction)
pnpm db:import-reference  # idempotent import of sourced reference datasets
pnpm db:types             # regenerate src/server/database/database.types.ts and verify
pnpm db:verify            # schema/RLS/grant/type checks → data/verification/supabase-schema.json
pnpm test:db              # two-user isolation tests (creates and deletes throwaway users)
```

History is recorded in `supabase_migrations.schema_migrations`, the Supabase CLI table, so the CLI sees the same state.

## Data model (Phase 2)

- **Ownership.** Every user row carries `owner_id` (default `auth.uid()`). Each child references its parent with a composite key `(parent_id, owner_id)`, so a row can only attach to a parent with the same owner. Zone references use `(zone_id, field_id, owner_id)`, so the zone must also belong to the same field. RLS limits every statement to the caller's own rows.
- **Geography vs scene.** Boundaries are PostGIS `geometry(MultiPolygon, 4326)`. Validity is checked, zones must lie within the field (1 m tolerance), and area and centroid are maintained by trigger and not writable by clients. Illustrative 3D settings live in `field_scene_settings` and never share columns with coordinates.
- **Reference data.** `reference_datasets` are versioned (draft → published → retired), with items and citations. Once published they are frozen by trigger. Clients can read published data only and cannot write.
- **Evidence.** `evidence_retrievals` store the request, response SHA-256, size, checks and provenance, never raw rasters or time series. `evidence_aggregates` are small, immutable per-retrieval values in which null means no data, never zero. Both are written by trusted server code only.
- **Scenarios and snapshots.**
  - `simulation_input_snapshots` copy every input and pin reference datasets by id and hash through `snapshot_reference_datasets`.
  - Snapshots are hashed server-side and cannot be updated.
  - `simulation_runs` can be queued or cancelled by users; only trusted workers can start, finish or fail them.
  - `simulation_results` are worker-written and immutable.
- **Storage.** Not used.

## Auth settings to set in the dashboard (owner)

- **Authentication → URL Configuration**: Site URL `http://localhost:3000`. Add `http://localhost:3000/**` (and any other dev origin) to the redirect URLs so confirmation and reset links can return to `/auth/confirm`.
- **Optional, recommended:** in the Confirm signup and Reset password email templates, use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/farms` (and `type=recovery&next=/account/update-password`). That lets links work in a different browser. The default template also works through the PKCE `?code=` path in the same browser.
- **SMTP**: the built-in sender is rate-limited and intended for testing. Configure custom SMTP before inviting real users.
