# Astrapon – Puro Test Guide, Banglish (Phase 0–7)

Ekhon porjonto ja ja banano hoyeche, shob ek guide e, page dhore. Prottek section e lekha ache **kon page**, **ki korben**, **ki dekhar kotha**, ar **kon prompt e baniyechi** (P0–P7).

Ei guide `docs/full-test-guide.md` er Banglish version. Purono guide gulo (`ui-test-guide-simple.md`, `phase5-test-guide.md`, `manual-test-guide.md`) er shob test eখানে ache, shathe Phase 6 ar 7 er test o.

Kono kichu guide er sathe na mille likhe rakhun: kon page, ki korechilen, ki dekhar kotha chilo, ki dekhlen, ar ekta screenshot.

---

## 0. Shuru korar age

**Lagbe:** duita email address (Account A ar Account B), ar mot 1.5 ghonta somoy.

**Ei order e korun:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16.

---

## 1. Setup page `/setup` (P0, P2, P4, P6)

1. `/setup` khulun.
   - **Dekhben:** service er list, prottek tar pashe **Configured / Not configured / Invalid**. List e ache Supabase, worker trigger (GitHub dispatch), NASA Earthdata ar AI (Anthropic).
   - **Dekhben:** kothao kono secret value nai, shudhu state.
   - `ANTHROPIC_API_KEY` set na kora porjonto AI **Not configured** dekhabe. Eta thik.
2. `/api/health` khulun.
   - **Dekhben:** chhoto ekta JSON, jekhane `phase: 7` lekha.

## 2. Home page `/` (P0, P3)

1. **Dekhben:** title, aste aste ghurte thaka ekta 3D field, ar **Explore a sample** o **Create my field** button.
2. `Mymensingh` likhe **Search** chapun.
   - **Dekhben:** jaygar list.
   - Type korar shomoy kichu ashbe na. Search hoy shudhu button chaple.
3. `zzqqxx` search korun. **Dekhben:** "No places found".
4. **Coordinates** tab e `23.81, 90.41` likhe **Go** chapun. **Dekhben:** oi jaygar map.
5. **Use my location** chepe browser popup e **Block** din. **Dekhben:** "permission denied" message. App crash korbe na.
6. Footer e **"Development build · Phase 7 release candidate"** lekha thakbe (P7).

## 3. Tothyo page `/methodology`, `/sources` (P1, P4, P5, P6)

1. `/sources`: prottek data source er evidence type, spatial support, ki bojhay, ki bojhay na, decision ar status thakbe.
   - SoilGrids unavailable dekhabe.
   - GRACE not applicable dekhabe.
2. `/methodology`: ei section gulo thakbe: Evidence classes, Field geometry, 3D view, Maps, Environmental evidence, Simulation, Replay and explanations, Not built yet.
   - **Dekhben:** lekha ache result holo purono weather er replay, forecast na. Yield ba profit dey na.

## 4. Sample field `/sample`, account chara (P3)

1. **Dekhben:** ekta 3D field, label **"Sample field · invented data"**.
2. Mouse drag kore ghuran, scroll kore zoom korun. Button gulo try korun: rotate left/right, zoom in/out, **Reset view**.
   - P7: phone width e pura field screen e dhore. Reset view ager oi fit kora view e ferot ane.
3. Ekta zone e click korun. **Dekhben:** shobuj outline ar zone er details.
4. Growth-stage button (Bare → Harvested) chapun. **Dekhben:** gach bodlay.
5. Ekta zone e crop din (`maize`), tarpor **Save** → **Confirm and save**, tarpor page reload. **Dekhben:** change ta theke gache. Eta shudhu ei browser e save hoy.
6. **Reset sample** chapun. **Dekhben:** field ager obosthay ferot gache.
7. Inspect → Evidence khulun. **Dekhben:** "the sample has no evidence". Kono number nai.

## 5. Account `/sign-up`, `/sign-in`, `/forgot-password` (P2, P4)

1. Sign in → **Create an account**.
   - Khali form submit korun. **Dekhben:** "required" error.
   - 8 character er kom password din. **Dekhben:** error.
2. Account A banan. **Dekhben:** "Check your email…".
3. Email confirm na kore sign in korun. **Dekhben:** "Confirm your email address first".
4. Email er link e click korun.
   - **Dekhben:** link **live site e khole, localhost e na**.
   - Sign in korle **Your farms** page ashe.
5. Bhul password din. **Dekhben:** "Email or password is incorrect."
6. Sign out obosthay `/farms` khulun.
   - **Dekhben:** sign-in page e niye jay.
   - Sign in korle abar `/farms` e ferot ashe.
