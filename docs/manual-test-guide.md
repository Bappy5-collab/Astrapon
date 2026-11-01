# Astrapon manual test guide

Covers everything built through **Phase 5** (2026-11-01): accounts, farms and records, location search, boundary and zone drawing, the 3D field workspace, the public sample, the environmental evidence pipeline, and the simulation and rotation comparison.

**Not built yet; do not report as bugs:**

- Yield, profit or forecast numbers: the engine never produces them, by design.
- 3D scenes driven by run results, and zone-level rotations.

---

## 1. Before you start

### 1.1 Environment

The project owner gives you `.env.local`. It holds secrets:

- Never paste its contents into bug reports, screenshots or chat.
- Never commit it.

```bash
pnpm install
pnpm dev               # terminal 1 → http://localhost:3000
pnpm evidence:worker   # terminal 2 → needed for every Evidence test (section 13)
```

Without the worker, evidence jobs stay "Queued". That is expected, and it is itself one test case (EV-09).

### 1.2 Accounts

- Create **two of your own test accounts** (Account A and Account B) through Sign up. Use real inboxes you can read, because sign-up needs email confirmation. Plus-addressing works, for example `you+a@…` and `you+b@…`.
- **Do not** sign in with, change or delete the owner's existing accounts.

### 1.3 Browsers and screen sizes

- **Browsers:** Chrome (main), plus Firefox and Edge or Safari if available.
- **Widths:**
  - **1440 px** (desktop);
  - **1024 px** (small laptop or tablet landscape);
  - **390 px** (phone). Use DevTools device mode or a real phone.
- Keep the DevTools **Console** open. Any red error is a bug unless this guide says otherwise.

### 1.4 Test data

| Purpose | Value |
|---|---|
| US location (all 3 evidence sources work) | `42.098, -93.801` (central Iowa, the sample field area) |
| Non-US location (soil survey "Not available here") | `24.75, 90.40` (Mymensingh, Bangladesh) |
| Coordinate formats to try | `23.81, 90.41` · `23.81N 90.41E` · `23°48'36"N 90°24'36"E` · `42.098 N, 93.801 W` |
| Place names to search | `Ames, Iowa` · `Mymensingh` · `Bogura` · a misspelling such as `Mymensinghh` |

GeoJSON for the Records page (section 11):

```json
// VALID boundary (≈ 20 ha, Iowa)
{"type":"Polygon","coordinates":[[[-93.8042,42.1004],[-93.7988,42.1004],[-93.7986,42.0969],[-93.8016,42.0962],[-93.8043,42.0966],[-93.8042,42.1004]]]}

// VALID zone inside that boundary
{"type":"Polygon","coordinates":[[[-93.8030,42.0995],[-93.8010,42.0995],[-93.8010,42.0980],[-93.8030,42.0980],[-93.8030,42.0995]]]}

// INVALID: zone outside the boundary
{"type":"Polygon","coordinates":[[[-93.70,42.10],[-93.69,42.10],[-93.69,42.09],[-93.70,42.09],[-93.70,42.10]]]}

// INVALID: self-crossing ("bow-tie")
{"type":"Polygon","coordinates":[[[-93.80,42.10],[-93.79,42.09],[-93.79,42.10],[-93.80,42.09],[-93.80,42.10]]]}

// INVALID: ring not closed (last point ≠ first point)
{"type":"Polygon","coordinates":[[[-93.80,42.10],[-93.79,42.10],[-93.79,42.09],[-93.80,42.09]]]}

// INVALID: too large (> 30 km across)
{"type":"Polygon","coordinates":[[[-94.0,42.0],[-93.5,42.0],[-93.5,42.4],[-94.0,42.4],[-94.0,42.0]]]}

// INVALID: crosses the 180° meridian (Fiji)
{"type":"Polygon","coordinates":[[[179.99,-17.0],[-179.99,-17.0],[-179.99,-16.99],[179.99,-16.99],[179.99,-17.0]]]}

// INVALID: not JSON
hello
```

(Remove the `//` comment lines before pasting.)

### 1.5 How to report a bug

