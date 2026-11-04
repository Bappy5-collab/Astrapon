# Supabase

Astrapon's schema lives in `migrations/` and is applied to the dedicated Astrapon **development** project only.

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

- **Authentication → URL Configuration**: Site URL = the deployed site, `https://astrapon.vercel.app` (not localhost). Redirect URLs: `https://astrapon.vercel.app/**` and `http://localhost:3000/**`. Supabase sends a link to the Site URL whenever the requested return address is not in the redirect list, and `{{ .SiteURL }}` in an email template is always the Site URL — so a localhost Site URL makes every confirmation link open localhost.
- **Branded emails (2026-11-05):** `supabase/templates/confirm-signup.html` and `reset-password.html` are Astrapon-branded (subjects "Confirm your Astrapon account" / "Reset your Astrapon password"). Supabase allows template changes only with custom SMTP (or a paid plan): on the free plan with the built-in sender the API answers "Email template modification is not available for free tier projects using the default email provider". `pnpm auth:config` therefore always applies the Site URL and redirect list, and the templates, subjects and sender name only when custom SMTP is configured (applied 2026-11-05: Site URL and redirect list only). Apply with `pnpm auth:config` (`--dry-run` first); it needs `SUPABASE_ACCESS_TOKEN`, a personal access token, and never prints it. Or paste the files into Authentication → Email Templates by hand. Their links use `{{ .SiteURL }}` with the token hash, so the Site URL must be the deployed site.
- **Email confirmation is OFF (2026-11-05, owner's choice):** the built-in sender allows only 2 emails an hour (`rate_limit_email_sent = 2`, raisable only with custom SMTP), which blocked sign-ups with "Too many emails were sent". `pnpm auth:config --autoconfirm` set `mailer_autoconfirm = true`: new accounts are active at once and get no email, so addresses are not verified. Turn it back on with `pnpm auth:config --require-confirm` once custom SMTP is configured. Password-reset emails still count against the hourly limit.
- **Sender:** the built-in sender always sends from Supabase's own address and ignores the sender name. To send as "Astrapon" from your own domain, configure custom SMTP (Authentication → SMTP, e.g. Resend or another provider with a verified domain); `pnpm auth:config` already sets the sender name.
- **Previously recommended (now in the templates):** in the Confirm signup and Reset password email templates, use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/farms` (and `type=recovery&next=/account/update-password`). That lets links work in a different browser. With this template every link opens the Site URL, also for sign-ups made on localhost. The default template (`{{ .ConfirmationURL }}`) returns to the address the app asked for (`NEXT_PUBLIC_SITE_URL`, else the page's own origin) when it is in the redirect list.
- **SMTP**: the built-in sender is rate-limited and intended for testing. Configure custom SMTP before inviting real users.
