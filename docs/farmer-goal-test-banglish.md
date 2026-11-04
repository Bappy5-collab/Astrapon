# Astrapon – Farmer hishebe main goal test (Banglish)

Ei guide e account, privacy, phone, delete eshob test nai. Shudhu app er **asol kaj** test hobe, ekjon krishok er chokhe.

**App er goal (ek line e):**
> "Amar field, ager foshol, NASA er weather/satellite data, panir shimit shubidha ar amar priority dekhe kon kon rotation (foshol-chokro) shombhob, ar prottek tar labh-khoti ki?"

Tai app ke 5 ta kaj thik moto korte hobe:
1. jekono deshe field khuje boundary aka;
2. ager foshol, mati, pani ar priority neya;
3. NASA data diye purono bochhor gulo **replay** kora;
4. "jodi brishti kom hoy?" erokom **what-if** chalano;
5. apnar **ekhonkar rotation** ke **2 ta alternative** er shathe tulona kora, karon shoho.

**Kivabe test korben:** age theke sign in kora thakun. Prottek step e **✔** holo ja dekhar kotha. Na mille page er naam, ki korechilen ar ki dekhlen likhe rakhun, shathe screenshot.

**Golpo:** apni Mymensingh er ekjon krishok. Protibochhor borsha te dhan (Aman), shite gom koren. Apni jante chan ei rotation er cheye bhalo kono option ache kina.

---

## Step 1 – Amar field ta app e tola (goal 1)
1. **Farms** page e farm banan (name `Amar khamar`, country `BD`).
2. **Create my field** e `Mymensingh` search korun.
   - ✔ map Mymensingh e jay.
3. Map e 4–5 ta corner click kore **Finish shape** chapun.
   - ✔ field er outline ar **hectare** e area dekhay.
4. Name din (`Dhan khet`), farm bachhun, tick din, tarpor **Save field and open workspace** chapun.
   - ✔ field 3D te dekhay. Mouse diye ghurano, zoom ar **Reset view** kaj kore.
   - ✔ kothao lekha ache 3D gach **illustrative**, asol chobi na.

## Step 2 – Ami ki chash kori, amar mati, pani ar priority (goal 2)
Workspace e **Inspect → All records** khulun.

1. **Crop history** – apnar ekhonkar rotation din:
   - Rice: `2023-06-15` → `2023-10-13`
   - Wheat: `2023-11-20` → `2024-03-10`
   - ✔ duita season list e ashe.
2. **Soil observation** – apnar mati porikkhar fol:
   - Property: **Available water capacity**, Value `0.15`, Top `0`, Bottom `100`, Zone: **whole field**.
   - ✔ list e ashe. (Bangladesh e SSURGO nai, tai ei value tai matir pani dhoron khomota hishebe use hobe.)
3. **Water and equipment** – apnar irrigation/jontro er obostha bachhun, save korun.
4. **Your priorities** – jemon "kom kaj (workload)" beshi, "pani bachano" beshi – number bodle save korun.
5. Page reload korun.
   - ✔ history, soil, water ar priority sob theke jay.

## Step 3 – NASA amar field shomporke ki bole (evidence)
1. Field er **Evidence** page e **Refresh all** chapun.
   - ✔ status Queued → Running → Up to date (POWER kichu minute).
   - ✔ MODIS greenness "Optional" lekha, Refresh all e nai. Dekhte chaile **Fetch greenness** chapun (prothombar 2–3 minute). Simulation er jonno wait korte hobe na.
2. Card gulo dekhun:
   - ✔ frost/heat days, brishti, dry spell, root-zone soil wetness; greenness fetch korle NDVI (shobujota). Bangladesh e megh beshi, tai NDVI peak "insufficient" ashte pare – eta thik.
   - ✔ SSURGO card e **"Not available here"** – eta thik, Bangladesh US na.
   - ✔ prottek card e evidence class lekha (satellite / model / farmer report ityadi), mishano na.
3. Ekta card e **How is this measured?** chapun.
   - ✔ source, bochhor, resolution ar limit dekhay.

## Step 4 – Kon rotation shombhob? (scenario + simulation, goal 5)
All records → **Scenarios** e notun scenario banan (`Dhan-gom vs onno`).

1. Settings:
   - crops: `rice, wheat, maize`;
   - planting window (nijer): rice `06-15` theke 120 din, wheat `11-20` theke 110 din;
   - maize er window **dibe na** (eta test).
   - **Save scenario** → ✔ "Scenario saved".
2. **Run simulation** chapun.
   - ✔ Queued → Finished.
