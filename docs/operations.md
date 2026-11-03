# Operations: deployment, worker, data refresh, recovery

Astrapon is two processes that share one Supabase project:

| Process | What it does | Where it runs |
|---|---|---|
| Next.js web app | Pages, auth, server actions. Only **queues** evidence jobs and simulation runs; never downloads or computes them in a request. | Vercel (or any Node ≥ 22.12 host: `pnpm build && pnpm start`). |
| Node.js worker (`pnpm evidence:worker`) | Downloads and processes evidence (POWER, MODIS, SSURGO) and computes simulation runs from immutable pinned rows. | Locally beside `pnpm dev`; for the deployed site, GitHub Actions (`.github/workflows/evidence-worker.yml`). Any always-on Node host also works. |

## Environment

`.env.example` lists every variable with comments. Summary:

| Variable | Used by | Secret | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web app (browser + server) | no | Required for accounts. |
| `NEXT_PUBLIC_SITE_URL` | web app | no | Base URL for email links (e.g. `https://astrapon.vercel.app`). |
| `SUPABASE_SECRET_KEY` | scripts and tests only | **yes** | Never used by the web app. |
| `SUPABASE_DB_URL` | worker and `pnpm db:*` scripts | **yes** | Session-pooler URI. Scripts refuse to run if its project ref differs from the public URL. |
| `GITHUB_DISPATCH_TOKEN` | web app (server) | **yes** | Optional. Fine-grained token, *Actions: read and write* on this repository only. Starts the worker workflow right after queueing. Leave empty locally to avoid dispatching real workflows. |
| `ANTHROPIC_API_KEY` | web app (server) | **yes** | Optional AI explanation drafts. Without it the page says AI is not configured and everything else works. |
| `NASA_EARTHDATA_TOKEN`, `OPENTOPOGRAPHY_API_KEY` | reserved | **yes** | Not used by the app yet. |

`/setup` and `/api/health` report each service as configured / missing / invalid without ever showing values.

## Deploying the web app (Vercel)

1. Import the GitHub repository. Framework preset Next.js; install `pnpm install`, build `pnpm build`. Node 22.
2. Set the environment variables above for **Production** (not the scripts-only secrets: `SUPABASE_SECRET_KEY` and `SUPABASE_DB_URL` are not needed by the web app).
3. In Supabase → Authentication → URL Configuration: Site URL `https://<your domain>`; redirect URLs `https://<your domain>/**` and `http://localhost:3000/**`.
   Also set `NEXT_PUBLIC_SITE_URL=https://<your domain>` on Vercel (email links use it). If confirmation links open localhost, the Site URL is still `http://localhost:3000` or the deployed URL is missing from the redirect list.
4. Deploy. Check `https://<your domain>/setup` and `/api/health`.

Changing production is an owner action. Nothing in this repository deploys automatically except Vercel's own Git integration.

## Running the worker for the deployed site (GitHub Actions)

- Repository secret `SUPABASE_DB_URL` (Settings → Secrets and variables → Actions → Repository secrets).
- The workflow runs every 10 minutes and on `workflow_dispatch`, drains the queue with `--once` and exits. Job limit 3 hours; the worker step stops at 170 minutes so the download cache is saved.
- GitHub may delay or skip scheduled runs, and disables schedules after 60 days without repository activity (re-enable on the Actions tab). With `GITHUB_DISPATCH_TOKEN` on the web app, queueing dispatches a run immediately.
- The worker only claims simulation runs of its own engine version, so deploy the web app and the worker from the same commit.

## Cache and data refresh

- Raw provider responses are cached on the worker's disk (`.cache/evidence`, or `ASTRAPON_CACHE_DIR`), keyed by product, location, period and request parameters, and verified by hash on read. In GitHub Actions the cache is restored and saved with `actions/cache` between runs. The cache is never served to users and never stored in PostgreSQL.
- A refresh always creates a new retrieval; saved snapshots keep pointing at the old one, so saved runs never change. Old cache files can be deleted at any time (the next refresh downloads again).
- The first MODIS retrieval for a new location takes 15–20 minutes (sequential ORNL requests); later refreshes reuse cached chunks.

## Job recovery

- Evidence jobs hold a 3-minute lease renewed while working. A job whose worker died is reclaimed after its lease expires. Provider outages are retried (up to 3 attempts with back-off); permanent failures are marked failed with a farmer-readable message (provider error pages are not shown).
- Simulation runs left `running` for more than 10 minutes are closed as failed ("The worker stopped while this run was in progress. Run it again."); the farmer re-runs from the scenario page.
- Cancelling is always safe: a cancelled job or run never writes results.

## Monitoring

- `/api/health` (configuration states, phase) for uptime checks.
- GitHub → Actions → "Evidence worker": every run's log lists claimed jobs and runs with their outcome.
- Database: `select status, count(*) from evidence_jobs group by 1;` and the same for `simulation_runs` show backlogs; queued rows older than ~20 minutes mean the worker is not running.
- Vercel runtime logs: `worker dispatch: GitHub answered HTTP …` means the dispatch token is missing permissions or expired.

## Backup and rollback

- **Database:** Supabase daily backups (plan-dependent; point-in-time recovery is a paid add-on). Before a migration: `pnpm db:rehearse` (applies in a transaction and rolls back), then `pnpm db:migrate`. Migrations are additive and never edited after they are applied; a rollback is a new migration.
- **Web app:** Vercel → Deployments → promote the previous deployment ("Instant rollback").
- **Worker:** re-run the workflow at the previous commit (Actions → Run workflow → choose the ref), or revert and push.
- **Engine:** results record their engine version and are immutable. Rolling the engine back means older runs keep their stored results; new runs use the deployed version.
- **Reference data:** published datasets are frozen; a correction is a new version (`pnpm db:import-reference`).

## Local development

```
pnpm install
cp .env.example .env.local      # fill in the dev project values
pnpm db:status && pnpm db:rehearse && pnpm db:migrate && pnpm db:import-reference && pnpm db:verify
pnpm dev                         # terminal 1
pnpm evidence:worker             # terminal 2
```
