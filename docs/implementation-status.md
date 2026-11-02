# Implementation status

Last updated: 2026-11-02, end of Phase 7 (prompt 7: final visual review, scientific verification and release). Release gate: `docs/release-readiness.md`.

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Phase 0 foundation | Done | Scaffold, theme and shell, env validation, module boundaries. |
| Challenge source verified | Done | `docs/research/challenge-source.md`. The Resources tab publishes 13 Nov 2026 and must be re-checked. |
| Data source research | Done (Phase 1) | `docs/research/data-sources.md`, registry `src/domain/sources/`, `/sources`. |
| NASA POWER, MODIS (ORNL), USDA SSURGO clients | **Live-verified** (Phase 1) | `src/server/providers/`, `data/verification/*.json`. |
| **Evidence pipeline** | **Done (Phase 4)** | NASA POWER (full daily record 1981 → last complete month), MODIS MOD13Q1 NDVI grid with pixel reliability, SSURGO AWC (US). Persisted job queue `evidence_jobs` processed by `pnpm evidence:worker`, a separate process. Disk cache for raw chunks, resumable. One transaction per retrieval. See `docs/evidence-methods.md`. |
| Indicators | **Done** | Frost and hot days, longest dry spell, 10+ day dry spells, seasonal precipitation vs 1991–2020, temperature anomaly, root-zone wetness (model) vs normal, NDVI annual peak with Theil–Sen direction, SSURGO AWC 0–100 cm. Completeness gates; missing data never treated as zero; no interpolation. |
| Evidence UX | **Done** | `/fields/[id]/evidence`: per-source status (not fetched, queued, running with progress, failed, stale, up to date, not available here) with fetch, refresh, retry and cancel; metric cards with an inspector (plain facts first, technical provenance on request); charts with table views; a data-footprint map. The workspace Inspect drawer shows status and headline metrics; the workspace map has a "Data footprints" toggle. |
| Snapshot pinning | **Done** | Input schema v2 pins the newest valid retrieval per source by id, response hash and an aggregates digest. A pinned retrieval cannot be deleted while its field exists; refreshes never change saved snapshots. |
| IMERG / SMAP / NASADEM / SoilGrids | Not added (by decision) / unavailable | IMERG would double-count precipitation with POWER. SMAP surface moisture is a different quantity and depth from POWER root-zone wetness, and needs an async AppEEARS job. NASADEM has no indicator yet. SoilGrids REST returned 503 on 2026-10-31. Registry statuses unchanged. |
| Dev Supabase, schema, RLS, auth | Done (Phase 2) | 5 migrations applied. `pnpm db:verify` passes 14 checks. |
| Design system | **Done (Phase 3)** | `docs/design-system.md`, `src/theme/tokens.ts`; 24 text/background pairings tested in `contrast.test.ts`; Latin + Bangla font stacks; three elevations; tabular numerals; reduced motion. |
| Landing page | **Done** | Working location search (usable before 3D loads), live 3D sample hero, farmer problem, workflow with honest per-step status, grid-vs-field evidence table, no invented statistics. |
| Public sample | **Done** | `/sample`. Invented outline and records, labelled everywhere. Edits are saved to this browser only and survive reload; "Reset sample" restores it. |
| Location | **Done** | Place search via Nominatim (submit-only, server queue 1 req/s, cache, attribution, kill switch); typed coordinates (decimal, N/S/E/W, DMS); device location only on button press, with denial/timeout/unsupported messages. |
| Boundary and zone drawing | **Done** | Leaflet map on OSM streets or NASA GIBS HLS 30 m imagery (date picker + "nearest earlier" search). Click/tap corners, finish, drag, midpoint insert, select + delete, undo, cut-out areas (holes), keyboard "add point at centre". Confirmation step before saving. |
| Geometry rules | **Done** | Local ECEF→ENU frame; holes inside shells; no overlapping parts; ±85° latitude; ≤ 30 km extent; antimeridian-crossing fields rejected with an explanation (adjacent fields work). Zones stay inside the field, checked at commit even when the boundary changes in the same save. |
| 3D field workspace | **Done** | `/fields/[id]`: real field and zones in local metres, flat illustrative terrain, original instanced crop forms per recorded crop, illustrative growth stages, orbit/pan/zoom, compass with reset, camera buttons, click/tap or list selection with a lime outline, tint and edge ribbon, quality presets, WebGL fallback, context-loss restart. |
| Crops, history, save | **Done** | Assign a crop per zone or whole field, year and season; year × zone timeline table; Inspect drawer with history, soil and evidence coverage. All edits saved atomically by `save_field_workspace` after a summary dialog. The full record forms moved to `/fields/[id]/records`. |
| Saved runs, methodology, settings | **Done** | `/runs` (saved plans, runs with status, scenarios and snapshots), `/runs/[id]` (the run journey below), `/methodology` (simulation section), `/settings`. |
| Bangla interface | Partial | Navigation, workspace controls, location search, settings, landing hero and **the whole run journey** (replay, compare, why, explanations, plans, export, run panel, saved runs). Dates use month names and Bangla digits. Engine notes (gaps, assumptions, rejection details) stay English and are labelled. Record forms, evidence text and methodology are English (stated in Settings). |
| **Simulation and rotation engine** | **Done (Phase 5; 1.1.0 in Phase 6)** | Engine `1.1.0` (1.0.0 in Phase 5), pure TypeScript in `src/domain/simulation`; method in `docs/scientific-methodology.md` (written first). FAO-56 Hargreaves ET0 (Eq. 52), single-coefficient Kc curve, daily Ch. 8 root-zone water balance with a conservation check; hard constraints before ranking; baseline from dated history; up to three crop-set-distinct alternatives; priority-weighted relative scores; contributions, priority ablation, sensitivity cases with a stable/fragile label; data-completeness counts; gaps, assumptions, review questions, references. Historical replay and the transformed scenario (rainfall %, temperature °C) are reported separately. |
| Sourced parameters | **Done** | `crop-parameters` v1 (28 crops: FAO-56 Tables 11/12/22 checked against the FAO HTML; families from the USDA PLANTS API) and `usda-nass-usual-dates-2010` v1 (271 state × crop windows parsed from the committed NASS text), published as reference datasets and pinned by snapshots. No calendar outside the US except the farmer's own dates. |
| **Interactive replay** | **Done (Phase 6)** | Engine 1.1.0 stores a day-by-day timeline per compared option (latest complete rotation-length window; same FAO-56 code path; display only). `/runs/[id]` → Replay: play/pause/reset, previous/next day, previous/next planting or harvest, speed (7–60 days/s), a scrubber with planting ▲ / harvest ▼ markers, and selected-date inspection. One canvas shows the existing practice and the two best alternatives side by side with a shared camera (one at a time on small screens, with a switcher; camera direction kept when the layout changes). Plant stage and height follow FAO-56 stage progress; soil shade follows root-zone depletion (legend); a dashed blue ring marks irrigation; falling drops mark recorded rain (illustrative, off with reduced motion). Playback moves an index into stored arrays, so speed, scrubbing and frame rate cannot change a number. Zones are selectable; the panel says the engine is whole-field. Text equivalents: the selected-date table (all options) and a monthly table. |
| **Comparison and priorities** | **Done (Phase 6)** | Compare: options in rank order on common inputs (same years, soil value and indicator definitions), every indicator with unit and direction, scored / not scored / dropped, relative scores with "not probabilities", stability. Priority preview re-ranks the shown options with the engine's own `scoreOptions()` on the stored table (unsaved, with undo and "back to saved"); "Save these priorities and run again" is a separate explicit action. Results whose snapshot no longer equals the scenario's current inputs are marked out of date with "Run again with current inputs". |
| **Explanations** | **Done (Phase 6)** | "Why this option?": rank and per-priority contributions, better/worse against the existing practice with units, planting dates with their source, evidence used (POWER years, soil value and source, crop-parameter dataset), what was ruled out, data gaps, questions for a local expert, and a glossary (ET, NDVI, soil moisture anomaly, water balance, Ks). A deterministic plain-language summary is always shown. Optional AI draft (Claude, server-side key, `claude-opus-5-5`, server-side refusal fallback on): the model receives only the run's structured result (no names, notes, coordinates or account data), must cite ids from a closed source list, and every statement is checked: unknown or missing sources and numbers not present in the result are removed; suggested actions are validated and only run on a click. Bounded: one request, 60 s timeout, one retry, 6 drafts per user per 10 min, cache by result hash. |
| **Saved plans and export** | **Done (Phase 6)** | `saved_plans` (migration `20261102100000`): a chosen option of a finished run, pinned to the stored result hash by a trigger; only name and note can change; owner-only RLS. Plans are listed on `/runs` and the run page, editable and deletable; runs can be deleted (result and plans cascade). `/runs/[id]/export` downloads the stored snapshot, pinned datasets and evidence retrievals, the stored result with its hash, and plans, exactly as saved (no recalculation); "Print or save as PDF" prints the full details. |
| Worker on the deployed site | **Done** | `.github/workflows/evidence-worker.yml` drains the queue every 10 minutes and on dispatch; with `GITHUB_DISPATCH_TOKEN` set, queueing evidence or a run dispatches it at once (`src/server/worker/dispatch.ts`). The download cache is kept between runs. The worker only claims runs of its own engine version. |
| Runs and reproducibility | **Done** | `request_simulation` freezes inputs (reusing an unchanged snapshot) and queues one run. The worker builds the engine input only from pinned immutable rows, verifies their hashes, and stores the result in `simulation_results` with the input digest and compute time. "Re-run and compare" checks the result hash. Scenario settings v2 (calendar region, planting windows, turnaround, transformations); v1 rows upgrade in memory. |

