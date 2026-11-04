# Astrapon – Simple UI Test Guide

**What to do:** follow each step, then check that you see what the guide says. If you see something different, write it down as a bug.

**How to write a bug:**

- page name;
- what you did;
- what you expected;
- what happened;
- a screenshot.

**Before you start:**

- Open the app link.
- Use Google Chrome.
- Have **2 email addresses** you can open. You will create 2 test accounts: **Account A** and **Account B**.
- Rotation results compare options on past weather. They are not yields or forecasts; that is expected.

---

## Test 1 – Home page

1. Open the home page.
   - **You should see:** a big title, a slowly turning 3D field, and the buttons **"Explore a sample"** and **"Create my field"**.
2. In the search box, type `Mymensingh` and press **Search**.
   - **You should see:** a list of places.
   - Suggestions should **not** appear while you type. Search runs only when you press Search.
3. Search `zzqqxx`.
   - **You should see:** "No places found…".
4. Open the **Coordinates** tab, type `23.81, 90.41` and press **Go**.
   - **You should see:** a map at that place.
5. Press **"Use my location"** and choose **Block** in the browser popup.
   - **You should see:** a message that location permission was denied.

---

## Test 2 – Sample field (no account needed)

1. On the home page, press **"Explore a sample"**.
   - **You should see:** a 3D field with the label **"Sample field · invented data"**.
2. Drag with the mouse to turn the field. Use the scroll wheel to zoom.
3. Try the camera buttons: **Rotate left/right, Zoom in/out, Reset view**.
4. Click a coloured zone in the field.
   - **You should see:** the zone gets a green outline and its details appear.
5. Press the growth-stage buttons (**Bare → Harvested**).
   - **You should see:** the plants change.
6. Add a crop to a zone (for example `maize`), press **Save**, then **Confirm and save**.
7. Reload the page.
   - **You should see:** your change is still there.
8. Press **"Reset sample"**.
   - **You should see:** the field goes back to the original.
9. Open **Inspect**, then **Evidence**.
   - **You should see:** a note that the sample has no evidence. No numbers.

---

## Test 3 – Create an account

1. Press **Sign in**, then **"Create an account"**.
2. Press **Create account** with the form empty.
   - **You should see:** red "required" messages.
3. Type a password with fewer than 8 characters.
   - **You should see:** an error message.
4. Fill in the form correctly (Account A) and press **Create account**.
   - **You should see:** "Check your email for a confirmation link…".
5. Try to sign in before you confirm the email.
   - **You should see:** "Confirm your email address first…".
6. Open your email, click the link, then sign in.
   - **You should see:** the **Your farms** page.
7. Sign out and sign in with a **wrong password**.
   - **You should see:** "Email or password is incorrect."
8. Sign in correctly again.

---

## Test 4 – Account and Settings

1. Open **Account**. Change your **Display name** and **Units**, press **Save preferences**, then reload.
   - **You should see:** the changes are kept.
2. Open **Settings** and change **Language** to **বাংলা**.
   - **You should see:** the menus and buttons change to Bangla.
3. Change the language back to English.
4. On the Account page, open **Change password** and set a new password. Sign out, then sign in with the new password.
   - **You should see:** it works.
5. Sign out, then on the sign-in page press **"Forgot your password?"** and enter your email.
   - **You should see:** a success message, and an email arrives.

---

## Test 5 – Create a farm

1. Open **Farms**.
   - **You should see:** "No farms yet".
2. Type a **Farm name** and Country code `BD`, then press **Create farm**.
   - **You should see:** the farm appears in the list.
3. Press **Create farm** with an empty name.
   - **You should see:** an error.
4. Open the farm. Add a **Market preference** (crop `rice`, Preferred), then delete it.
   - **You should see:** both actions work.

---

## Test 6 – Create a field on the map

1. Open **Workspace** and press **"Create my field"**.
2. Search `Ames, Iowa` (a US location) and choose a result.
3. Click **4–6 points** on the map around a field, then press **"Finish shape"**.
   - **You should see:** a closed outline and its area in hectares.
4. Drag one corner.
   - **You should see:** the shape and the area change.
5. Press **Undo** once.
   - **You should see:** the last change is undone.
6. Change the map to **NASA imagery**.
   - **You should see:** a satellite picture. Some dates may be blank or cloudy; that is fine.
   - Switch back to **Streets**.
7. Try a bad shape: click points so the lines **cross each other** (a bow-tie).
   - **You should see:** an error. You cannot save it.
8. Draw a normal shape again. Go to **Confirm and save**:
   - type a **Field name**;
   - choose your farm;
   - tick **"This outline matches my field…"**;
   - press **"Save field and open workspace"**.
   - **You should see:** the 3D view of your field.
9. Repeat steps 1–8 for a field in **Bangladesh** (search `Mymensingh`).

---

## Test 7 – Field workspace (3D)

Use your US field.

