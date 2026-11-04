# Astrapon – Full Test Guide (Phases 0–7)

One guide for everything built so far, page by page. Each section says **which page**, **what to do**, **what you should see**, and **which prompt built it** (P0–P7).

If something differs, note: page, what you did, what you expected, what happened, screenshot.

---

## 0. Before you start

**Which version are you testing?**


**You need:**  two email addresses (Account A and Account B), about 1.5 hours.

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16.

---

## 1. Setup page `/setup` (P0, P2, P4, P6)

1. Open `/setup`.
   - **See:** a list of services with **Configured / Not configured / Invalid**: Supabase, the worker trigger (GitHub dispatch), NASA Earthdata, AI (Anthropic).
   - **See:** no secret values anywhere, only states.
   - AI shows **Not configured** until `ANTHROPIC_API_KEY` is set. That is expected.
2. Open `/api/health`.
   - **See:** a small JSON with `phase: 7` (after the push).

## 2. Home page `/` (P0, P3)

1. **See:** title, a slowly turning 3D field, **Explore a sample** and **Create my field**.
2. Search `Mymensingh`, press **Search**. **See:** a list of places. Nothing appears while typing (search runs only on the button).
3. Search `zzqqxx`. **See:** "No places found".
4. **Coordinates** tab: `23.81, 90.41` → **Go**. **See:** the map at that place.
5. **Use my location** → choose **Block**. **See:** a "permission denied" message, no crash.
6. Footer: **"Development build · Phase 7 release candidate"** (P7).

## 3. Information pages `/methodology`, `/sources` (P1, P4, P5, P6)

1. `/sources`: every data source with evidence type, spatial support, what it supports, what it cannot establish, decision and status. SoilGrids shows unavailable; GRACE not applicable.
2. `/methodology`: sections Evidence classes, Field geometry, 3D view, Maps, Environmental evidence, Simulation, Replay and explanations, Not built yet.
   - **See:** it says results are a replay of past weather, not a forecast, and give no yield or profit.

## 4. Sample field `/sample` — no account (P3)

1. **See:** a 3D field labelled **"Sample field · invented data"**.
2. Drag to rotate, scroll to zoom. Buttons: rotate left/right, zoom in/out, **Reset view**.
   - P7: on a phone width the whole field fits on screen, and Reset view brings it back to that fitted view.
3. Click a zone. **See:** a green outline and its details.
4. Growth-stage buttons (Bare → Harvested). **See:** the plants change.
5. Add a crop to a zone (`maize`) → **Save** → **Confirm and save** → reload. **See:** kept (stored in this browser only).
6. **Reset sample**. **See:** back to the original.
7. Inspect → Evidence. **See:** "the sample has no evidence". No numbers.

## 5. Accounts `/sign-up`, `/sign-in`, `/forgot-password` (P2, P4)

1. Sign in → **Create an account**. Empty form → **See:** "required" errors. Password under 8 characters → **See:** error.
2. Create Account A. **See:** "Check your email…".
3. Sign in before confirming. **See:** "Confirm your email address first".
4. Click the email link. **See:** it opens **the live site, not localhost**, and you can sign in → **Your farms**.
5. Wrong password → **See:** "Email or password is incorrect."
6. Open `/farms` while signed out. **See:** redirect to sign-in; after sign-in you return to `/farms`.
7. Forgot password → enter email → **See:** success message and an email.

## 6. Account and Settings `/account`, `/settings` (P2, P6)

1. Account: change **Display name** and **Units** → **Save preferences** → reload. **See:** kept.
2. **Change password** → sign out → sign in with the new one. **See:** works.
3. Settings → Language **বাংলা**. **See:** menus, buttons, dates and digits in Bangla. Switch back to English.

## 7. Farms `/farms`, `/farms/[id]` (P2)

1. **See:** "No farms yet".
2. Farm name + country `BD` → **Create farm**. **See:** listed. Empty name → **See:** error.
3. Open the farm. Add a **Market preference** (`rice`, Preferred), then delete it. **See:** both work.
4. Create a second farm with country `US` for the US field.

## 8. Create a field `/fields/new` (P3)

1. Search `Ames, Iowa`, choose a result.
2. Click 4–6 corners → **Finish shape**. **See:** closed outline and area in hectares.
3. Drag a corner. **See:** shape and area change. **Undo** → **See:** undone.
4. Map → **NASA imagery**. **See:** satellite picture (some dates blank or cloudy, fine). Back to Streets.
5. Draw a crossing (bow-tie) shape. **See:** an error, cannot save.
6. Draw a normal shape → Field name, choose the US farm, tick **"This outline matches my field…"** → **Save field and open workspace**. **See:** your field in 3D.
7. Repeat for Bangladesh (`Mymensingh`, BD farm).