```
ID / title:       e.g. WS-07 – Save button keeps old count after save
Severity:         Blocker / Major / Minor / Cosmetic
Page + URL:       /fields/<id>
Browser + width:  Chrome 130, 390 px
Account:          A or B (never paste passwords)
Steps:            1. … 2. … 3. …
Expected:         (from this guide)
Actual:           …
Evidence:         screenshot / screen recording / console error text
```

**Severity guide:**

- **Blocker:** data loss; one user sees another's data; a secret is visible; the app crashes.
- **Major:** a main flow cannot be completed.
- **Minor:** wrong message, or a workaround exists.
- **Cosmetic:** layout or spacing.

---

## 2. Checks for every page

Run these on each page you visit, at all three widths.

| ID | Check | Expected |
|---|---|---|
| G-01 | Horizontal scrolling at 390 px | The page never scrolls sideways. Wide tables may scroll inside their own box. |
| G-02 | Console | No red errors. No React hydration warnings. |
| G-03 | Keyboard only | Tab reaches every button, link and field in a sensible order. Focus is clearly visible. Enter or Space activates. Escape closes dialogs and drawers. |
| G-04 | Header navigation | Links lead to Farms, Workspace, Saved runs, Sources, Methodology, Settings, Sign in or Account. At 390 px the navigation is reachable (menu). |
| G-05 | Footer | Shows the disclaimer (not a forecast, not affiliated with NASA), the map credits, "Development build · Phase 5", and links to Methodology, Data sources and Setup. On the full-screen workspace pages the footer is hidden on desktop. |
| G-06 | No secrets | Page text, page source (Ctrl+U) and `/api/health` never show keys, tokens or database URLs. They show only states such as "Configured". |
| G-07 | Honesty | Nothing shows invented numbers as real. Sample data is always labelled "Sample" or "invented". Missing data shows as "not available" or a dash, never as 0. |
| G-08 | Page title | The browser tab title matches the page. |
| G-09 | Zoom 200% | Text stays readable and nothing overlaps. |

---

## 3. Landing page `/`

| ID | Steps | Expected |
|---|---|---|
| L-01 | Open `/`. | Hero "Test a new rotation on your own field before you plant it." A 3D sample field turns slowly. Buttons "Explore a sample" and "Create my field". |
| L-02 | In "Find your field", search `Ames, Iowa` and press Search or Enter. | A results list appears, with the attribution "Search by OpenStreetMap Nominatim · © OpenStreetMap contributors". Choosing a result moves you to the new-field flow at that place. |
| L-03 | Type in the search box without submitting. | **No** suggestions appear while typing. Search runs only on submit; this is required by policy. |
| L-04 | Search `zzqqxxnotaplace`. | "No places found. Try a nearby town, a district, or coordinates." |
| L-05 | Switch to the Coordinates tab and enter `23.81, 90.41`, then Go. | Opens the new-field flow at that point. |
| L-06 | Enter coordinates `95, 10` (invalid latitude). | A clear validation message. No navigation. |
| L-07 | Press "Use my location" and **deny** the browser prompt. | "Location permission was denied. You can search for a place or type coordinates instead." |
| L-08 | Press "Use my location" and **allow** it. | Opens the new-field flow near you. The URL must **not** contain your latitude or longitude. |
| L-09 | Scroll down. | Problem cards, a 5-step workflow (all five steps "Working"), and a table of data sources by cell size. No invented statistics. |
| L-10 | Set the OS to "reduce motion" and reload. | The hero field does not turn. |
| L-11 | Search 5 times quickly. | Still works. You may see a short "busy" message (shared 1 request per second limit), but never a crash. |

---

## 4. Accounts