7. Forgot password e email din. **Dekhben:** success message, ar ekta email ashe.

## 6. Account ar Settings `/account`, `/settings` (P2, P6)

1. Account page e **Display name** ar **Units** bodlan, **Save preferences** chapun, reload korun. **Dekhben:** change theke gache.
2. **Change password** diye notun password din, sign out korun, notun password e sign in korun. **Dekhben:** kaj kore.
3. Settings e Language **বাংলা** korun.
   - **Dekhben:** menu, button, tarikh ar shonkha Banglay.
   - Abar English e ferot jan.

## 7. Farm `/farms`, `/farms/[id]` (P2)

1. **Dekhben:** "No farms yet".
2. Farm name ar country `BD` diye **Create farm** chapun. **Dekhben:** list e ashe.
   - Name khali rekhe try korun. **Dekhben:** error.
3. Farm khulun. Ekta **Market preference** (`rice`, Preferred) jog korun, tarpor mushe din. **Dekhben:** duitai kaj kore.
4. US field er jonno country `US` diye arekta farm banan.

## 8. Field banano `/fields/new` (P3)

1. `Ames, Iowa` search kore ekta result bachhun.
2. 4–6 ta corner click kore **Finish shape** chapun. **Dekhben:** bondho outline ar hectare e area.
3. Ekta corner drag korun. **Dekhben:** shape ar area bodlay. **Undo** chaple **dekhben:** change ta ferot gache.
4. Map **NASA imagery** e din. **Dekhben:** satellite chobi. Kichu tarikh e khali ba megh thakte pare, eta thik. Tarpor Streets e ferot jan.
5. Line gulo kata-kati kore emon (bow-tie) shape aakun. **Dekhben:** error, save kora jay na.
6. Thik shape aakun, tarpor:
   - Field name din;
   - US farm bachhun;
   - **"This outline matches my field…"** tick din;
   - **Save field and open workspace** chapun.
   - **Dekhben:** apnar field 3D te.
7. Bangladesh er jonno abar korun (`Mymensingh`, BD farm).

## 9. Field workspace `/fields/[id]` (P3, P7)

1. **Dekhben:** apnar field 3D te, **"Illustrative 3D · flat terrain · not satellite imagery"** lekha, ar camera button.
2. **Draw zone** tool diye field er bhitore point click korun. Name ar reason diye **Use this shape** chapun.
   - **Dekhben:** notun zone, ar Save button e "1 unsaved".
   - Name chara try korun. **Dekhben:** "Give the zone a name".
3. Crop din: Year, Season ar `maize`. **Dekhben:** gach ashe, timeline table e crop dekhay.
4. Browser tab bondho korte jan. **Dekhben:** "Leave site?" warning. Cancel chapun.
5. **Save** → **Confirm and save**, tarpor reload. **Dekhben:** shob theke gache.
6. **Map** view e jan.
   - **Dekhben:** flat map e field ar zone.
   - Test 11 er pore **Data footprints** chaple NASA grid cell ar satellite pixel dekhabe.
7. **Inspect** panel khulun.
   - **Dekhben:** history, **soil observation**, evidence coverage, Evidence page er link, ar **All records** link.
   - Console e `<div>` inside `<p>` error ashbe na (P5 er pore thik kora).
8. Phone width e panel ta niche **Field details** naame thake, khole ar bondho hoy.

## 10. All records `/fields/[id]/records` (P2, P3, P5)

1. **Crop history:** **planting ar harvest date shoho** season jog korun.
   - Udahoron: Corn 2023 (05-01 → 10-15) ar Soybeans 2024 (05-12 → 10-02).
   - Planting er age harvest date din. **Dekhben:** error.
2. **Soil observations** (soil er tothyo ekhanei den):
   - Ajker tarikh e pH `6.5` diye **Add observation** chapun. **Dekhben:** list e ashe.
   - pH `20` din. **Dekhben:** error.
   - Bangladesh field e (Test 13 er step 2 te korben) ei value gulo din:
     - Property: **Available water capacity (cm/cm)**
     - Value: `0.15` (mane 150 mm per metre)
     - Top: `0`, Bottom: `100`
     - Zone: **whole field** (kono zone na)
     - Kind: **Lab / survey measurement**
   - US er baire simulation shudhu ei value tai soil water hishebe use korte pare. US e apnar nijer value SSURGO er age use hoy.
   - 0.7 cm/cm er beshi value din. **Dekhben:** error.
3. **Water and equipment:** option bachhun, save korun, reload korun. **Dekhben:** theke gache.
4. **Your priorities:** number bodlan, save korun, reload korun. **Dekhben:** theke gache.
5. **Scenarios:** candidate crops `maize, soybean` diye `Test 1` naame scenario banan. **Dekhben:** list e ashe.