## 9. Field workspace `/fields/[id]` (P3, P7)

1. **See:** your field in 3D, **"Illustrative 3D · flat terrain · not satellite imagery"**, and the camera controls.
2. **Draw zone** inside the field → name + reason → **Use this shape**. **See:** new zone, Save shows "1 unsaved". Without a name → **See:** "Give the zone a name".
3. Assign a crop: Year, Season, `maize`. **See:** plants appear; the timeline table shows it.
4. Try closing the tab. **See:** "Leave site?" warning → Cancel.
5. **Save** → **Confirm and save** → reload. **See:** kept.
6. **Map** view. **See:** flat map with field and zone. **Data footprints** (after Test 11) shows the NASA grid cell and satellite pixels.
7. **Inspect** panel. **See:** history, **soil observations**, evidence coverage, link to Evidence, link **All records**. No console error about `<div>` in `<p>` (fixed after P5).
8. Phone width: the panel is at the bottom as **Field details** and opens/closes.

## 10. All records `/fields/[id]/records` (P2, P3, P5)

1. **Crop history**: add seasons **with planting and harvest dates**, for example Corn 2023 (05-01 → 10-15) and Soybeans 2024 (05-12 → 10-02). Harvest before planting → **See:** error.
2. **Soil observations** (this is where soil information is entered):
   - pH `6.5` with today's date → **Add observation** → **See:** listed. pH `20` → **See:** error.
   - Bangladesh field (do this in Test 13, step 2): Property **Available water capacity (cm/cm)**, Value `0.15` (= 150 mm per metre), Top `0`, Bottom `100`, Zone **whole field** (no zone), Kind **Lab / survey measurement**. Outside the USA this is the only soil water value the simulation can use. In the USA your own value is used before SSURGO.
   - A value above 0.7 cm/cm → **See:** an error.
3. **Water and equipment**: choose options, save, reload. **See:** kept.
4. **Your priorities**: change the numbers, save, reload. **See:** kept.
5. **Scenarios**: create `Test 1` with candidate crops `maize, soybean`. **See:** listed.

## 11. Evidence `/fields/[id]/evidence` (P4, P7)

1. US field → Evidence. **See:** every source "Not fetched yet", no numbers.
2. **Refresh all**. **See:** Queued → Running → Up to date, updating by itself. NASA POWER within a few minutes. MODIS greenness is **not** included (marked Optional); press **Fetch greenness** on its row to get it, about 2–3 minutes the first time.
3. When done, **see** cards: frost days, hot days, dry spells, rain and temperature compared with normal, root-zone soil wetness, greenness (NDVI), and **soil water capacity from SSURGO** (USA only).
   - Each card has a class: **Observed (satellite)**, **Model-derived**, **Survey / ground**.
4. **How is this measured?** on a card. **See:** source, unit, years, area, limits.
5. **Show as table** on a chart → same numbers → **Show chart**.
6. Map on this page. **See:** field, big square (POWER cell, "value describes the whole area"), small squares (MODIS pixels).
7. Bangladesh field → Refresh all. **See:** weather and satellite work; SSURGO **"Not available here"** (correct).
8. P7: if a source fails, the message is a short sentence, never an HTML/XML error page.

## 12. Scenario and run `/scenarios/[id]` (P5)

US field, with evidence from Test 11 and crop history from Test 10.

1. Open `Test 1`. **Scenario settings**: crops `maize, soybean, oats, winter wheat`; planting calendar **USDA NASS 2010: Iowa**; days between harvest and planting `7` → **Save scenario**. **See:** "Scenario saved".
2. Planting window **Plant from** `13-40` → **See:** "Use MM-DD". Clear it, save.
3. **Run simulation**. **See:** Queued → Finished (live site: may wait for the worker).
4. **Open result** (goes to the run page, Test 14).
5. Back here: **Re-run and compare**. **See:** "Re-run gave an identical result".
6. **Rainfall change (%)** `-20` → save → run. **See:** a "Scenario: rainfall -20%" section with lower water supply.
7. Add `dragon fruit` → run. **See:** listed under rejected as "Not in the crop catalogue", not an alternative.

## 13. Soil in the result — Bangladesh (P5, P6)

