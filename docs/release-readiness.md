# Release readiness

Date: 2026-11-02 · Commit: Phase 7 release candidate (engine 1.1.0, evidence processing 1.1.0) · Target: development Supabase project + Vercel deployment `astrapon.vercel.app`.

**Verdict: READY as a development-scale release candidate. NOT yet deployed with this commit** — production still runs the Phase 5 code until the owner pushes and redeploys (publishing is an owner action). Four items are **blocked on owner access** and are not required for the core workflow (AI key, official submission rules, agronomist review, production-grade map/geocoder services); see "Blocked / owner actions".

Status values: **PASS** (checked here, evidence linked) · **FAIL** · **BLOCKED** (needs an owner action or access) · **N/A**.

## Release gate (full-application delivery requirements)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Authentication: sign-up with email confirmation, sign-in, reset, return paths, expired sessions | PASS | E2E `e2e3` (redirect with `next`, sign-in), `e2e6` (expired session → in-place "sign in again" with return link); confirmation links fixed for production in Phase 4 (`NEXT_PUBLIC_SITE_URL`, Supabase redirect URLs) — owner confirmed the deployed flow. |
| 2 | Required live data: NASA POWER daily, MODIS NDVI, SSURGO | PASS | `pnpm verify:sources` 2026-11-02: POWER, MODIS (ORNL), SSURGO **live_verified**; SoilGrids unavailable (not used). Worker fetched POWER + SSURGO in every E2E and in three climates (`global-cases.json`). |
| 3 | Calculation engine: deterministic, versioned, tested | PASS | `pnpm check`: unit tests incl. FAO-56 Example 8, water conservation (fixed cases and 300 random periods), sensitivity monotonicity (more rain never lowers water supply), byte-identical reproducibility, timeline = period balance, `scoreOptions` reproduces stored rankings. |
| 4 | Normal user persistence and isolation | PASS | `pnpm test:db` 17/17 (two users; reads, writes, nested ownership, immutability, saved plans pinned to result hash); `pnpm db:verify` (25 tables, RLS on all, owner-scoped policies, types current). |
| 5 | End-to-end own-field workflow with a fresh account and an unseeded field | PASS | `e2e6` 58/58: new user draws a field in the UI, records history and priorities in forms, fetches real evidence from the Evidence page, runs, replays, compares, changes priorities, saves a plan, exports, reopens identical in a new session; second user isolated. |
| 6 | Saved-run reproducibility | PASS | Identical result hashes on re-run (`simulation-trace.json`, three `global-cases.json` cases, UI "Re-run gave an identical result" in `e2e5`); exports contain stored rows and hashes. |
| 7 | Historical vs scenario distinction | PASS | Separate runs in every result; UI toggle and hypothetical banner; −20 % rainfall lowers water supply (test + trace 0.89 → 0.813). |
| 8 | Resolution labels and evidence classes | PASS | Evidence inspector and cards (`e2e4` 19/19); POWER "value describes the whole cell"; MODIS pixel footprints; class chips. |
| 9 | No fixture fallbacks in the app | PASS | ESLint bans fixture imports outside tests; grep: only `scripts/verify-sources.mts --write-fixtures` writes them. |
| 10 | Secrets and configuration | PASS | No secrets in tracked files (pattern scan for Supabase, Anthropic, GitHub tokens, JWTs and DB URLs: none); `.env*` ignored except `.env.example`; secret keys only server-side (`server-only` guard); `/setup` and `/api/health` show states, never values. |
| 11 | Error redaction | PASS (fixed) | Provider error pages (HTML/XML) were reaching the farmer in job messages; now removed (`userSafeMessage`, test). DB errors mapped to safe text; run errors bounded. |
| 12 | Cache access | PASS | Raw-response cache on the worker's disk only (`.cache/evidence`, git-ignored, never served, hash-checked on read). |
| 13 | Public example isolation | PASS | `/sample` stores edits in the browser only, labelled invented, no evidence shown; no seeded data in other accounts. |
| 14 | Visual review: all main pages × desktop/tablet/mobile × English/Bangla, reduced motion, focus | PASS | See "Visual review" below. |
| 15 | Functional controls: geolocation denial, search, boundary edit, crop selection, save/reload, scrubbing, input change, comparison, camera reset | PASS | `e2e3` 30/30 (location denial, search, drawing, vertex drag, zones, crops, atomic save, reload), `states` 16/16, `e2e6`, camera rotate/reset check in the visual sweep. |
| 16 | Performance on named profiles | PASS (targets met on GPU profiles) | See "Performance". Software rendering is below target (documented fallback). |
| 17 | Three global acceptance cases incl. Bangladesh and the Southern Hemisphere | PASS | `pnpm global:cases` 24/24, `docs/global-acceptance-cases.md`. |
| 18 | Live provider smoke tests separate from unit tests | PASS | `pnpm verify:sources`; `pnpm evidence:trace`; `pnpm simulation:trace`. |
| 19 | Deployment configuration, worker, operations | PASS | `docs/operations.md`; `.github/workflows/evidence-worker.yml` (schedule + dispatch observed working on 2026-11-01/02). |
| 20 | Production deployment of this release | BLOCKED (owner) | Requires `git push` (Vercel builds) and, for AI, the key. Not done here: changing production needs the owner's authorization. |