## Verified in Phase 7

- Regression on the production build: `e2e3` 30/30 (location denial, search, drawing, vertex drag, zones, crops, save/reload), `states` 16/16, `e2e4` 19/19 (evidence UI), `e2e5` 22/22 (scenario, run, result, re-run identical; now opens the Full details tab), `e2e6` 58/58 (own-field journey) — 145/145.
- Visual sweep (Chrome, SwiftShader): public pages at 1440/820/390 px; signed-in pages at 1440/820/390 px in English and 1440/390 px in Bangla; run tabs; reduced motion (no rain animation); visible keyboard focus (3 px outline); camera rotate and reset; no horizontal overflow; no console errors.
- Performance (Chrome, Intel UHD 630 via ANGLE D3D11; mobile emulation with 4× CPU throttling; SwiftShader): see `docs/release-readiness.md` — desktop 55–60 FPS, mobile emulation 30–60 FPS, software 10–52 FPS.
- Science: new tests — conservation and bounds over 300 random periods, monotone sensitivity of relative water supply to rainfall, −20 % scenario below historical; `pnpm simulation:trace` 13/13; `pnpm global:cases` 24/24 in Iowa, Mymensingh (Bangladesh) and Wagga Wagga (Australia), each re-run identical (`docs/global-acceptance-cases.md`).
- Providers: `pnpm verify:sources` — POWER, MODIS, SSURGO live_verified; SoilGrids unavailable; CMR data-access probes now answer HTTP 400 (collections not used by the app).
- Security: secret-pattern scan of tracked files (none), env files ignored, fixtures only in tests, error redaction fixed, cache never served, `test:db` 17/17, `db:verify` pass.