| ID | Page | Steps | Expected |
|---|---|---|---|
| AU-01 | `/sign-up` | Submit empty. | Fields marked required. |
| AU-02 | `/sign-up` | Invalid email, or a password under 8 characters, or passwords that differ. | "Enter a valid email address", "Use at least 8 characters", "Passwords do not match". |
| AU-03 | `/sign-up` | Valid email and password. | "Check your email for a confirmation link to finish creating your account." |
| AU-04 | `/sign-up` | Sign up again with an **already registered** email. | The **same** success message, so the app does not reveal whether the account exists. |
| AU-05 | `/sign-in` | Sign in before confirming the email. | "Confirm your email address first. Check your inbox for the link." |
| AU-06 | Email | Click the confirmation link. | You land signed in, or on sign-in with success. An expired or reused link opens a friendly error page (`/auth/error`). |
| AU-07 | `/sign-in` | Wrong password. | "Email or password is incorrect." |
| AU-08 | `/sign-in` | Correct details. | Redirect to `/farms`. The header shows Account. |
| AU-09 | Signed out | Open `/farms`, `/runs`, `/account` or `/fields/new` directly. | Redirect to `/sign-in?next=…`. After signing in you return to the page you asked for. |
| AU-10 | `/sign-in?next=https://evil.example` | Sign in. | You stay inside Astrapon (`/farms`). Never redirected to an outside site. |
| AU-11 | `/forgot-password` | Enter your email, then Send reset link. | A neutral success message. The email arrives. The link opens "Choose a new password". |
| AU-12 | `/account/update-password` | Set a new password (≥ 8 characters, matching). | Success. Sign out, then sign in with the new password. |
| AU-13 | `/account` | Change Display name and Units (Metric or Imperial), then Save preferences. Reload. | Values persist. |
| AU-14 | `/account` | Sign out. | Back to sign-in with "You have signed out." The browser Back button does not show private data. |
| AU-15 | Signed in | Open `/sign-in` or `/sign-up`. | Redirect to `/farms`. |

---

## 5. Settings `/settings`

| ID | Steps | Expected |
|---|---|---|
| ST-01 | Change Language to বাংলা. | Navigation, workspace controls, location search, settings and the landing hero switch to Bangla. Record forms, evidence and methodology stay English; Settings says so. |
| ST-02 | Reload, then open another page. | The language choice persists in this browser. |
| ST-03 | Set 3D quality to Low, then High, and open `/sample`. | Low: fewer plants and no shadows. High: denser plants and shadows. Automatic picks a sensible level. |
| ST-04 | Set Motion to "Always reduce motion". | The landing hero stops turning. Camera moves jump instead of animating. |
| ST-05 | Switch back to English. | Everything returns to English. |

---

## 6. Farms `/farms` and `/farms/[id]`

| ID | Steps | Expected |
|---|---|---|
| FA-01 | New account, open `/farms`. | "No farms yet. Add your first farm below." |
| FA-02 | Create a farm: name only. | It appears in the list with "0 fields". |
| FA-03 | Create a farm with Country code `us` and Notes. | Saved. Country shown in upper case (US). |
| FA-04 | Country code `USA` or `1`. | Rejected: two letters only. |
| FA-05 | Empty farm name. | Rejected. |
| FA-06 | Open a farm, then Add field (name only). | The field appears with "No boundary yet". |
| FA-07 | Market preferences: add a crop with Preferred and "Under contract". | Listed with "under contract". The Delete link removes it. |
| FA-08 | Delete farm: press Delete **without** ticking the confirm box. | It does not delete; the checkbox is required. |
| FA-09 | Tick "Yes, delete this farm and everything in it", then Delete. | The farm and all its fields are gone, and are also gone from `/workspace` and `/runs`. |

---

## 7. Workspace hub `/workspace`

| ID | Steps | Expected |
|---|---|---|
| WH-01 | Signed out. | "Sign in to open your own fields. The sample works without an account." "Explore the sample" works. |
| WH-02 | Signed in, with no fields. | "No fields yet. Create your first field from the map." |
| WH-03 | Signed in, with fields. | Cards show the field name, the farm and the area in ha (or "no boundary yet"), newest first. |

---

## 8. Create a field `/fields/new`

Run it at 1440 px and at 390 px.

**Locate**

| ID | Steps | Expected |
|---|---|---|
| NF-01 | Search a place, choose a result. | The map flies to it. |
| NF-02 | Coordinates tab: try every format in section 1.4. | Each one centres the map at the right spot. |
| NF-03 | "Use my location": deny, allow, or (in DevTools Sensors) set "Location unavailable". | The right message for each case: denied, unavailable or timeout. Never a silent failure. |

**Draw the boundary**

