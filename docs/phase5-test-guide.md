# Astrapon – Phase 5 Test Guide (Rotation comparison)

> **Phase 8 label changes (2026-11-05).** This guide was written for Phase 7. New names: Workspace → **My fields**; Saved runs → **Results**; Methodology → **How it works**; "All records" → the field page (**Next steps** button in the 3D view); Crop history → **What you grew**; Soil observations → **Your soil**; Water and equipment → **Water and machines**; Your priorities → **What matters most to you**; Scenarios / Create scenario → **Compare crop options / Create comparison**; Save scenario → **Save settings**; Run simulation → **Run comparison**; Replay tab → **Watch the seasons**; Compare tab → **Compare and rank**; Plain-language explanation → **Explanation**; Full details → **Technical details**. Boundary GeoJSON and zones are in the collapsed **Field shape and parts of the field** card; delete buttons are in collapsed danger cards. For the current farmer path see `docs/farmer-goal-test-banglish.md`.

This guide tests only what Phase 5 added: the simulation and rotation engine, the scenario settings, the run panel, the result page and the saved runs page. Earlier features are in `docs/ui-test-guide-simple.md` and `docs/manual-test-guide.md`.

**Bug report:** page, what you did, what you expected, what happened, screenshot.

---

## 0. Setup (owner, once)