## Defects found and fixed in Phase 7

- Provider error pages (HTML/XML from USDA SDA) were shown to farmers in evidence job messages. Messages are now cleaned (`userSafeMessage`, tested) and the SDA client no longer copies error pages.
- Replay playback fell to ≈ 10 FPS under mobile CPU throttling and software scrubbing took 3.5 s: field outlines rebuilt their line geometry on every day step and crop data was recreated. Outlines are memoised, each field copy is a memoised component, and the tables follow a deferred day (30 FPS and 25 ms after the fix).
- On portrait phones the 3D camera started too close (the field filled the frame, its shape invisible). The home distance now adapts to the canvas aspect, keeping the direction; reset uses the fitted distance.
- The replay opened on a bare day for the existing practice; it now opens a few weeks after its first planting.
- The Phase 5 E2E expected result sections on the first screen; it now opens the Full details tab (behaviour change from Phase 6, not a defect).

## Verified in Phase 6

- Deterministic: `pnpm check` passes (lint, typecheck, 187 tests in 13 files). New tests: the timeline (window, placement, bare days carry no crop state, depletion bounds, missing-weather note), the trace equals the period balance it is drawn from, `scoreOptions()` reproduces the stored ranking and scores from the published table, result views (stage lookup, markers, monthly sums, differences, reasons), AI grounding (minimal context, closed sources, number check including Bangla digits, action validation) and deterministic formatting. Engine benchmark: 3-year rotation ≈ 130 ms; bounded 4-year, 8 crops ≈ 0.9 s, result ≈ 182 KB with the timeline.
- Live database: `db:rehearse` and `db:migrate` applied `20261102100000_saved_plans.sql`; `pnpm db:verify` passes (25 tables, RLS everywhere, owner-scoped policies, generated types current); `pnpm test:db` 17/17, including saved plans (no plan before a result, hash and option must match the stored result, other user cannot read, attach, rename or delete, only name and note change, run deletion cascades).
- Live trace `pnpm simulation:trace` 13/13 with engine 1.1.0 (identical re-run hash; −20 % rainfall 0.89 → 0.813).
- Acceptance on the production build (`e2e6`, 58/58), with a **new user and a field drawn in the UI**:
  - located by coordinates, drew and confirmed the boundary, recorded two dated seasons and priorities in the forms, fetched real POWER and SSURGO from the Evidence page through the worker;
  - created and saved the scenario (Iowa calendar, turnaround, −20 % rainfall), ran it, replayed it (canvas, side by side, keyboard scrubbing, marker navigation, play, layout switch, monthly table), compared, previewed priorities with undo, saved priorities and re-ran (result then marked out of date), read "Why", the deterministic explanation, saved a plan and exported the run;
  - expired session: the action answered "Your session has ended" with a sign-in link back to the run;
  - **new session**: the plan is listed and the export carries the identical result hash; the page reopens;
  - Bangla run page and Why view; 390 px: one option at a time, no horizontal overflow on Replay, Compare, Why and Save, Enter on Play starts playback;
  - AI unavailable (server without a key: honest state, page complete) and AI provider failure (real call with an invalid key: "credentials were rejected"), deterministic text kept in both;
  - incomplete data (field without evidence): Replay says why there is no timeline; gaps list missing weather and soil;
  - second user: empty runs and plans, A's run is not found, A's export returns 404; no console errors.
