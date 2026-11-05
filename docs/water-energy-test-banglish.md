# Water & Energy feature — Banglish test guide

Ei guide shudhu **Water & Energy** feature (Phase 10) test korar jonno. Prottek step-e ki korben ar ki dekhar kotha, dewa ache. ✅ = eta dekhle thik ache.

---

## 0. Shuru korar age

1. Duto terminal kholen:
   - Terminal 1: `pnpm dev` → browser-e `http://localhost:3000`
   - Terminal 2: `pnpm evidence:worker` (weather/soil download ar comparison run eta-i kore — eta chalu rakhben)
2. Sign in korun.

> Internet lagbe: OpenStreetMap, NASA POWER, USGS, Hub'Eau, IGRAC — sob live service.

---

## 1. Test field banano (US — sobcheye shohoj, karon soil data automatic ashe)

1. **My fields** → notun field → location search box-e coordinate likhun: `42.03, -93.62` (Ames, Iowa).
2. Map zoom korun (zoom 13+ na hole corner boshbe na), 4 ta corner click kore choto ekta field anken → finish → save.
3. Field page-e (**field steps**) ei gulo din:
   - **What you grew:** 2023 Corn (planting 2023-05-01, harvest 2023-10-15), 2024 Soybeans (2024-05-12 → 2024-10-02).
4. **Weather and soil data** page → **Refresh all** chapun → worker shesh hole NASA POWER ar SSURGO "up to date" dekhabe (1–3 minute).

## 2. Irrigated comparison chalano (pani-r chahida eta theke ashe)

1. Field page → **Compare rotations** → notun comparison.
2. Settings:
   - Candidate crops: maize, soybean, oats, winter wheat
   - Calendar region: **Iowa**
   - **Irrigation: "Fully irrigated"** ← eta khub important. "Rain only" dile irrigation need hisab hoy na.
3. **Save settings** → **Run the comparison** → worker run shesh korbe (5–20 second).

✅ Result page khulbe, current rotation + alternatives dekhabe.

---

## 3. Water & Energy page khola

Field page-er upore **Water & Energy** button chapun.

✅ Upore lekha: "An Astrapon extension … (not a NASA requirement or endorsement)".
✅ Page khulle **nijei** tin ta jinish load hoy (kono button chapte hoy na):
- Mapped water (OpenStreetMap) — list ashbe "… mapped water feature(s) within 3.0 km"
- Groundwater providers
- "Sunshine by month (NASA POWER, 2016–2025)"

> OpenStreetMap server busy thakle hoyto lekha ashbe "service is busy … not 'no water'". Eta bug na — 1 minute por **Search mapped water** abar chapun.

## 4. Nodi/pukur source select

1. **River, canal or pond** tab-e list theke ekta source select korun (ba map-e blue line/shape-e click).
   - ✅ Distance lekha thake: river line hole "to the mapped centreline (the bank is closer …)", pukur/lake hole "to the mapped water outline". Field-e lege thakle "touches the field (0 m)".
   - ✅ Map-e field theke source porjonto dotted sada line.
   - ✅ Step 3-e **Pipe route length** nijei bhore jabe, niche lekha "Straight-line minimum; a real route is longer".
2. **Search within** 1 km / 10 km bodle **Search mapped water** chapun → ✅ map-er dashed sada boundary (searched area) boro/choto hobe.
3. Optional: "I use a source that is not on the map" tick diye nijer pukur-er nam ar distance likhe dekhun.
4. **Delivery point above water, low** = 2, **High** = 4 likhun.

## 5. Result ana

1. Step 2-e **From a comparison** → apnar irrigated comparison select.
   - ✅ Lekha thakbe kotogulo option ar proti ta-r "mm/yr median net".
2. Step 3-e **Fill empty boxes with starting values** chapun.
   - ✅ Pipe diameter, efficiency, PR egulo bhore jabe — egula "starting value", apnar machine-er tottho na.
3. Niche **What it means for each rotation** section dekhun:
   - ✅ Prottek rotation-er alada card (current + alternatives).
   - ✅ Water to pump per year, Median / dry year, Peak month, Flow, Total head, Pump power, Energy per year, PV needed — range akare (jemon "6,484–6,796 kWh").
   - ✅ Kono option-er replay window-e irrigation na lagle "0 m³" dekhate pare — eta thik (oi bochhor brishti beshi chilo).
   - ✅ Pipe choto hole holud warning: "…% of the pump's head … lost to pipe and fitting friction".

## 6. Assumption bodle dekha