## 11. Evidence `/fields/[id]/evidence` (P4, P7)

1. US field er Evidence page khulun. **Dekhben:** shob source e "Not fetched yet", kono number nai.
2. **Refresh all** chapun.
   - **Dekhben:** Queued → Running → Up to date, page nije nije update hoy.
   - NASA POWER kichu minute e shesh hoy. MODIS greenness **Refresh all e nai** (Optional lekha). Lagle tar row te **Fetch greenness** chapun, prothombar 2–3 minute.
3. Shesh hole ei card gulo **dekhben**:
   - frost days, hot days, dry spells;
   - normal er tulonay brishti ar temperature;
   - root-zone soil wetness;
   - greenness (NDVI);
   - **SSURGO theke soil water capacity** (shudhu US e).
   - Prottek card e ekta class thake: **Observed (satellite)**, **Model-derived** ba **Survey / ground**.
4. Kono card e **How is this measured?** chapun. **Dekhben:** source, unit, bochhor, area ar limit, shohoj bhashay.
5. Chart e **Show as table** chapun. **Dekhben:** ekই number table e. Tarpor **Show chart** chapun.
6. Ei page er map dekhun.
   - **Dekhben:** apnar field.
   - Boro square ta POWER er cell. Lekha thake "value describes the whole area".
   - Chhoto square gulo MODIS pixel.
7. Bangladesh field e Refresh all chapun.
   - **Dekhben:** weather ar satellite data kaj kore.
   - SSURGO **"Not available here"** dekhay. Eta thik.
8. P7: kono source fail korle message ta chhoto ekta bakko hoy. Kokhono HTML/XML error page dekhay na.

## 12. Scenario ar run `/scenarios/[id]` (P5)

US field ta use korun. Ete Test 11 er evidence ar Test 10 er crop history thakte hobe.

1. `Test 1` khulun. **Scenario settings** e:
   - crops: `maize, soybean, oats, winter wheat`;
   - planting calendar: **USDA NASS 2010: Iowa**;
   - days between harvest and planting: `7`;
   - **Save scenario** chapun. **Dekhben:** "Scenario saved".
2. Planting window er **Plant from** e `13-40` din. **Dekhben:** "Use MM-DD". Row ta khali kore save korun.
3. **Run simulation** chapun. **Dekhben:** Queued → Finished. Live site e worker er jonno ektu wait korte hoy.
4. **Open result** chapun. Run page khulbe (Test 14).
5. Ekhane ferot eshe **Re-run and compare** chapun. **Dekhben:** "Re-run gave an identical result".
6. **Rainfall change (%)** `-20` din, save korun, run korun. **Dekhben:** "Scenario: rainfall -20%" section, jekhane water supply kom.
7. `dragon fruit` jog kore run korun. **Dekhben:** rejected list e "Not in the crop catalogue" lekha. Alternative hishebe ashbe na.

## 13. Result e soil, Bangladesh (P5, P6)

1. Bangladesh field e **AWC soil observation chara** run korun.
   - Crops: `rice, wheat`.
   - Nijer planting window din, jemon rice 06-15 theke 120 din, wheat 11-20 theke 110 din.
   - **Dekhben:** soil water capacity **unknown**. Water indicator shudhu potential demand. Ekta data gap e lekha soil nai.
2. Test 10.2 er moto hubohu AWC `0.15` observation din, tarpor abar run korun.
   - **Dekhben:** **Why this option?** ar **Full details** e soil water capacity **150 mm per metre**, source **"Your soil test (date, 1 depth, lab or survey)"**.
   - Ekhon water supply ar irrigation need hishab hoy.
   - Shudhu zone e deওয়া value, ba Top ar Bottom soman hole, engine value ta neয় na. Soil unknown e thake.
3. Nijer planting window na dile US er baire crop "No local planting window" diye reject hoy. Eta thik.

## 14. Run page `/runs/[id]` (P5, P6, P7)

1. **Replay** tab
   - **Dekhben:**
     - existing practice ar duita alternative pashapashi;
     - "Illustrative 3D…" lekha;
     - ekta tarikh;
     - slider er niche ▲ planting / ▼ harvest chinho.
   - P7: replay khalি matir din diye khole na. Existing practice e foshol thaka din diye khole.
   - **Play / Pause**, speed, **Next planting / Next harvest** try korun.
   - Slider e click kore → arrow key chapun. **Dekhben:** ek din agay, **Selected date** table o shathe bodlay.
   - Khali din e lekha thake "Bare field: no crop on this day".
   - Brishtir din e pani porte dekhay, kintu reduced motion on thakle na.
   - Matir rong shukhno ar bhija bojhay (legend ache).
   - **One at a time** chepe onno option bachhun. **Monthly summary (table)** khulun.
   - Ghurano por Reset view chapun. **Dekhben:** field gulo abar pura frame e ashe.