| ID | Steps | Expected |
|---|---|---|
| NF-04 | Click 4 or more corners on the map, then "Finish shape". | A closed outline. The panel shows the corner count and the area ("Area is computed on the WGS84 ellipsoid"). |
| NF-05 | Drag a corner. | The shape updates and the area changes. |
| NF-06 | Click a midpoint marker between two corners. | A new corner is added. |
| NF-07 | Select a corner, then "Delete point". | It is removed. A shape with fewer than 3 corners cannot be finished. |
| NF-08 | Undo several times, then Clear. | Each Undo steps back. Clear empties the shape. |
| NF-09 | Keyboard: pan the map with the arrow keys and use "Add point at centre" several times. | You can draw a whole field without a mouse. |
| NF-10 | "Cut out an area": draw a hole inside the field, then finish. | Shows "· 1 cut-out area(s)". The area drops. "Drop this cut-out" removes it. |
| NF-11 | Draw a hole partly outside the field. | Rejected with a clear message. |
| NF-12 | Draw a self-crossing shape (bow-tie). | Rejected with a clear message. |
| NF-13 | Draw a very large field (> 30 km across). | Rejected (size limit). |
| NF-14 | Go to Fiji (`-17, 180`) and draw across the 180° line. | Rejected with an explanation that fields crossing the antimeridian are not supported. A field just on one side works. |
| NF-15 | Base map: switch to "NASA imagery". | A satellite image appears with credits. The date picker and "Nearest earlier" search find a date with imagery. Some dates are cloudy or blank; that is normal. Switch back to Streets. |
| NF-16 | Map credits. | "© OpenStreetMap contributors" (and NASA GIBS for imagery) are always visible. |

**Confirm and save**

| ID | Steps | Expected |
|---|---|---|
| NF-17 | Go to Confirm without ticking "This outline matches my field. Its area and location are correct." | You cannot save. |
| NF-18 | Field name empty. | Rejected. |
| NF-19 | Choose Farm "New farm…", enter a New farm name and Country (ISO), tick the box, then "Save field and open workspace". | Both the farm and the field are created. You land on `/fields/<id>`. |
| NF-20 | Repeat, choosing an existing farm. | The field is added to that farm. |
| NF-21 | Create one **US field** (Iowa, ideally a larger one of about 60 ha or more) and one **Bangladesh field**. | Keep them for sections 9–14. |

---

## 9. Field workspace `/fields/[id]`

Use the US field from NF-21.

**3D view**

| ID | Steps | Expected |
|---|---|---|
| WS-01 | Open the field. | The 3D field with its real outline. The label "Illustrative 3D · flat terrain · not satellite imagery". The Simulation chip says "run it from a scenario". |
| WS-02 | Drag to orbit, right-drag or two-finger drag to pan, scroll or pinch to zoom. | Smooth. You cannot flip under the ground. |
| WS-03 | Camera buttons: Rotate left/right, Zoom in/out, Reset view. Click the compass. | Each works. The compass points north; clicking it resets the view. |
| WS-04 | Quality select: Low, Balanced, High. | The look changes; no crash. |
| WS-05 | Switch to another browser tab for 30 s, then come back. | The scene is still there. It does not use CPU while hidden. |

**Zones and crops**