- No real AI draft was produced: `ANTHROPIC_API_KEY` is empty in `.env.local`, so the success path is verified only up to the request (grounding is unit-tested).
- Screenshots inspected at 1440 and 390 px in English and Bangla. Throwaway users deleted.

## Defects found and fixed in Phase 6

- Bangla pages hydrated with an error: Node and Chrome format Bangla dates and numbers differently through Intl. Formatting is now written out (month names, Bangla digits) and identical on server and browser.
- The replay layout read the screen width during server rendering (`noSsr`), a second hydration mismatch.
- A server action from an expired session was redirected to the sign-in page by the proxy and failed; actions now answer "sign in again" in place with a return link.
- Bare days showed "—" (insufficient evidence) in every column; they now say "Bare field: no crop on this day".
- `<p>` contained a `<div>` chip in the workspace Inspect panel (hydration warning).
- The mobile "inputs changed" alert squeezed its button into a narrow column; the button now sits under the text.

## Verified in Phase 5

- Deterministic (no network): `pnpm test` passes 174 tests in 11 files. The 36 engine tests cover:
  - FAO-56 Example 8 (Ra 32.2 MJ m⁻² d⁻¹) and Eq. 52; polar night; calendar arithmetic and cross-year spans;
  - the Kc curve and root growth;
  - water conservation and storage bounds with no rain, saturating rain and full irrigation; potential-only and missing-day cases;
  - transformation double-application and range guards; missing days kept missing;
  - catalogue schema and alias uniqueness; Bangla and Banglish names; NASS parsing (Iowa corn, Kansas fall barley); stage scaling;
  - cross-year scheduling, window shifts, turnaround, cyclic overlap, bare days and gaps;
  - full engine runs: baseline vs distinct alternatives, byte-identical reproducibility, exclusions and market access, no-window rejection, ranking changes with priorities, insufficient evidence without weather or soil, unknown baseline, replay vs scenario, multi-crop years from farmer windows, canola return interval, water allocation, fallow years, stability, wrong engine version, no location;
  - benchmarks: a 3-year rotation with 6 crops in 36–41 ms; a bounded 4-year search with 8 crops in about 0.9 s.