## Verification performed (2026-11-02)

| Check | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | pass |
| `pnpm test` | 191/191 in 13 files |
| `pnpm build` | pass |
| `pnpm db:verify` | pass (25 tables) |
| `pnpm test:db` | 17/17 |
| `pnpm verify:sources` | POWER, MODIS, SSURGO live_verified; SoilGrids unavailable; CMR data-access probes now return HTTP 400 instead of the Earthdata redirect (those collections are not used by the app) |
| `pnpm simulation:trace` | 13/13 on the final code. One earlier run the same day reported 12/13: the re-run was never claimed (the worker pass exited without processing it, consistent with the intermittent Supabase connection seen before); the trace now gives the worker a second pass. |
| `pnpm global:cases` | 24/24 |
| Browser E2E (production build, Chrome, SwiftShader) | Regression before the Phase 7 UI fixes: `e2e3` 30/30 · `states` 16/16 · `e2e4` 19/19 · `e2e5` 22/22 · `e2e6` 58/58 = **145/145**. On the final build: `e2e6` (fresh account, unseeded own field, full journey, second user) **58/58**. A first final `e2e6` attempt failed because the test script also clicked the MODIS fetch (its row matcher was too loose), making the worker pass 15+ minutes; the matcher was fixed and the rerun passed. |
| Visual sweep (final build) | 5/5 checks; 8 public pages × 3 widths; 11 signed-in pages × 3 widths (English) and × 2 widths (Bangla); 5 run tabs; reduced motion; focus; camera reset. No horizontal overflow, no console errors. |

The browser E2E scripts and the visual sweep live outside the repository (session scratch space) and use puppeteer-core with the installed Chrome; their steps are listed in `docs/implementation-status.md` so they can be repeated by hand with `docs/ui-test-guide-simple.md`.

**What this is not:** software verification only. No field trial, no comparison with observed yields or farm water use, no review by an agronomist or extension officer. The FAO-56 equations are checked against FAO's worked example; Hargreaves ET0 is uncalibrated for any location.

## Visual review

Inspected screenshots (1440, 820, 390 px; English and Bangla) of: landing, sign-in/up/reset, field creation (search, drawing), farms, workspace (3D, map, zones, timeline, Inspect), records, evidence (cards, inspector, charts, footprint map), scenario, run page (Replay, Compare, Why, Explanation, Full details, Save and export), saved runs, methodology, sources, setup, account, settings.