| ID | Steps | Expected |
|---|---|---|
| WS-06 | Tool "Draw zone": draw a zone inside the field, give it a name, pick "Why this zone differs", then "Use this shape". | The zone appears in 3D and in the Zones list. The Save button shows "1 unsaved". |
| WS-07 | Try to finish a zone without a name, or with a name another zone already uses. | "Give the zone a name" or "Another zone already has this name". |
| WS-08 | Draw a zone partly outside the field. | Rejected before saving. |
| WS-09 | Select a zone by clicking it in 3D, and also from the list. Then use the keyboard (Tab to the list, Enter). | The selected zone gets a lime outline and tint. The panel shows its details. |
| WS-10 | Assign crop: pick the whole field or a zone, a Year and a Season, type a crop (try `maize`, `boro rice`, `ধান`, `unknowncrop`). | Plants appear. Known crops get their own shape; unknown names get a generic shape. Crop text over 80 characters is rejected. |
| WS-11 | Seasonal timeline. | The year × zone table shows the crops you assigned. The "Illustrative growth stage" toggle (Bare → Harvested) changes the plants. |
| WS-12 | Tool "Edit boundary": move a corner so a zone falls outside, then try to save. | The save is blocked with a clear message. Nothing is partly saved. |
| WS-13 | With unsaved changes, try to close the tab or navigate away. | The browser asks "Leave site?". |
| WS-14 | Save, then "Review and save". | The dialog lists every change and says they are saved together, and that if one fails none are saved. "Confirm and save" shows "All changes saved". |
| WS-15 | Reload the page. | The zones, crops and boundary are all still there. |
| WS-16 | Immediately after saving, navigate away. | **No** false "unsaved changes" prompt. |
| WS-17 | View toggle: Map. | The 2D map shows the field and zones. |
| WS-18 | Map view: press "Data footprints" (after evidence has been fetched; section 13). | The NASA POWER grid cell and the MODIS pixel squares appear around the field. Press it again to hide them. |
| WS-19 | Open the Inspect drawer ("Inspect"). | History, soil, evidence status per source, headline metrics (frost days, dry spell, NDVI, AWC), a link to the full Evidence page, and source coverage ("One value for the field", "Coarser than zones", "Can resolve within field", and so on). At 1536 px and wider it docks at the side; below that it opens as a drawer. |
| WS-20 | 390 px. | The panel becomes a bottom sheet ("Field details") with all controls reachable and no sideways scrolling. |
| WS-21 | Language set to Bangla. | Workspace labels are in Bangla and the page has `lang="bn"`. |
| WS-22 | Disable WebGL (Chrome: `chrome://flags` → disable WebGL, or open with `--disable-webgl`). | A clear fallback message replaces the 3D view. The zone list, timeline and Inspect panel still work. |
| WS-23 | "All records" link. | Opens `/fields/<id>/records`. |

---

## 10. Public sample `/sample` (no account needed)

| ID | Steps | Expected |
|---|---|---|
| SA-01 | Open `/sample` signed out. | The badge "Sample field · invented data". Central Iowa outline with a hole (wet hollow), invented zones and history. |
| SA-02 | Add a zone or crop, then Save. | "Sample changes are kept only in this browser…" Nothing is sent to the server. |
| SA-03 | Reload. | Your sample edits are still there (same browser). In a private window you see the original sample. |
| SA-04 | "Reset sample". | Back to the original sample. |
| SA-05 | Inspect drawer, Evidence. | "Evidence is fetched only for saved fields. The sample shows none rather than invented values." **No** numbers. |
| SA-06 | All 3D, camera, timeline and growth stage checks from section 9. | Same behaviour. |

---

## 11. Field records `/fields/[id]/records`

Use a field **without** a drawn boundary for BR-01 to BR-04 (create it with "Add field" on a farm page).

| ID | Section | Steps | Expected |
|---|---|---|---|
| BR-01 | Boundary (GeoJSON import) | Paste each **INVALID** sample from section 1.4. | Each is rejected with a specific message (not closed, crossing, too large, antimeridian, not JSON). |
| BR-02 | Boundary | Paste the **VALID** boundary, choose "Where it came from", then Save boundary. | A preview appears and the area is ≈ 20 ha. The button becomes "Replace boundary". |
| BR-03 | Planting zones | Paste the valid zone, name it, choose a basis, then Add zone. | Listed and shown in the preview. Before a boundary exists: "Save the field boundary first." |
| BR-04 | Planting zones | Paste the "zone outside" sample. | Rejected. |
| BR-05 | Crop history | Add a season: Year, Season, Crop, Zone, Planted and Harvested dates, Tillage, Reported yield and Yield unit. | Listed exactly as entered (yield not converted). Harvested before Planted should be rejected. Delete works. |
| BR-06 | Soil observations | Add pH 6.5, Sampled on today, Top 0 and Bottom 15 cm, Kind "Lab / survey measurement". | Listed. Bottom ≤ Top is rejected. An impossible value (pH 20) is rejected. |
| BR-07 | Water and equipment | Set Irrigation, Method, Seasonal allocation (mm), Water source and equipment checkboxes, then Save. Reload. | Values persist. |
| BR-08 | Your priorities | Set the 0–5 values and "Crops you will not grow" (`rice, cotton`), then Save. Reload. | Values persist. |
| BR-09 | Scenarios | Create a scenario: name, Candidate crops `maize, soybean, wheat`, rotation length 2, replay years, irrigation assumption. | It appears in the list and links to `/scenarios/<id>`. "Replay from" later than "Replay to" is rejected. Empty candidate crops are rejected. |
| BR-10 | Changes in the workspace | Records added here (zones, history) show in the workspace after reload, and the other way round. | They match. |
| BR-11 | Delete field | Without ticking the box, then with "Yes, delete this field and everything in it". | Without the tick: nothing happens. With the tick: the field, zones, records, scenarios and snapshots are deleted. This also works when the field has fetched evidence and snapshots. |