- Live database:
  - `pnpm db:rehearse` then `pnpm db:migrate` applied `20261101100000_simulation_engine.sql`. `pnpm db:import-reference` published crop-parameters v1, usda-nass-usual-dates-2010 v1 and agronomic-references v2.
  - `pnpm db:verify`: 14/14 (8 migrations; 24 tables; 64 owner policies).
  - `pnpm test:db`: 16/16, including request_simulation (pre-engine version refused, dedup, snapshot reuse, other user refused) and daily series (worker-only insert, owner-only read, immutable).
- Live trace `pnpm simulation:trace` 13/13 → `data/verification/simulation-trace.json`:
  - real POWER and SSURGO through the worker; the raw POWER values for 2015-07-15 equal the stored daily series;
  - a run of about 5–16 s wall time (mostly loading over the network): Maize → Soybean compared with three feasible alternatives; SSURGO AWC 176 mm/m; baseline relative water supply 0.89, falling to 0.81 under −20% rainfall;
  - crop-parameters and NASS datasets pinned; ranking contributions, ablation and sensitivity present;
  - a re-run of the same snapshot gave the identical result hash and input digest;
  - "dragon fruit" rejected as an unknown crop and lentil as having no window.
- UI end-to-end on the production build: 22/22.
  - Create a scenario; row-level planting-window error; calendar region list; save v2 settings.
  - The run is queued at once; the worker computes it; the page updates by polling. The result page shows the ranking, explanation, indicators, sensitivity, rejections, inputs, gaps, assumptions and provenance, and says scores are "not probabilities".
  - Re-run shows "identical result"; saved runs list; workspace chip; no overflow at 1024 and 390 px; no console errors.
- Regressions: Phase 3 workspace flow 30/30 and states 16/16; Phase 4 evidence UI 19/19 (now expecting processing version 1.1.0).
- Screenshots inspected at 1440, 1024 and 390 px. Throwaway users deleted (no test addresses remain).

## Defects found and fixed in Phase 5

- The beam search kept partial sequences that already overlapped, so long rotations found no feasible option. It now drops them during the search.
- Continuous single-crop sequences and whole fallow years were offered as alternatives. A multi-year alternative now needs two crops, and a fallow year needs "fallow" as a candidate (hard constraint `fallow_year`).
- Frost days during winter-wheat dormancy counted against it. Frost and hot days are now reported but not scored (no sourced crop thresholds).
- The database driver turned NULL elements of float arrays into NaN and returned `numeric` values as strings. The runner now reads arrays as JSON and casts numerics.
- `/runs` imported a constant from a client module, which is undefined on the server. It now lives in a shared module.
- A shell edit stripped backslashes from the planting-window error regex, so row errors were not highlighted. Fixed and covered by the UI test.
- Stored results lose JSON key order, so indicator rows appeared shuffled. The table now uses a fixed order. Cycle labels now start with a planted year.

## Verified in Phase 4

- Deterministic (no network): `pnpm test` passes 138 tests in 10 files. New tests:
  - monthly aggregation completeness and no up-scaling of partial sums;
  - threshold counts and year gating;
  - dry spells broken by missing days;
  - 1991–2020 normals and anomalies; hemisphere-neutral seasons;
  - Theil–Sen; NDVI peaks and trend gates;
  - POWER cell snapping; MODIS sinusoidal round-trip and sheared pixel footprints;
  - host allowlist and bounded retries;
  - a full POWER pipeline run on synthetic responses: aggregates, indicators, cache reuse, outage;
  - the evidence view and stale state;
  - contrast of the new chips and chart colours.
- Live database:
  - `pnpm db:rehearse` then `pnpm db:migrate` applied `20261031130000_evidence_pipeline.sql` and `20261031140000_evidence_pin_cascade.sql`.
  - `pnpm db:verify`: 14/14 (7 migrations; 23 tables; 63 owner policies).
  - `pnpm test:db`: 15/15, including job guard and dedup, snapshot pin and refresh immutability, pinned-row protection and release, and account deletion cascading with pinned evidence.
