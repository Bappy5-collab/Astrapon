# Supabase

There are no migrations yet. The schema, Auth, and RLS arrive in Phase 2 (see `docs/implementation-plan.md`).

Rules:

- Target only the dedicated FieldShift **development** project. Verify the project ref before applying anything.
- Migrations are additive and non-destructive. Destructive changes need explicit owner approval.
- Generated types will live under `src/server/database/`.
