# Astrapon – Farmer hishebe main goal test (Banglish)

Ei guide e account, privacy, phone, delete eshob test nai. Shudhu app er **asol kaj** test hobe, ekjon krishok er chokhe. (Phase 8 er notun, shohoj UI onujayi likha.)

**App er goal (ek line e):**
> "Amar field, ager foshol, NASA er weather data, panir shimit shubidha ar amar priority dekhe kon kon rotation (foshol-chokro) shombhob, ar prottek tar labh-khoti ki?"

Tai app ke 5 ta kaj thik moto korte hobe:
1. jekono deshe field khuje boundary aka;
2. ager foshol, mati, pani ar priority neya;
3. NASA data diye purono bochhor gulo **replay** kora;
4. "jodi brishti kom hoy?" erokom **what-if** chalano;
5. apnar **ekhonkar rotation** ke **2 ta alternative** er shathe tulona kora, karon shoho.

**Kivabe test korben:** age theke sign in kora thakun. Prottek step e **✔** holo ja dekhar kotha. Na mille page er naam, ki korechilen ar ki dekhlen likhe rakhun, shathe screenshot.

**Golpo:** apni Mymensingh er ekjon krishok. Protibochhor borsha te dhan (Aman), shite gom koren. Apni jante chan ei rotation er cheye bhalo kono option ache kina.

---

## Step 0 – Prothom dekha
1. Upore menu dekhun.
   - ✔ shudhu farmer er shobdo: **My fields**, **Results**, **Try a sample**, **How it works**, **Settings**.
2. **My fields** khulun.
   - ✔ field na thakle boro card: "Add your first field" ar **Add a field** button.

## Step 1 – Amar field ta app e tola (goal 1)
1. **Add a field** chapun, `Mymensingh` search korun.
   - ✔ map Mymensingh e jay.
2. Map e 4–5 ta corner click kore **Finish shape** chapun.
   - ✔ field er outline ar **hectare** e area dekhay.
3. Name din (`Dhan khet`), Farm e **New farm…** bachhe `Amar khamar` likhun, tick din, tarpor save korun.
   - ✔ field 3D te dekhay. Mouse diye ghurano, zoom ar **Reset view** kaj kore.
   - ✔ 3D gach **illustrative** lekha, asol chobi na.
4. 3D view er upore dane **Next steps →** chapun.
   - ✔ field er page khole, upore gaRho shobuj **"Your next step"** box.
   - ✔ 6 ta step: field ✓, ki chash korechen, mati ar pani, priority, weather, crop option tulona.
   - ✔ "1 of 6 done" progress bar.

## Step 2 – Ami ki chash kori, amar mati, pani ar priority (goal 2)
Field er page e (step guide er niche) section gulo ek ek kore:

1. **What you grew** – apnar ekhonkar rotation din:
   - Crop `Rice`, Year `2023`, Planted `2023-06-15`, Harvested `2023-10-13` → **Add season**
   - Crop `Wheat`, Year `2023`, Planted `2023-11-20`, Harvested `2024-03-10` → **Add season**
   - ✔ duita season list e ashe; section er chip e "2 seasons recorded".
   - ✔ tarikh chara season dile chip e lekha "no planting and harvest dates", ar step ta done hoy na.
2. **Your soil** – mati porikkhar fol:
   - What was measured: **Available water capacity** (age thekei bachha thake), Value `0.15`, Sampled on jekono tarikh → **Add soil test**.
   - ✔ list e ashe, depth `0–100 cm` (default). Bangladesh e soil survey nai, tai ei value tai use hobe.
3. **Water and machines** – Irrigation **No irrigation (rain only)** ba ja shotti → **Save water and machines**.
4. **What matters most to you** – prottek goal er jonno "Doesn't matter … Most important" bachhun (jemon "Manageable workload" = **Very important**) → **Save priorities**.
5. Page reload korun.
   - ✔ shob theke jay, ar upore progress bar bareche.

## Step 3 – NASA amar field shomporke ki bole (weather)
1. Step guide e **Get weather for your field** er **Get weather** chapun (ba upore **Weather and soil data**).
2. **Refresh all** chapun.
   - ✔ status Queued → Running → Up to date (POWER kichu minute).
   - ✔ MODIS greenness "Optional" lekha, Refresh all e nai. Dekhte chaile **Fetch greenness** (prothombar 2–3 minute). Tulonar jonno wait korte hobe na.
3. Card gulo dekhun:
   - ✔ frost/heat days, brishti, dry spell, root-zone soil wetness.
   - ✔ SSURGO card e **"Not available here"** – eta thik, Bangladesh US na.
   - ✔ prottek card e evidence class lekha (satellite / model / farmer report ityadi).
4. Ekta card e **How is this measured?** chapun.
   - ✔ source, bochhor, resolution ar limit dekhay.
5. **Back to the field steps** chapun.
   - ✔ weather step e ✓.

## Step 4 – Kon rotation shombhob? (goal 5)
Field page er **Compare crop options** section e:

1. Name `Dhan-gom vs onno`, Crops to consider `rice, wheat, maize` → **Create comparison**.
   - ✔ comparison page khole.
2. **Crops and settings** e **When you plant each new crop**:
   - Crop `rice`, Plant from `06-15`, Plant until `06-30`, Days to harvest `120`
   - Crop `wheat`, Plant from `11-20`, Plant until `12-05`, Days to harvest `110`
   - maize er tarikh **dibe na** (eta test).
   - **Save settings** → ✔ "Settings saved".