1. Check the screen.
   - **You should see:**
     - your field in 3D;
     - the text **"Illustrative 3D · flat terrain · not satellite imagery"**;
     - **Simulation: run it from a scenario**.
2. Choose the **Draw zone** tool and click points **inside** the field. Type a **Zone name**, choose a reason, and press **"Use this shape"**.
   - **You should see:** a new zone, and the Save button shows **"1 unsaved"**.
3. Try to draw a zone **without a name**.
   - **You should see:** "Give the zone a name".
4. Assign a crop to the zone: choose a **Year**, a **Season** and type `maize`.
   - **You should see:** plants appear, and the timeline table shows the crop.
5. Try to close the browser tab.
   - **You should see:** a "Leave site?" warning. Press Cancel.
6. Press **Save**, check the summary, then press **Confirm and save**.
   - **You should see:** "All changes saved".
7. Reload the page.
   - **You should see:** the zone and the crop are still there.
8. Switch the view to **Map**.
   - **You should see:** a flat map with your field and zone.
9. Open **Inspect**.
   - **You should see:** history, soil and evidence information, and a link to the Evidence page.
10. Press **"All records"**.
    - **You should see:** the records page opens.

---

## Test 8 – Field records

On the "All records" page:

1. **Crop history:** add one season (Year, Season, Crop), then press **Add season**.
   - **You should see:** it appears in the list.
   - Try a **Harvested** date before the **Planted** date. **You should see:** an error.
2. **Soil observations:** add pH `6.5` with today's date, then press **Add observation**.
   - **You should see:** it appears in the list.
   - Try pH `20`. **You should see:** an error.
3. **Water and equipment:** choose some options, save, then reload.
   - **You should see:** the options are kept.
4. **Your priorities:** change the numbers, save, then reload.
   - **You should see:** the numbers are kept.
5. **Scenarios:** create a scenario with the name `Test 1` and the candidate crops `maize, soybean`.
   - **You should see:** it appears in the list.

---

## Test 9 – Field evidence (environmental data)

> The owner must keep the background data worker running during this test. Ask them before you start.

1. Open your US field and go to the **Evidence** page (the link in Inspect).
   - **You should see:** every source shows **"Not fetched yet"**. No numbers yet.
2. Press **"Refresh all"**.
   - **You should see:** the statuses change from **Queued** to **Running** to **Up to date**. The page updates by itself; you do not need to reload.
   - The satellite greenness source (MODIS) is marked **Optional** and is not included. Press **Fetch greenness** on its row if you want it (about 2–3 minutes the first time).
3. When everything is done:
   - **You should see:** cards for frost days, hot days, dry spells, rain and temperature compared with normal, soil wetness, greenness (NDVI) and soil water.
   - Each card has a label: **Observed (satellite)**, **Model-derived** or **Survey / ground**.
4. On any card, press **"How is this measured?"**.
   - **You should see:** the source, unit, years, area and limits, in simple words.
5. On a chart, press **"Show as table"**.
   - **You should see:** a table with the same numbers. Press **"Show chart"** to go back.
6. Look at the map on this page.
   - **You should see:** your field, a big square (the NASA weather grid cell) and small squares (satellite pixels).
7. Go back to the workspace. In **Map** view, press **"Data footprints"**.
   - **You should see:** the same squares on the map.
8. Open your **Bangladesh** field's Evidence page and press **Refresh all**.
   - **You should see:** the weather and satellite data work. The US soil source shows **"Not available here"**. This is correct.

---

## Test 10 – Rotation comparison (simulation)

> The owner must keep the background worker running (the same one as in Test 9).

Use your US field. It should have evidence from Test 9, and at least two years of crop history **with planting and harvest dates**, for example Corn 2023 (05-01 to 10-15) and Soybeans 2024 (05-12 to 10-02).

1. Open the scenario `Test 1` (field records page → Scenarios).
2. In **Scenario settings**:
   - set **Candidate crops** to `maize, soybean, oats, winter wheat`;
   - choose **Planting calendar** "USDA NASS 2010: Iowa";
   - set **Days between harvest and next planting** to `7`;
   - press **Save scenario**.
   - **You should see:** "Scenario saved".
3. Type `13-40` in **Plant from** of planting window 1 (any crop name, `110` days) and save.
   - **You should see:** that field turns red with "Use MM-DD". Clear the row and save again.
4. Press **"Run simulation"**.
   - **You should see:** **Queued**, then **Finished** after a short while. The page updates by itself.
5. Press **"Open result"**.
   - **You should see:**
     - "Historical replay" with **Existing practice** and **Alternative 1, 2…**, each with a "relative score";
     - "Why this order", "Indicators", "Sensitivity cases", "What was considered and rejected", "Questions to review locally", "Assumptions";
     - the text that this is **not a forecast** and that scores are **not probabilities**.
6. Back on the scenario page, press **"Re-run and compare"** on the finished run.
   - **You should see:** after it finishes, **"Re-run gave an identical result"**.