1. Open two terminals in the project folder:
   - Terminal 1: `pnpm dev` (the app at http://localhost:3000)
   - Terminal 2: `pnpm evidence:worker` (computes evidence jobs **and** simulation runs). Keep it running for the whole test.
2. Sign in with a test account.
3. Have a **US field** with a drawn boundary (for example near Ames, Iowa) and a **Bangladesh field** (for example Mymensingh).
4. On the US field's **Evidence** page, press **Refresh all** and wait until every source is **Up to date**.
   - Evidence fetched before Phase 5 has no daily weather series. It must be refreshed once, or the run reports missing weather.

## 1. Prepare records (field records page `/fields/[id]/records`, "All records" in the workspace)

| # | Steps | Expected |
|---|---|---|
| 1.1 | **Crop history**: add whole-field seasons with dates: Corn 2023, planted 2023-05-01, harvested 2023-10-15; Soybeans 2024, planted 2024-05-12, harvested 2024-10-02. | Both rows appear in the list. |
| 1.2 | **Scenarios**: create a scenario `P5 test` with candidate crops `maize, soybean`. | It appears in the list. Click it to open `/scenarios/[id]`. |

## 2. Scenario settings (`/scenarios/[id]`, section "Scenario settings")

| # | Steps | Expected |
|---|---|---|
| 2.1 | Open the page. | Header shows "Settings v2". Sections: "Run the rotation comparison", "Scenario settings", "Input snapshots", "Delete scenario". |
| 2.2 | Set **Candidate crops** `maize, soybean, oats, winter wheat`, **Rotation length** `2`, **Planting calendar (US only)** "USDA NASS 2010: Iowa", **Days between harvest and next planting** `7`. Press Save. | "Scenario saved". Values stay after reload. The calendar list contains US states. |
| 2.3 | **Rotation length** `5`, Save. | Error "At most 4 years". Nothing saved. |
| 2.4 | **Rotation length** `0`, Save. | Error. Nothing saved. |
| 2.5 | **Rainfall change (%)** `-80`, Save. | Error (allowed range −50 to +50). Set it back to `0`. |
| 2.6 | **Temperature change (°C)** `9`, Save. | Error (allowed range −5 to +5). Set it back to `0`. |
| 2.7 | Planting window row 1: Crop `lentil`, Plant from `13-40`, Plant to `11-20`, Days to harvest `110`. Save. | Only that row's "Plant from" turns red with "Use MM-DD". Nothing saved. |
| 2.8 | Same row, Days to harvest `5`. Save. | That field turns red (allowed 20–330). Clear the whole row and save. |
| 2.9 | On a scenario of a field **without** a boundary. | "Run simulation" is disabled with "Draw the field boundary first…". |
| 2.10 | On a new scenario whose settings were never saved. | "Run simulation" is disabled with "Save the scenario settings below first." |

## 3. Running a simulation (section "Run the rotation comparison")

| # | Steps | Expected |
|---|---|---|
| 3.1 | Press **Run simulation**. | A run row appears as **Queued**, then **Running**, then **Finished**, without reloading. A progress bar shows while it is active. The row shows time, "engine 1.0.0", compute time in ms and a short result hash. |
| 3.2 | Look at **Input snapshots**. | A new snapshot with time, hash and engine 1.0.0, plus "The newest snapshot matches the current inputs." "Show frozen inputs" expands the frozen data. |
| 3.3 | Press **Run simulation** again without changing anything. | No new snapshot is created (the existing one is reused). |
| 3.4 | Press Run simulation twice very fast. | Only one active run. The button is disabled while a run is queued or running. |
| 3.5 | Stop the worker (Ctrl+C in Terminal 2) and press Run simulation. | Stays **Queued**. After about one minute a warning says the worker may not be running. Press **Cancel**: status becomes **Cancelled**. Restart the worker. |
| 3.6 | On a finished run press **Re-run and compare**. | A new run finishes, and the chip **"Re-run gave an identical result"** appears. "Re-runs differ" must **never** appear. |

## 4. Result page (`/runs/[id]`, via **Open result**)

| # | Check | Expected |
|---|---|---|
| 4.1 | Top notice. | "Replay of past weather YYYY–YYYY. This is not a forecast…" No yield, profit or income numbers anywhere on the page. |
| 4.2 | "Historical replay" section. | Cards in rank order: **Existing practice** (maize → soybean from your history) and **Alternative 1, 2…** (up to 3). Each shows its crops by year, planting dates with their source (your records / your window / NASS calendar) and a **relative score**. |
| 4.3 | Every alternative. | Has at least two different crops, uses a different crop set from the existing practice, and has no "Conflicts with a current constraint" chip. |
| 4.4 | Ranking chip. | "Ranking stable across sensitivity cases" or "Ranking fragile". |
| 4.5 | **Why this order** table. | Shows how each priority (Water use, Soil cover and rotation structure, Diversification, Weather risk, Workload, Market fit) contributed, and which priority would change the order. |
| 4.6 | **Indicators** table. | Every value has a unit. "—" means insufficient evidence and is not a zero. Frost and hot days are shown but explained as not scored. |
| 4.7 | **Sensitivity cases** table. | Rows such as dry start, low/high crop coefficient, driest/wettest third of years, with the top option under each. |
| 4.8 | **What was considered and rejected**. | Number of combinations checked and the rejection reasons with counts (for example "Plantings overlap", "Planting window missed"). |
| 4.9 | **Inputs used**. | SSURGO soil water capacity (mm/m), the POWER weather years, and your planting calendar choice. |
| 4.10 | **Questions to review locally**, **Assumptions**, **Sources and reproducibility**. | All present. Sources list FAO-56, USDA PLANTS, USDA NASS 2010, NASA POWER, SSURGO. Reproducibility shows engine version, input digest and result hash. |
| 4.11 | 390 px width (F12 → phone icon). | Tables scroll inside their own box; the page never scrolls sideways. |

## 5. Rule tests (change settings on the scenario page, then run and open the result)

| # | Change | Expected in the result |
|---|---|---|
| 5.1 | **Rainfall change** `-20`. | A second section **"Scenario: rainfall -20%"** after "Historical replay". The historical replay numbers are unchanged. Water supply indicators are lower in the scenario. |
| 5.2 | **Temperature change** `2` (rainfall back to 0). | Section "Scenario: temperature +2 °C". |
| 5.3 | Add `dragon fruit` to candidates. | Rejected as **"Not in the crop catalogue"**. Never appears in an alternative. |
| 5.4 | Add `lentil` to candidates (no planting window for it). | Rejected as **"No local planting window"**, with a question asking for its planting dates. |
| 5.5 | Add a planting window for lentil (for example 09-01 to 09-30, 110 days). | Lentil is no longer rejected for "No local planting window". |
| 5.6 | Records page → **Your priorities** → "Crops you will not grow": `oats`. Save, then run. | Oats rejected as **"You excluded it"**; it is in no alternative. |
| 5.7 | Records page → **Water and equipment** → "Seasonal allocation (mm)": `50`. Save. On the scenario choose an irrigated **Irrigation assumption**, then run. | Options that need more water are rejected as **"Exceeds your water allocation"**. |
| 5.8 | Candidates include `canola` (catalogue name "Rapeseed / canola"), rotation length `3`. | No option grows canola twice in 3 years (rule "Return interval (canola)"). |
| 5.9 | Change priority weights (for example Water use high, others low). Run. | The order or scores may change; "Why this order" reflects the new weights. |
| 5.10 | Delete the crop history. Run. | Message that existing practice is unknown and asks for history. No existing practice is invented; only alternatives are shown. |

## 6. Bangladesh field

1. Create a scenario on the Bangladesh field. Leave **Planting calendar** empty (US only).
2. Add planting windows: `jute` 03-20 to 04-10, 110 days; `lentil` 11-01 to 11-20, 110 days. Candidate crops `jute, lentil, rice`. Add dated rice history (for example Boro rice, planted 01-15, harvested 05-10).
3. Run and open the result.
   - **Expected:** years with more than one crop are possible. Rice water use is labelled as potential only. The missing SSURGO soil (US only) is listed under gaps; no fake soil number. Crops without your dates are rejected with "No local planting window". No Bangladesh season is applied to the US field, and no US calendar to this field.

## 7. Saved runs (`/runs`)

| # | Steps | Expected |
|---|---|---|
| 7.1 | Open **Saved runs** from the menu. | Runs newest first with status, scenario, field, time and engine; "Open result" for finished runs. Section "Scenarios and input snapshots" below. |
| 7.2 | New account with no runs. | "No runs yet. Open a scenario and choose “Run simulation”." |

## 8. Privacy

1. As Account A, copy a `/runs/<id>` and a `/scenarios/<id>` address.
2. Sign in as Account B and open them.
   - **Expected:** Not found. None of Account A's data appears. Account B's `/runs` is empty.
3. Open `/runs/abc` (not a valid id). **Expected:** Not found.

## 9. Delete

1. On the scenario page, **Delete scenario** without ticking the box. **Expected:** nothing deleted.
2. Tick "Yes, delete this scenario and its snapshots" and delete. **Expected:** the scenario, its snapshots, runs and results are gone; `/runs` no longer lists them.

## 10. Owner command-line checks (optional, technical)

| Command | Expected |
|---|---|
| `pnpm check` | Lint, typecheck and all unit tests pass (174 at the time of writing). |
| `pnpm build` | Build succeeds. |
| `pnpm db:verify` | All checks pass. |
| `pnpm test:db` | All isolation tests pass (it creates and deletes throwaway users). |
| `pnpm simulation:trace` | 13/13 checks pass; writes `data/verification/simulation-trace.json`. Includes "re-run hash identical" and the rainfall −20% comparison. |

---

## Not bugs (expected in Phase 5)

- Results compare options on past weather only. No yield, profit or forecast, by design.
- Scores are relative among the options shown. They are not probabilities or percentages of success.
- A run stays "Queued" while the worker is stopped.
- Outside the USA there is no built-in planting calendar; enter your own windows or dated history.
- Frost and hot days are shown but not used in the score.
- The engine works on the whole field, not per zone. The 3D view does not yet change with run results.
- Runoff and soil water carried from one crop to the next are not modelled (documented in Methodology).
- A slow first run can happen when the Supabase connection is slow; try again.