---

## 12. Scenarios `/scenarios/[id]`

| ID | Steps | Expected |
|---|---|---|
| SC-01 | Open a scenario. | Scenario settings form and the "Input snapshots" section. The text explains that a snapshot freezes all inputs. |
| SC-02 | Edit settings, then Save scenario. Reload. | Values persist. |
| SC-03 | Press "Run simulation" (section 14). | A snapshot is listed with the time, a hash and engine "1.0.0". The green note "The newest snapshot matches the current inputs." appears. |
| SC-04 | Change anything on the field (add a crop history row), then come back. | The blue note "Inputs have changed since the newest snapshot…". The old snapshot is unchanged. |
| SC-05 | Freeze a second snapshot. | Two snapshots; the newest matches again. |
| SC-06 | **Evidence pinning.** After evidence exists for the field (section 13), freeze a snapshot. Then on the Evidence page press Refresh all and wait for it to finish. Come back. | The earlier snapshot still shows the same contents and hash; a refresh never changes a saved snapshot. |
| SC-07 | Delete scenario (tick the confirm box). | The scenario and its snapshots are gone, and gone from `/runs`. |

---

## 13. Field evidence `/fields/[id]/evidence`

**`pnpm evidence:worker` must be running** unless a case says otherwise.

Expected time for a **new location**:

| Source | First fetch |
|---|---|
| NASA POWER | about 1–3 min |
| SSURGO | seconds |
| MODIS NDVI | about **15–20 min** (slow public service) |

Repeat fetches for the same place are much faster, because results are cached.

| ID | Steps | Expected |
|---|---|---|
| EV-01 | Open the Evidence page of a field with **no boundary**. | "Draw the field boundary first; evidence is fetched for the field's location." |
| EV-02 | US field, first visit. | Every source shows "Not fetched yet". The info box says no evidence has been fetched and to use "Refresh all". No made-up numbers. |
| EV-03 | Press "Refresh all". | Returns immediately; the page does not hang. Sources show "Queued", then "Running" with a step and progress (for example "(12/124)"). The page updates itself every few seconds, without a manual reload. |
| EV-04 | Wait until it finishes. | Each source shows "Up to date", with "Fetched <date> · observations <start> to <end>". |
| EV-05 | Metric cards. | Frost days, hot days, dry spells, seasonal precipitation and temperature compared with 1991–2020, root-zone wetness, NDVI peak and trend, and soil water capacity (AWC). Each card has an evidence-class chip: "Observed (satellite)", "Model-derived" or "Survey / ground". |
| EV-06 | Click "How is this measured?" on several cards. | The inspector shows the source, unit, period, area covered, completeness and limitations in plain language. "How it was computed (technical)" expands to show the processing version, "Data fetched" time and "Response SHA-256". |
| EV-07 | Charts: press "Show as table", then "Show chart". | The table has the same values as the chart. Missing years or months show a dash, never 0. The precipitation chart uses two colours with a legend ("Drier than normal" / "Wetter than normal"). |
| EV-08 | Footprint map. | Your field outline, the large NASA POWER cell ("one value for this whole area"), and MODIS pixels. For a large field (≥ 2 pixels mostly inside), the pixels inside are shaded by greenness with a legend. For a small field: "No two pixels lie mostly inside your field…". |
| EV-09 | **Stop the worker** (Ctrl+C in terminal 2), then press Refresh on one source. | "Queued" / "Waiting for the worker…". After about 45 s a warning appears telling you to run `pnpm evidence:worker`. Start the worker again: the job runs. |
| EV-10 | While a source is Queued or Running, press "Cancel". | The job stops. Earlier data, if any, remains. |
| EV-11 | **Outage simulation.** Stop the worker. Delete the folder `.cache/evidence`. Start it with `ASTRAPON_SIMULATE_OUTAGE=power.larc.nasa.gov pnpm evidence:worker` (PowerShell: `$env:ASTRAPON_SIMULATE_OUTAGE="power.larc.nasa.gov"; pnpm evidence:worker`). Press Refresh on NASA POWER. | It shows "Retry scheduled after: …" and, after the retries, "Failed" with "Last refresh failed …" and a "Retry" button. **Earlier POWER numbers stay visible.** Other sources are not affected. Afterwards, restart the worker **without** the variable and press Retry: it recovers. |
| EV-12 | Press "Refresh all" twice quickly, or in two tabs. | Only one job per source runs; there are no duplicates. |
| EV-13 | **Bangladesh field**: Refresh all. | NASA POWER and MODIS work. SSURGO soil shows "Not available here" (US only), not an error and not a number. |
| EV-14 | Workspace Inspect drawer after fetching. | The same status and headline numbers as the Evidence page. |
| EV-15 | Account B opens Account A's evidence URL. | Not found, with no data (see PR-02). |
| EV-16 | 390 px. | Cards stack, charts fit the width, the inspector is readable, and there is no sideways scroll. |