3. Upore **Run comparison** chapun.
   - ✔ Queued → Finished, tarpor **Open result** button.
4. **Open result** chapun.
   - ✔ shobar upore **"What the comparison found"** card: kon option **Ranked first**, ar **Better than / Worse than your current rotation** list.
   - ✔ "Also compared" e baki option gulo.
   - ✔ **Check it locally** box: replay, forecast na.
   - ✔ maize **Technical details** tab e rejected, karon **"No local planting window"**. App nijer theke tarikh banay na.
   - ✔ 2 tar kom alternative ashle app **keno** kom ta bole. Banano option dekhay na.

## Step 5 – Purono bochhor gulo replay (goal 3)
Summary card e **Watch the seasons** chapun (ba ei naamer tab):
1. **Play** chapun, slider tanun.
   - ✔ tarikh bodlay, gach bare, ▲ planting / ▼ harvest chinho ache.
   - ✔ khali diner jonno "Bare field: no crop on this day".
2. Niche **Selected date** table:
   - ✔ shohoj column: Growth stage, Water the crop needs, Water the crop got, Soil water used up, Irrigation.
   - ✔ **Show technical columns** on korle Kc, Ks, Drainage o ashe.
3. ✔ kothao lekha: eta **purono weather er replay, forecast na**.

## Step 6 – "Jodi brishti 20% kom hoy?" (what-if, goal 4)
1. Breadcrumb er **Settings** e jan. **What if the weather changes?** box e **Rainfall change (%)** `-20` din → **Save settings** → **Run comparison**.
2. Notun result khulun.
   - ✔ weather choice e "rainfall -20%" ache, water supply kom dekhay.
   - ✔ water stress / irrigation need bariche (ba keno barlo na tar karon ache).

## Step 7 – Amar priority bodlale ki hoy?
Summary card e **Change what matters to you** (ba **Compare and rank** tab):
1. ✔ shob option e **eki bochhor, eki mati**; prottek number er **unit**; "not probabilities" lekha.
2. **Workload** slider sorান.
   - ✔ order bodlate pare, upore **Preview** lekha.
   - ✔ **Undo** chaple ager order ferot.
3. **Save these priorities and run again** → ✔ "Priorities saved and a new run queued".

## Step 8 – Keno ei option? (krishok bujhte pare kina)
1. Summary card e **See why** chapun.
   - ✔ **Why this option?** tab khole, oi option bachha.
   - ✔ existing practice er cheye ki bhalo / ki kharap, unit shoho;
   - ✔ planting date ar tar source (apnar deওয়া window);
   - ✔ soil **150 mm per metre**, source **"Your soil test"**;
   - ✔ data gap, ar **local adviser / krishi officer ke ki proshno korben**.
2. **Explanation** tab:
   - ✔ shohoj bhashay summary. AI key na thakle "not configured" – eta thik.

## Step 9 – Plan save kore pore abar khola (same result)
1. **Save and export** tab e plan name diye **Save plan** → ✔ "Plan saved".
2. **Download run file (JSON)** → ✔ file download hoy.
3. Menu te **Results** khulun.
   - ✔ **Saved plans** e apnar plan; **Comparisons you ran** e run ta, **Open result** button shoho.
   - ✔ plan khulle hubohu eki result, eki number.
4. Comparison page e **Re-run and compare** chapun.
   - ✔ "Re-run gave an identical result".
5. **My fields** e jan.
   - ✔ field card e "5 of 6 done" (ba 6 of 6), "Results ready", ar **See results** button.

## (Optional) Step 10 – US er ekjon krishok
Full data (SSURGO soil + USDA calendar) shoho tulona dekhte:
1. `Ames, Iowa` te field banan; seasons: Corn 2023 `05-01 → 10-15`, Soybeans 2024 `05-12 → 10-02`.
2. Weather page e **Refresh all** → ✔ ebar SSURGO soil card o ashe; field page er **Your soil** chip e "Soil survey found".
3. Comparison: crops `maize, soybean, oats, winter wheat`, Planting calendar **USDA NASS 2010: Iowa**, run korun.
   - ✔ existing ar 2 ta alternative, soil source **SSURGO**.
4. `dragon fruit` jog kore run korun → ✔ rejected, "Not in the crop catalogue".

---

## Final check – goal puron holo kina
Shob shesh e nijeke proshno korun. Shob "ha" hole main goal kaj korche:

| Proshno | Ha / Na |
|---|---|
| Kothay ki korte hobe, app nijei bole dilo (next step)? | |
| Amar field ta thik jaygay, thik area shoho ache? | |
| Amar ager foshol, mati ar priority result e use hoyeche? | |
| NASA data kotha theke ashlo ta dekhte parchi? | |
| Purono bochhor replay korte parchi? | |
| Brishti kom hole ki hoy ta dekhte parchi? | |
| Result er upore ek nojore bujhlam kon option prothom, ar keno? | |
| Save kore abar khulle eki result? | |

**Egulo bug na:**
- Result e **yield, profit ba forecast nai** – app iccha kore dey na.
- 3D gach illustrative, satellite chobi na.
- Live site e job shuru hote kichu minute lage.
- Bangladesh e SSURGO nai; nijer soil test lage.
- Planting window na dile US er baire crop reject hoy.
- Kom alternative ashle app karon bole – eta shothik behaviour.
- "Soil and water" ar "priorities" step **optional**; egulo na korleo "next step" tader skip kore weather e jay.