1. Bangladesh field, **without** the AWC soil observation: scenario with crops `rice, wheat` and your own planting windows (for example rice 06-15, 120 days; wheat 11-20, 110 days) → run.
   - **See:** soil water capacity **unknown**; the water indicator is potential demand only; a data gap says soil is missing.
2. Add the AWC `0.15` observation exactly as in Test 10.2 → run again.
   - **See:** in **Why this option?** and **Full details**: soil water capacity **150 mm per metre**, source **"Your soil test (date, 1 depth, lab or survey)"**. Water supply and irrigation need are now calculated.
   - A zone-only value, or Top = Bottom, is not used (soil stays unknown).
3. Without your own planting windows, crops outside the USA are rejected with "No local planting window" (correct).

## 14. Run page `/runs/[id]` (P5, P6, P7)

1. **Replay** tab.
   - **See:** existing practice + two alternatives side by side, "Illustrative 3D…", a date, ▲ planting / ▼ harvest marks.
   - P7: it opens on a day when the existing practice has a crop (not bare soil).
   - **Play / Pause**; speed; **Next planting / Next harvest**.
   - Click the slider, press → : one day forward; the **Selected date** table follows.
   - Bare day: "Bare field: no crop on this day". Rain days: falling drops (not with reduced motion). Soil colour follows dryness (legend).
   - **One at a time** → choose another option. **Monthly summary (table)** opens.
   - Reset view after rotating: the fields come back fully in frame.
2. **Compare** tab.
   - **See:** same years and soil value for every option, units on every number, "not probabilities".
   - Move **Workload** slider → order may change, labelled **Preview** → **Undo**.
   - **Save these priorities and run again**. **See:** "Priorities saved and a new run queued" and a yellow "inputs changed after this run" note with **Run again with current inputs**.
3. **Why this option?**: reasons, better/worse vs existing practice with units, planting dates and source, evidence used (POWER years, **soil value and source**, crop dataset), ruled out, gaps, questions for a local expert, **Words used here**.
4. **Plain-language explanation**: "Generated from the stored result (no AI)". Without a key: "AI drafting is not configured" (correct).
5. **Full details**: soil water capacity, evidence and soil retrieval ids, assumptions, hashes.
6. **Save and export**: Plan name → **Save plan** → "Plan saved". **Download run file (JSON)** → a file downloads.

## 15. Saved runs `/runs` (P5, P6)

1. **See:** your plans under **Saved plans**, runs newest first with status and Open result, scenarios and snapshots.
2. Sign out, sign in, open the saved plan. **See:** identical result.
3. Settings → বাংলা → reopen the run. **See:** tabs, buttons and dates in Bangla (technical notes stay English and say so).

## 16. Privacy, delete, phone (P2, P3, P7)

1. **Privacy:** as Account A copy the links of a farm, field, scenario and run. Sign out, create Account B, paste them. **See:** **Not found**, no names or shapes. Account B's Farms and Workspace are empty. Sign out + browser Back → no private data.
2. **Delete:** records page → **Delete field** without ticking → nothing happens. Tick → Delete → gone. Same for **Delete farm**.
3. **Phone (390 px, F12 → phone icon):** home, sample, workspace, records, evidence, scenario, run page. **See:** no sideways scrolling, readable text, tappable buttons, map shows "© OpenStreetMap contributors", run page shows one option at a time.
4. **Keyboard:** press Tab through a page. **See:** a clear focus outline on each control.

---

## Not bugs (expected)

- Results are relative comparisons on past weather. No yield, profit or forecast.
- 3D plants, heights and soil colour are drawings of stored numbers, not photos. Terrain is flat.
- On computers without a graphics card (software rendering) the 3D is slow (about 10–15 FPS) and starts in Low quality; tables and Map view work normally.
- AI explanation is "not configured" without `ANTHROPIC_API_KEY`.
- A job stays **Queued** until the worker runs; on the live site the GitHub worker can take a few minutes to start.
- First MODIS (optional greenness) fetch: about 2–3 minutes.
- SSURGO soil exists only in the USA; elsewhere enter your own soil test (Available water capacity) on All records. SoilGrids is unavailable.
- Canola (Australia) and some crops (jute, mustard, chickpea stages) have no FAO-56 stage data, so their water indicator is dropped.
- Record forms, evidence texts, methodology and engine notes stay English in Bangla mode.
- The "1991–2020 avg" label can overlap tall bars in small evidence charts.