- Live providers: `pnpm evidence:trace` 10/10 → `data/verification/evidence-trace.json`.
  - One real NASA POWER chunk: its SHA-256 is in the stored response hash.
  - Raw 2025 frost days (127 of 365 days) equal the stored annual aggregate. Raw January 2025 mean T2M_MIN (−12.404 °C) equals the stored monthly aggregate.
  - The displayed "Frost days per year: 142 days/year (2016–2025)" equals the mean of the stored values.
  - The value is pinned in a saved snapshot. A refresh left the snapshot unchanged (the worker reused the unchanged retrieval).
  - A simulated POWER outage with an empty cache produced `unavailable`, retry scheduled, earlier data kept.
- UI end-to-end on the production build: 19/19.
  - Empty state; "Refresh all" returns at once with queued state; the worker completes; the page updates by polling.
  - The displayed frost metric equals the database values. Evidence classes are labelled.
  - The inspector shows source, units, period, coverage, completeness and limits; the technical section shows the stored response hash and processing version.
  - Footprint map; chart table views.
  - Workspace drawer status and metrics; workspace map footprint toggle.
  - Outage: retry scheduled, earlier data kept, cancel works.
  - The sample shows no invented evidence. No overflow at 390 px. No console errors.
- Phase 3 regressions rerun: 30/30 workspace flow and 16/16 state checks.
- Screenshots inspected at 1440, 1024 and 390 px. Throwaway users deleted; only the owner's 2 accounts remain.

## Defects found and fixed in Phase 4

- Deleting an account or field failed when a snapshot pinned evidence: the NO ACTION foreign key was checked mid-cascade. Fixed with a cascading pin plus a trigger that blocks deleting pinned evidence while its field exists. The DB test cleanup now asserts that deletion succeeds; earlier it ignored errors, which hid this. Leftover test users were removed.
- The worker labelled provider outages as "internal" because `instanceof` failed across module copies. The kind is now read by name.
- ORNL returned 502 under two parallel requests. The per-host limit for ORNL is now 1, with 5 attempts.
- MODIS pixel coverage was wrong far from the central meridian, where sinusoidal pixels are sheared parallelograms in lon/lat. Coverage is now sampled inside each pixel's own corners.
- Charts overflowed their grid column at desktop width, and a reference-line label was clipped. Columns use `minmax(0, 1fr)`; labels sit at the left with a halo.
- The workspace drawer showed four POWER metrics. It now shows one per kind of evidence.

## Verified in Phase 3

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (109 unit tests in 8 files), `pnpm build` pass.
  - New tests: local frame round-trip, metres vs degrees, antimeridian continuity; boundary holes, overlaps, extent, latitude and antimeridian rejection; coordinate parsing; crop forms (English, Bangla, Banglish); crop resolution and timeline; save-payload validation; sample zones inside the sample field; source coverage vs field size; WCAG contrast of every pairing.
- `pnpm db:rehearse` then `pnpm db:migrate` applied `20261031100000_field_workspace.sql`. `pnpm db:types` regenerated types. `pnpm db:verify`: 14/14 (5 migrations recorded, anon cannot execute the new RPC, no SECURITY DEFINER).
- `pnpm test:db`: 13/13. The new test covers one atomic save (boundary + new zone + crops referencing it); re-assigning updates instead of duplicating; a boundary that leaves a zone outside rolls back the whole batch; the same boundary with the zone deleted succeeds; another user cannot save to the field, reference its zone, or delete it.
- End-to-end on the production build (puppeteer, headless Chrome with SwiftShader), 30/30, run twice:
  - sign-in redirect and return;
  - geolocation denial message;
  - real Nominatim search;
  - coordinates;
  - map attribution;
  - drawing four corners on the map, finishing, dragging a vertex;
  - confirmation and save of a new field and farm;
  - 3D canvas with the illustrative label and honest run state;
  - drawing a zone, naming it, assigning two crops, timeline cells;
  - unsaved count;
  - confirmation summary;
  - save, then reload with zone and crops persisted;
  - records page;
  - 390 px mobile with no horizontal overflow, bottom sheet and evidence;
  - Bangla labels with `lang="bn"`;
  - throwaway user deleted;
  - no console errors and no unexpected dialogs.
- State checks, 16/16:
  - clicking a zone in the 3D scene selects it;
  - keyboard zone selection;
  - growth stages;
  - sample save → reload → reset;
  - keyboard-only zone drawing;
  - NASA imagery date search;
  - forced WebGL context loss → restart;
  - reduced motion stops the hero turning;
  - with WebGL disabled, the sample and landing show fallbacks and keep their tables.