7. Set **Rainfall change (%)** to `-20`, save, and run again.
   - **You should see:** the result also has a section "Scenario: rainfall -20%".
8. Add `dragon fruit` to the candidate crops and run again.
   - **You should see:** under "What was considered and rejected", dragon fruit is listed as "Not in the crop catalogue". It does **not** appear as an alternative.
9. Open **Saved runs**.
   - **You should see:** your runs with their status and an "Open result" link.

---

## Test 10b – Replay, compare, explain and save (Phase 6)

Open a finished run from Test 10 (**Open result**).

1. **Replay** tab.
   - **You should see:** a 3D view with the existing practice and two alternatives side by side, the label **"Illustrative 3D…"**, a date, and ▲ planting / ▼ harvest marks under the slider.
   - Press **Play**: the date moves and plants grow. Press **Pause**.
   - Click the slider and press the right arrow key: the date moves one day. The **Selected date** table changes with it.
   - On a day with no crop, the table says **"Bare field: no crop on this day"**.
   - Press **One at a time**, then pick another option in **Option shown**.
   - Open **Monthly summary of the replay (table)**.
2. **Compare** tab.
   - **You should see:** every option with the same weather years and soil value, units for every number, and the text that scores are **not probabilities**.
   - Move the **Workload** slider in **Your priorities**. The list on the right may re-order and says **Preview**. Press **Undo**.
   - Press **Save these priorities and run again**.
   - **You should see:** "Priorities saved and a new run queued", and a yellow note that your inputs changed after this run.
3. **Why this option?** tab.
   - **You should see:** why it ranks there, better/worse than the existing practice, planting dates with their source, evidence used, what was ruled out, data gaps, questions for a local expert, and **Words used here** (ET, NDVI, soil moisture anomaly, water balance).
4. **Plain-language explanation** tab.
   - **You should see:** a summary marked **"Generated from the stored result (no AI)"**.
   - If the server has no AI key, it says AI drafting is **not configured**. That is correct.
5. **Save and export** tab.
   - Type a **Plan name** and press **Save plan**. **You should see:** "Plan saved" and the plan in the list.
   - Press **Download run file (JSON)**: a file downloads.
   - Open **Saved runs**: the plan is listed under **Saved plans**.
6. Change the language to **বাংলা** in Settings and open the run again.
   - **You should see:** the tabs, buttons and dates in Bangla (some technical notes stay English, and say so).
7. On a phone width (390 px): one option at a time, and no page scrolling sideways.

---

## Test 11 – Privacy (2 accounts)

1. As **Account A**, copy the web address of your farm, your field and your scenario.
2. Sign out. Create **Account B** (use the second email) and sign in.
3. Paste Account A's addresses into the browser.
   - **You should see:** a **Not found** page. None of Account A's names or shapes appear.
4. Open **Farms** and **Workspace** as Account B.
   - **You should see:** they are empty. Only Account B's own data is shown.
5. Sign out and press the browser **Back** button.
   - **You should see:** no private data.

---

## Test 12 – Delete

As Account A:

1. On the field's records page, scroll to **Delete field**. Press **Delete** **without** ticking the box.
   - **You should see:** nothing is deleted.
2. Tick **"Yes, delete this field…"**, then press **Delete**.
   - **You should see:** the field is gone.
3. Do the same for the farm (**Delete farm**).
   - **You should see:** the farm is gone.

---

## Test 13 – Mobile and other checks

Do these on a **phone** (or in Chrome: press F12, then the phone icon, then choose a 390 px width):

1. Open the home page, the sample, the workspace, the records page and the evidence page.
   - **You should see:** the page never scrolls **sideways**, text is readable, and buttons can be tapped.
2. In the workspace, the panel shows at the bottom as **"Field details"**.
   - **You should see:** it opens and closes.
3. On every page, check that:
   - no page is broken or blank;
   - no text overlaps;
   - no buttons are hidden;
   - the map always shows **"© OpenStreetMap contributors"**.

---

## Not bugs (expected for now)

- Rotation results compare options on past weather only. They show no yield, profit or forecast; that is by design.
- The 3D plants and soil colour in the replay are drawings of the stored daily numbers, not satellite pictures.
- On computers without graphics acceleration (software rendering) the 3D view is slow (about 10–15 frames per second) and starts in Low quality. The tables and the Map view work normally.
- The AI explanation button is missing when the server has no AI key; the page says so.
- The new run after "Save these priorities and run again" needs the background worker, like any run.
- Outside the USA, crops without your own dates are rejected with "No local planting window". Add your planting dates in the scenario.
- A run stays "Queued" when the background worker is not running.
- Satellite greenness (MODIS) is optional; its first fetch takes about 2–3 minutes.
- US soil data shows "Not available here" outside the USA.
- NASA imagery can be blank or cloudy on some dates.
- The 3D plants and ground are illustrative, not real photos.
- Only menus and buttons are in Bangla; the longer texts stay in English.