1. **Pumping hours per day** 6 → 10 korun.
   - ✅ Pump power onek kome jabe (flow kom, friction kom), result sathe sathe update hobe.
2. **Advanced engineering inputs** khulun → pipe diameter 50 → 100 korun.
   - ✅ Energy ar PV size onek kombe, friction warning chole jete pare.
3. Step 4-e **Source can give at most** = 50 m³/day likhun.
   - ✅ "Water supply" e "Exceeds the source capacity" + deficit dekhabe. Khali rakhle "Unknown (no source limit entered)".
4. Step 3-e **Is my PV enough?** → My PV array = 5 kWp.
   - ✅ "Lowest monthly solar coverage" % ar "Solar energy shortfall" dekhabe.

## 7. Well (groundwater) test

1. **Well (groundwater)** tab-e jan.
   - ✅ Provider list: **USGS** (records / older records), **GGMN** (consulted), ar Hub'Eau / BWDB / BoM "Outside this provider's coverage".
   - ✅ Map-e well-er dot: sobuj = recent record, amber = purono, dhushor = record nei.
2. **I don't know** select korun.
   - ✅ "Groundwater depth unavailable for this location…" — energy ase na, kintu pani-r hisab (m³) thake.
3. Ekta well select korun jar niche "… m below ground" lekha → **Use the selected nearby well as a proxy scenario**.
   - ✅ Lekha "Proxy from …, X km away … not a measurement at my field". Static level hole drawdown chaibe — low 2, high 5 din.
4. **Try a hypothetical depth range** → Shallowest 8, Deepest 15 (+ drawdown) → ✅ energy range ashbe.
5. **I measured my own well** → "Water level while pumping" → 10 likhun → ✅ drawdown chabe na (pumping level-e already ache).

## 8. Save, reload, reopen, export

1. **Name this version** = "Test v1" → **Save this version**.
   - ✅ "Saved as version N."
2. Page reload korun → niche **Saved versions**-e "vN · Test v1".
3. Oita-y click korun.
   - ✅ "Shown exactly as stored; nothing is recalculated", inputs-er list (hypothetical/proxy label soho), same number gulo.
4. **Export JSON** → file download hobe, bhitore `result_sha256` ache.
5. Comparison-er result page (Results → oi run) khulun.
   - ✅ Niche "Water & Energy for these options" table, "From saved version vN".

## 9. 3D ar mobile

1. Map-er upore **3D schematic** chapun.
   - ✅ Field, pump, pipe, source-er dik + distance label, PV panel, (tank dile) tank. Upore lekha "Schematic … illustrative … not live data".
   - ✅ Niche text list: Source, Pipe route, PV array, Tank.
   - Settings-e reduced motion on korle pipe-er flow animation bondho hobe.
2. Browser window phone-er moto choto korun (≈ 390 px).
   - ✅ Pash-e scroll hobe na, sob step niche niche.

## 10. Onno desh (location routing)

Prottek desh-e notun choto field banan (comparison chhara-o cholbe — step 2-e **Enter my own** diye daily m³ ar mash din).

| Coordinate | Ki dekhar kotha |
|---|---|
| `43.60, 1.44` (Toulouse, France) | ✅ **Hub'Eau** records (recent date), level "derived from level and ground elevation", kichu well-e "also shared via GGMN" |
| `-35.12, 147.37` (Wagga Wagga, Australia) | ✅ GGMN theke "Australia - Bureau of Meteorology" well; BoM direct "Not integrated yet" |
| `24.75, 90.40` (Mymensingh, Bangladesh) | ✅ GGMN "No monitoring wells…", BWDB "Data available only on request", ar "Groundwater depth unavailable…" — **"no groundwater" bola hobe na** |
| `-26.0, 28.0` (Johannesburg, South Africa) | ✅ National adapter nei, kintu GGMN theke South Africa DWS record |
| `-1.29, 36.82` (Nairobi, Kenya) | ✅ Shudhu GGMN consulted, kono well nei — spashto lekha |

✅ Ek field theke arek field-e gele ager selection/result thake na, notun location-er data load hoy.

## 11. Dwitiyo user (privacy)

1. Arek account diye sign in korun.
2. Prothom user-er Water page URL (`/fields/<id>/water`) ba saved version URL paste korun.
   - ✅ Not found / kichu dekhabe na.

---

## Problem hole

- Kono result na ashle section-e lekha thake "To calculate, add: …" — oi box gulo puron korun.
- "This comparison was run as rainfed…" → comparison **Fully irrigated** diye abar chalan.
- Provider error = temporary; ektu pore abar search chapun.
- Live provider-gulo command diye check: `pnpm water:trace`