> Note: SSURGO (US soil service) has a nightly maintenance window. During it the soil source may show "Retry scheduled" or "Failed". That is the honest behaviour, not a bug. Retry later.

---

## 14. Saved runs `/runs`

| ID | Steps | Expected |
|---|---|---|
| RU-01 | No runs. | "No runs yet. Open a scenario and choose “Run simulation”." The scenarios list below still shows your scenarios. |
| RU-02 | With runs. | Each run shows its status, scenario, field, time and engine, with "Open result" for finished runs. |

---

## 14b. Rotation comparison `/scenarios/[id]` and `/runs/[id]`

Needs `pnpm evidence:worker` running, a US field with evidence (section 13) and whole-field crop history **with planting and harvest dates** for the last 2 years.

| ID | Steps | Expected |
|---|---|---|
| SI-01 | Scenario settings: candidate crops `maize, soybean, oats, winter wheat`, rotation 2, calendar "USDA NASS 2010: Iowa", turnaround 7, then Save. | "Scenario saved". The calendar list contains the US states. |
| SI-02 | Planting window row 1: `lentil`, `13-40`, `11-20`, `110`, then Save. | That row's "Plant from" turns red with "Use MM-DD". Nothing is saved. |
| SI-03 | Rotation length `5`. | Rejected: "At most 4 years". |
| SI-04 | Press "Run simulation". | "Queued" at once, then "Finished" without a reload. With the worker stopped, a warning appears after about a minute. |
| SI-05 | Open the result. | Historical replay: existing practice plus alternatives with relative scores; "Why this order" table and priority lines; Indicators table with units ("—" = insufficient evidence); Sensitivity cases; Ranking stable or fragile; rejections; inputs (SSURGO soil, POWER years); gaps; review questions; assumptions; sources; technical provenance. No yield, profit or forecast. |
| SI-06 | Every alternative. | Contains at least two different crops, differs from the existing practice in its crops, and has no constraint conflict. |
| SI-07 | "Re-run and compare". | After it finishes: "Re-run gave an identical result". |
| SI-08 | Rainfall change `-20`, run again. | A second section "Scenario: rainfall -20%". The historical replay section is unchanged. |
| SI-09 | Add `dragon fruit` and `lentil` (no window) to the candidates, run. | Under "What was considered and rejected": dragon fruit "Not in the crop catalogue", lentil "No local planting window" with a question asking for its dates. |
| SI-10 | Exclude `oats` in Your priorities (records page), run. | Oats is rejected as "You excluded it" and never appears in an alternative. |
| SI-11 | Delete the crop history, run. | "Existing practice is unknown…" asks for history; no existing practice is invented. |
| SI-12 | Bangladesh field: no calendar region; windows for jute (03-20 to 04-10, 110), lentil (11-01 to 11-20, 110); history with dated Boro rice. | Multi-crop years are possible. Rice water use is shown as potential only. The SSURGO gap is listed. |
| SI-13 | Account B opens Account A's `/runs/<id>`. | Not found. |
| SI-14 | 390 px. | Result tables scroll inside their box; the page never scrolls sideways. |