2. **Compare** tab
   - **Dekhben:**
     - shob option e ekই bochhor ar ekই soil value;
     - prottek number er unit;
     - "not probabilities" lekha.
   - **Workload** slider sorান. **Dekhben:** order bodlate pare, **Preview** lekha ashe. Tarpor **Undo** chapun.
   - **Save these priorities and run again** chapun.
     - **Dekhben:** "Priorities saved and a new run queued".
     - Holud note ashe je ei run er pore input bodleche, shathe **Run again with current inputs**.
3. **Why this option?** tab. **Dekhben:**
   - kono option keno oi rank e;
   - existing practice er cheye ki bhalo ba kharap, unit shoho;
   - planting date ar tar source;
   - kon evidence use hoyeche (POWER er bochhor, **soil value ar tar source**, crop dataset);
   - ki bad deওয়া hoyeche, data gap, local expert ke ki proshno korben;
   - **Words used here** naame shobdo-r mane.
4. **Plain-language explanation** tab.
   - **Dekhben:** "Generated from the stored result (no AI)".
   - AI key na thakle "AI drafting is not configured" dekhay. Eta thik.
5. **Full details** tab. **Dekhben:** soil water capacity, evidence ar soil retrieval id, assumption, hash.
6. **Save and export** tab.
   - Plan name diye **Save plan** chapun. **Dekhben:** "Plan saved".
   - **Download run file (JSON)** chapun. **Dekhben:** file download hoy.

## 15. Saved runs `/runs` (P5, P6)

1. **Dekhben:**
   - **Saved plans** e apnar plan;
   - run gulo, notun ta upore, status ar Open result shoho;
   - scenario ar snapshot.
2. Sign out kore abar sign in korun, saved plan ta khulun. **Dekhben:** hubohu ekই result.
3. Settings e বাংলা kore run ta abar khulun. **Dekhben:** tab, button ar tarikh Banglay. Technical note English e thake, ar sheta lekha o thake.

## 16. Privacy, delete, phone (P2, P3, P7)

1. **Privacy**
   - Account A hishebe farm, field, scenario ar run er link copy korun.
   - Sign out kore Account B banan, link gulo paste korun. **Dekhben:** **Not found**, Account A er kono naam ba shape nai.
   - Account B er Farms ar Workspace khali.
   - Sign out kore browser Back chapun. **Dekhben:** kono private data nai.
2. **Delete**
   - Records page e tick na diye **Delete field** chapun. **Dekhben:** kichu hoy na.
   - Tick diye Delete chapun. **Dekhben:** field nai hoye gache.
   - **Delete farm** eo ekই bhabe korun.
3. **Phone** (390 px, F12 → phone icon). Ei page gulo khulun: home, sample, workspace, records, evidence, scenario, run page.
   - **Dekhben:**
     - page kokhono pashe scroll hoy na;
     - lekha pora jay, button chapa jay;
     - map e "© OpenStreetMap contributors" lekha;
     - run page e ek shathe ekta option.
4. **Keyboard:** Tab chepe chepe page e ghurun. **Dekhben:** prottek control e spashto focus outline.

---

## Egulo bug na (expected)

- Result shudhu purono weather e option er tulona. Yield, profit ba forecast nai.
- 3D gach, tar uchchota ar matir rong stored number er chobi, asol photo na. Mati flat.
- Graphics card chara computer e (software rendering) 3D dhir, mot 10–15 FPS, ar Low quality te shuru hoy. Table ar Map view thik kaj kore.
- `ANTHROPIC_API_KEY` chara AI explanation "not configured".
- Worker na chala porjonto job **Queued** thake. Live site e GitHub worker shuru hote kichu minute lagte pare.
- MODIS greenness optional, prothombar 2–3 minute ney. Simulation e lage na.
- SSURGO soil shudhu US e ache. Onno desh e All records page e nijer soil test (Available water capacity) din. SoilGrids unavailable.
- Canola (Australia) ar kichu crop (jute, mustard, chickpea er stage) er FAO-56 stage data nai. Tai oder water indicator bad jay.
- Bangla mode e record form, evidence lekha, methodology ar engine note English e thake.
- Chhoto evidence chart e "1991–2020 avg" label uchu bar er upore pore jete pare.