3. **Open result** chapun.
   - ✔ **existing practice** (apnar dhan-gom) ar alternative pashapashi.
   - ✔ maize rejected list e, karon **"No local planting window"**. App nijer theke tarikh banay na – eta thik.
   - ✔ jodi 2 tar kom alternative ashe, app **keno** kom ta lekhe. Banano option dekhay na.

## Step 5 – Purono bochhor gulo replay (goal 3)
Result page er **Replay** tab:
1. **Play** chapun, slider tanun.
   - ✔ tarikh bodlay, gach bare, ▲ planting / ▼ harvest chinho ache.
   - ✔ khali diner jonno "Bare field: no crop on this day".
   - ✔ brishtir din e pani pore, matir rong shukhno/bhija bojhay.
2. ✔ kothao lekha: eta **purono weather er replay, forecast na**.

## Step 6 – "Jodi brishti 20% kom hoy?" (what-if, goal 4)
1. Scenario te ferot jan, **Rainfall change (%)** `-20` din, save kore abar run korun.
2. Notun result khulun.
   - ✔ "Scenario: rainfall -20%" section ache, water supply kom dekhay.
   - ✔ ager result er cheye water stress / irrigation need bariche (ba keno barlo na tar karon ache).

## Step 7 – Amar priority bodlale ki hoy? (tulona)
**Compare** tab:
1. ✔ shob option e **ekই bochhor, ekই mati** use hoyeche; prottek number er **unit** ache; "not probabilities" lekha.
2. **Workload** ba onno priority slider sorান.
   - ✔ order bodlate pare, upore **Preview** lekha.
   - ✔ **Undo** chaple ager order ferot.
3. **Save these priorities and run again** chapun.
   - ✔ "Priorities saved and a new run queued".

## Step 8 – Keno ei option? (krishok bujhte pare kina)
1. **Why this option?** tab:
   - ✔ option ta keno oi rank e;
   - ✔ existing practice er cheye ki bhalo / ki kharap, unit shoho;
   - ✔ planting date ar tar source (apnar deওয়া window);
   - ✔ soil **150 mm per metre**, source **"Your soil test"**;
   - ✔ data gap, ar **local expert / krishi officer ke ki proshno korben**.
2. **Plain-language explanation** tab:
   - ✔ shohoj bhashay summary. AI key na thakle "not configured" – eta thik.

## Step 9 – Plan save kore pore abar khola (same result)
1. **Save and export** tab e plan name diye **Save plan** chapun → ✔ "Plan saved".
2. **Download run file (JSON)** → ✔ file download hoy.
3. **Saved runs** page theke plan ta abar khulun.
   - ✔ hubohu ekই result, ekই number.
4. Scenario page e **Re-run and compare** chapun.
   - ✔ "Re-run gave an identical result".

## Step 10 – Bangla te dekha
**Settings** e Language **বাংলা** korun, run page khulun.
- ✔ menu, tab, button ar tarikh Banglay.

## (Optional) Step 11 – US er ekjon krishok
Full data (SSURGO soil + USDA calendar) shoho tulona dekhte:
1. `Ames, Iowa` te field banan; history: Corn 2023 `05-01 → 10-15`, Soybeans 2024 `05-12 → 10-02`.
2. Evidence **Refresh all** → ✔ ebar SSURGO soil card o ashe.
3. Scenario: crops `maize, soybean, oats, winter wheat`, calendar **USDA NASS 2010: Iowa**, run korun.
   - ✔ existing ar 2 ta alternative, soil source **SSURGO**.
4. `dragon fruit` jog kore run korun → ✔ rejected, "Not in the crop catalogue".

---

## Final check – goal puron holo kina
Shob shesh e nijeke proshno korun. Shob "ha" hole main goal kaj korche:

| Proshno | Ha / Na |
|---|---|
| Amar field ta thik jaygay, thik area shoho ache? | |
| Amar ager foshol, mati ar priority result e use hoyeche? | |
| NASA data kotha theke ashlo ta dekhte parchi? | |
| Purono bochhor replay korte parchi? | |
| Brishti kom hole ki hoy ta dekhte parchi? | |
| Amar rotation vs alternative tulona korte parchi? | |
| Keno, ki gap, karo shathe ki alap korbo – bujhlam? | |
| Save kore abar khulle ekই result? | |

**Egulo bug na:**
- Result e **yield, profit ba forecast nai** – app iccha kore dey na.
- 3D gach illustrative, satellite chobi na.
- Live site e job shuru hote kichu minute lage.
- Bangladesh e SSURGO nai; nijer soil test lage.
- Planting window na dile US er baire crop reject hoy.
- Kom alternative ashle app karon bole – eta shothik behaviour.