- Screenshots inspected at 1440, 1024 and 390 px for the landing, sample, sign-in, methodology, settings, workspace hub, sources, new-field flow, saved workspace and Bangla workspace pages. No horizontal overflow and no console errors.
- Only the owner's 2 accounts remain in the dev project.

## Defects found and fixed in Phase 3

- Hydration mismatch (#418) on the sample at desktop width: the layout branch used a client-only media query. A placeholder now renders until the width is known.
- After a successful save, leaving within ~2 s raised a false "unsaved changes" prompt and the Save button still showed the old count. The post-save state now clears both immediately.
- The drei `<Html>` zone label threw `removeChild` when the workspace remounted after save. Replaced with an HTML overlay chip.
- A stray-looking 3D north-arrow mesh was removed; the HTML compass is the north indicator.
- The quality selector's floating label clipped over the scene. Replaced with a compact select.
- The field outline had low contrast on the street map. Added a white halo.
- The default NASA imagery date usually had no tile. Streets is now the default; choosing NASA imagery searches back for the nearest date with a tile.
- The stage toggle and timeline header were clipped at 1024 px; they now wrap. Rail labels raised to 12 px.
- A caption string was corrupted by a shell edit and has been rewritten.

## Known limitations

- Simulation (see `docs/scientific-methodology.md` §12):
  - Hargreaves ET0 is uncalibrated, and Kc has no climate adjustment.
  - There is no runoff and no soil-water carry-over between plantings.
  - Paddy rice water use is potential only. The analysis covers the whole field only.
  - Calendars exist only for US states (NASS 2010); elsewhere they come only from the farmer's own dates.
  - Crops without FAO-56 stage lengths (rapeseed, chickpea) or without FAO-56 rows (mustard, jute, rye, cover crops) get partial indicators.
- Evidence fetched before processing version 1.1.0 has no daily series; refresh it before running.
- Replay and comparison (Phase 6):
  - The timeline shows the most recent complete rotation-length window only (not every replay year); the indicators still use all years.
  - Plant heights and the soil shade are illustrative renderings of stored values, not observations; zones share the whole-field values.
  - The priority preview re-orders only the options shown; new alternatives and sensitivity cases need "Save these priorities and run again".
  - Runs from engine 1.0.0 have no timeline or indicator definitions; their pages say so and can be re-run.
  - AI drafts need `ANTHROPIC_API_KEY` on the server; none is configured in this environment. The rate limit and cache are per server instance.
  - Engine notes (gaps, assumptions, rejection details, review questions) are English in the Bangla interface.
  - No seeded example access was added (optional in the brief).

- The first MODIS retrieval for a new location takes about 18 minutes (124 sequential ORNL requests at ≈ 9 s); repeats are cached. The worker must be running (`pnpm evidence:worker`); the UI warns when queued jobs are not picked up.
- SSURGO's service has a nightly maintenance window (seen as a non-JSON page); jobs report it as unavailable and retry.
- Per-pixel (within-field) greenness is stored only when at least 2 and at most 81 pixels lie ≥ 75% inside the field. The sample-sized field (≈ 20 ha) has one such pixel, so it shows a shared value.
- Evidence is not shown for the public sample (no invented values).
- The raw-response disk cache lives on the worker's machine and is not shared between machines.

- HLS imagery is 30 m, is date-specific and may be cloudy. It is a drawing aid, not evidence. Small fields are better drawn on the street map or imported as GeoJSON.
- Public OSM tiles and Nominatim are best-effort services, suitable for development only. Production needs a commercial or self-hosted provider (URLs are configurable; `GEOCODER_DISABLED=1` switches search off).
- Fields crossing the 180° meridian are not supported (explained to the user).
- Crop forms are chosen from the crop name; unknown names use a generic form. Plants are drawn larger than life at an illustrative density.
- Growth stages are illustrative controls, not observations.
- Bangla covers the interface chrome only.
- A zone shape edit that leaves the zone partly outside the field is caught by the client pre-check (~1 m) and finally by the database.
- Not-found for another user's record is still served with HTTP 200 (streamed page, no data).
- Live provider verification still covers one location (Iowa, USA).