Fixed in this phase:
- On portrait phones the 3D camera started so close that the field filled the frame; the home distance now adapts to the canvas aspect (workspace, sample, replay) and "Reset view" uses it.
- The replay opened on a day when the existing practice was bare; it now opens a few weeks after its first planting.
- Replay playback dropped to ≈ 10 FPS under mobile CPU throttling: outlines rebuilt their geometry on every day step and crop data was recreated; fixed (memoised outlines, per-field memoised components, deferred tables).
- Footer and `/api/health` now name the release.

Known cosmetic issues left: the "1991–2020 avg" label can overlap the tallest bars in small evidence charts; Bangla scenario forms remain English (documented).

## Performance

Measured with Chrome (headless, puppeteer) on the development machine; FPS = browser frames per second while the scene is being driven (continuous orbit drag, or replay playing at 15 days/s); p95 = 95th-percentile frame time.

| Profile | Renderer | Quality (auto) | Workspace orbit | Replay playing | Replay orbit | Scrub key → date |
|---|---|---|---|---|---|---|
| Desktop 1440×900 @1× | Intel UHD Graphics 630 (ANGLE D3D11) | balanced (8 000 plants) | 55–59 FPS | 56.5 FPS (p95 17 ms) | 60 FPS | 16 ms |
| Mobile emulation 390×844 @3×, CPU 4× slower | Intel UHD 630 | balanced | 52.8 FPS | 30 FPS (p95 117 ms) | 60 FPS | 94 ms |
| Software rendering 1440×900 | SwiftShader | low (2 500 plants) | 9.8 FPS | 14 FPS | 52.5 FPS | 25 ms |

Before the fixes, mobile replay playback was 9.8 FPS and software scrubbing took 3.5 s. Scene complexity: one canvas; instanced plants per crop form (budget 2 500 / 8 000 / 18 000 by quality, shared across side-by-side copies); one extruded slab and outline per field copy; ≤ 260 rain streaks. JS heap after load ≈ 25–33 MB. Load to first 3D frame on the production build: 3.4–7.3 s on the GPU profiles (dominated by the authenticated page and the 3D chunk). Defaults: "auto" picks low on software renderers and balanced otherwise; users can choose high; offscreen canvases stop rendering.

These are engineering measurements on one machine, not guarantees for other devices.

## Blocked / owner actions

1. **Publish the release**: `git push` (Vercel deploys the web app; GitHub Actions uses the new worker). Deploy web app and worker from the same commit (the worker claims only runs of its own engine version).
2. **AI explanations** (optional): set `ANTHROPIC_API_KEY` on Vercel. Without it the page states that AI drafting is not configured. A real AI draft has not been produced in this environment.
3. **Submission rules**: the official 2026 Project Submission Guide could not be read from this environment; `docs/submission.md` labels its length limits as assumptions.
4. **External validation**: an agronomist or extension review of the three cases and of the planting windows; production map tiles and geocoder (public OSM/Nominatim are development-scale).
5. **Security hygiene**: the database password appeared in a chat on 2026-11-01; rotate it and update `.env.local` and the GitHub secret.

## Owner testing checklist (≈ 20 minutes, on the deployed site after pushing)

1. `/setup`: Supabase, worker trigger (and AI if set) show Configured.
2. Create a new account (use a new email), confirm the email link opens the deployed site, sign in.
3. **Create my field**: search a place, draw 4–5 corners, finish, drag a corner, save.
4. **All records**: two seasons with planting and harvest dates; priorities; save.
5. **Evidence → Refresh all**: NASA POWER "Up to date" within a few minutes (MODIS greenness is optional: its own button, about 2–3 min).
6. Create a scenario (US: choose a NASS state; elsewhere add planting windows), **Run simulation** → Finished → **Open result**.
7. Replay: Play, scrub, Next planting/harvest; Compare: move a priority slider, Undo, Save these priorities and run again.
8. Why this option?: check reasons, dates and their sources, gaps.
9. Save and export: save a plan, download JSON, sign out and in again, reopen the plan from Saved runs.
10. Settings → বাংলা; reopen the run. Phone width: one option at a time, no sideways scrolling.
11. Second account: paste the first account's run link → Not found.
