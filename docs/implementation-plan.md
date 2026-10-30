# Staged implementation plan

Phases 0 (bootstrap) and 1 (data research and live verification) are complete. Each later phase ends with the delivery contract in `docs/fieldshift-product-contract.md`: checks, UI inspection, doc updates, and a local commit.

## Phase 1: Scientific and data research decisions (DONE 2026-10-30)

Outcome: see `docs/research/`. Initial subset:
- POWER, MODIS MOD13Q1 (ORNL) and SSURGO: live-verified.
- IMERG Late, SMAP L3E and NASADEM: pending credentials.
- SoilGrids: service paused.

Open items carried forward:
- Re-check the challenge Resources tab after 13 Nov 2026.
- Confirm MOD13Q1 reliability labels in the V6.1 guide.
- Saxton & Rawls RMSE before any non-US water-capacity estimate.
- FAO-56 Kc ini values and crop base/frost temperatures from primary sources.

Original scope:

- Select and document data sources with citations, licences, native resolution, latency, global coverage, and access method. Record each source's evidence class. Candidates to evaluate (not yet chosen):
  - NASA POWER (daily agro-meteorology),
  - GPM IMERG (precipitation),
  - SMAP (soil moisture),
  - MODIS/VIIRS or HLS (vegetation/land surface),
  - global soil sources such as ISRIC SoilGrids,
  - crop parameter references (e.g. FAO-56 crop coefficients, base temperatures).
- Choose the simulation approach: water balance, thermal time, heat/frost exposure, and rotation feasibility rules. State assumptions and known limits.
- Define the regional coverage/quality reporting method (C7) and the conditions under which optional indicators are allowed (C8).
- Deliverables:
  - `docs/research/` decision records,
  - a source registry design,
  - provisional crop parameter tables with sources.
- Acceptance: every planned indicator maps to a source and evidence class, or is marked unsupported.

## Phase 2: Accounts, schema, farms and fields (done 2026-10-30)

- Done on the owner-confirmed dev project:
  - email/password Auth with confirmation and reset links;
  - RLS and composite ownership keys on all user data;
  - migrations for profiles, farms, fields (PostGIS), zones, crop history, soil observations, water/equipment, priorities, market preferences, versioned reference data, evidence metadata/aggregates, scenarios, immutable input snapshots, runs and results;
  - generated types; idempotent reference import; live two-user tests.
- Changed from the original plan:
  - email/password replaced magic link/OTP, per the Phase 2 prompt (sign-up, sign-in, reset).
  - **Moved to Phase 5:** geocoder location search and drawing the boundary on a map. Phase 2 accepts WGS84 GeoJSON with the same validation (closure, self-intersection, area, PostGIS validity, zones inside the field) and a plan-view preview.

## Phase 3: Evidence adapters and provenance

Adjusted by Phase 1 findings:
- IMERG: use the Late run, because V07 Final is frozen at 2025-09-30 until V08. Read it via the Giovanni time-series API or h5wasm.
- SMAP: use AppEEARS point tasks.
- NASADEM: use the OpenTopography key server-side.
- SoilGrids: fall back to ISRIC WebDAV COG/WCS while REST is paused.
- POWER: cache by native grid cell.

- Server-only provider adapters in `src/server/providers`, with caching and rate limits. Each value carries full `Provenance`.
- Coverage reporting per field: which sources cover it, their resolution relative to field size, and any gaps.
- Ingestion jobs in Node/TypeScript scripts. Store snapshots so runs are reproducible.
- Acceptance: for real test locations on several continents, show which sources returned data, with resolution and coverage. Unavailable regions are reported honestly.

## Phase 4: Simulation engine (pure TypeScript)

- `src/domain/simulation`: deterministic, versioned engine.
  - Inputs: field, zones, history, evidence snapshot, hypothetical overrides, and priorities.
  - Outputs: per-season indicators with lineage.
- Rotation feasibility rules (crop sequence constraints, water limits, season length) and optional indicators only where Phase 1 allows.
- Property and regression tests, including reproducibility (same inputs and engine version give identical output).
- Acceptance: engine tests pass, and every output carries provenance with hypothetical dependence flagged.

## Phase 5: 3D simulator connected to real data

- Real field geometry and zones in the scene, plus a timeline to replay historical seasons, driven by engine outputs.
- Location search (geocoder) and drawing or confirming the field boundary on a map, carried over from Phase 2.
- Hypothetical weather/water controls in HTML/MUI, with visual state clearly labelled as hypothetical.
- Accessible equivalents: a data table and text summary for everything the scene shows.
- Acceptance: replay of a real field across seasons, with what-if changes visibly and textually distinguished from history.

## Phase 6: Rotation comparison, priorities, explanations, saved runs

- Compare the existing rotation against feasible alternatives (target: two) on common inputs. Show:
  - reasons, evidence, benefits, tradeoffs, and gaps,
  - local-review risks,
  - why an option was excluded.
- Priority weighting affects ranking transparently.
- Optional AI-assisted plain-language drafting. It may only restate computed results with citations, never add claims.
- Saved runs pin inputs, data snapshots, and the engine version. Reopening reproduces the result.
- Acceptance: a saved run reopens identically, and a changed priority changes the comparison with a visible explanation.

## Phase 7: Hardening and acceptance

- Accessibility audit (keyboard, screen reader, contrast, reduced motion), performance budgets including low-end and software-rendered devices, and end-to-end tests of the core workflow.
- Security review (RLS, secrets, input validation), error and empty states, and full documentation.
- Final challenge alignment review with evidence for C1–C8.