## 15. Information pages

| ID | Page | Expected |
|---|---|---|
| IN-01 | `/sources` | A list of data sources with a status chip (for example Live-verified or Needs credentials), a decision, cell size, access and limits. Readable at 390 px. |
| IN-02 | `/methodology` | Sections: Evidence classes, Field geometry, What the 3D view shows, Maps imagery and place search, Environmental evidence, Not built yet. There are no broken links. |
| IN-03 | `/setup` | A table of services showing "Configured", "Not configured" or "Invalid". **No secret values.** |
| IN-04 | `/api/health` | JSON with `"phase": 4`, `"status": "ok"` and service states only, with no values. |
| IN-05 | `/api/geocode?q=Ames` | JSON results. `/api/geocode?q=` (empty) returns an error (400), not a crash. |
| IN-06 | Unknown URL such as `/nope` | A friendly 404 page. |

---

## 16. Privacy and security (two accounts)

| ID | Steps | Expected |
|---|---|---|
| PR-01 | Account A creates a farm, a field, a scenario and evidence. Copy the URLs. | Note them down. |
| PR-02 | Sign in as Account B and open each of A's URLs (`/farms/<id>`, `/fields/<id>`, `/fields/<id>/records`, `/fields/<id>/evidence`, `/scenarios/<id>`). | Not found. None of A's names, numbers or shapes appear. (The HTTP status may be 200; that is a known limitation.) |
| PR-03 | Account B's `/farms`, `/workspace` and `/runs`. | Only B's own data. |
| PR-04 | Sign out, then press the browser Back button. | Private pages do not show data. A reload redirects to sign-in. |
| PR-05 | Use your device location, then look at the URL and the browser history. | Coordinates never appear in any URL. |
| PR-06 | Page source and network responses (DevTools → Network). | No service keys, database URLs or tokens other than the normal public Supabase key and the session cookie. |
| PR-07 | Turn off the network (DevTools → Offline) and submit a form. | An honest message such as "The account service did not respond…". You are not shown as signed out, and no data is lost. |

---

## 17. Automated checks (for a technical tester)

These run in a terminal from the project folder. Report the exact output if anything fails.

| Command | What it does | Expected |
|---|---|---|
| `pnpm check` | lint + typecheck + 138 unit tests, no network | All pass |
| `pnpm build` | Production build | Succeeds |
| `pnpm db:verify` | Checks the dev database schema and security | 14/14 |
| `pnpm test:db` | Two-user isolation tests on the **dev** database. It creates and then deletes throwaway users. | 15/15 |
| `pnpm evidence:trace` | **Live** trace: one real NASA POWER response → stored value → displayed value → snapshot pin, plus an outage. It writes `data/verification/evidence-trace.json`. | 10/10 |

Do **not** commit files changed under `data/verification/` unless the owner asks.

---

## 18. Known limitations (not bugs)

- Simulation results are comparisons on past weather; no yield, profit or soil outcome is shown, by design.
- Outside the USA, crops without your own planting dates are rejected with "No local planting window".
- The first MODIS fetch for a new place takes about 15–20 min.
- SSURGO soil data covers the USA only; elsewhere it shows "Not available here". SoilGrids (global soil) is currently down at the provider.
- Within-field greenness needs at least 2 MODIS pixels (250 m) mostly inside the field. Small fields show one shared value.
- Evidence is not shown for the public sample, by design.
- NASA imagery is 30 m, date-specific and may be cloudy or blank. It is only a drawing aid.
- Bangla covers the interface chrome only (navigation, workspace, search, settings, landing hero).
- The 3D terrain is flat and the plants are illustrative (larger than life, at an illustrative density). Growth stages are a display control, not observations.
- Opening another user's record shows a not-found page but with HTTP status 200.
- Fields crossing the 180° meridian are rejected on purpose.
- Place search and map tiles use free public services. They can be slow or busy at times.
