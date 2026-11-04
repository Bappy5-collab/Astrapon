# Astrapon – Main Feature Test (Banglish, ≈ 45 minute)

Shudhu main feature gulo thik kaj korche kina, sheta dekhar chhoto test. Prottek step e **✔** holo ja dekhar kotha. Na mille page, ki korechilen ar ki dekhlen likhe rakhun, shathe screenshot.

**Lagbe:** duita email (Account A, Account B).

---

## 1. Account (sign up / sign in)
1. **Sign in → Create an account**, Account A banan.
   - ✔ "Check your email…" dekhay.
2. Email er link e click korun.
   - ✔ link live site e khole, localhost e na.
3. Sign in korun.
   - ✔ **Your farms** page ashe.

## 2. Farm ar field banano
1. **Farms** page e farm name ar country `US` diye **Create farm** chapun.
   - ✔ farm list e ashe.
2. **Create my field** e `Ames, Iowa` search korun.
3. Map e 4–5 ta corner click kore **Finish shape** chapun.
   - ✔ field er outline ar hectare e area dekhay.
4. Field name din, farm bachhun, tick din, tarpor **Save field and open workspace** chapun.
   - ✔ field 3D te dekhay.

## 3. 3D workspace
1. Mouse diye ghuran ar zoom korun, tarpor **Reset view** chapun.
   - ✔ field pura frame e ferot ashe.
2. Ekta crop din (Year, Season, `maize`), **Save** → **Confirm and save**, tarpor reload korun.
   - ✔ gach dekhay, ar reload er poreo crop theke jay.

## 4. Records (history, soil, priority)
**Inspect → All records** khulun.
1. Crop history e duita season din, date shoho:
   - Corn 2023: 05-01 → 10-15;
   - Soybeans 2024: 05-12 → 10-02.
   - ✔ duitai list e ashe.
2. Soil observation e pH `6.5` din.
   - ✔ list e ashe.
3. Priorities bodle save korun, tarpor reload korun.
   - ✔ number gulo theke jay.

## 5. NASA evidence
1. Field er **Evidence** page e **Refresh all** chapun.
   - ✔ status Queued → Running → Up to date. NASA POWER kichu minute e.
   - ✔ MODIS greenness "Optional", Refresh all e nai. Lagle **Fetch greenness** chapun (prothombar 2–3 minute).
2. Kaj shesh hole card gulo dekhun:
   - ✔ frost/heat days, brishti, soil wetness, NDVI, soil water capacity (SSURGO);
   - ✔ prottek card e source er class.
3. Ekta card e **How is this measured?** chapun.
   - ✔ source, bochhor, area ar limit dekhay.

## 6. Simulation (rotation comparison)
1. All records → **Scenarios** e notun scenario banan.
2. Scenario te ei settings din, tarpor **Save scenario** chapun:
   - crops: `maize, soybean, oats, winter wheat`;
   - calendar: **USDA NASS 2010: Iowa**.
3. **Run simulation** chapun.
   - ✔ Queued → Finished.
4. **Re-run and compare** chapun.
   - ✔ "Re-run gave an identical result".

## 7. Result page
**Open result** chapun.
1. **Replay** tab e Play korun, slider tanun.
   - ✔ tarikh bodlay ar gach bare.
   - ✔ existing practice ar 2 ta alternative pashapashi dekhay.
2. **Compare** tab e ekta priority slider sorান.
   - ✔ order er upore "Preview" lekha ashe.
   - ✔ **Undo** chaple ager order ferot ashe.
3. **Why this option?** tab dekhun.
   - ✔ karon, planting date, soil value o source, ar data gap lekha thake.
4. **Plain-language explanation** tab dekhun.
   - ✔ ekta summary thake.
   - ✔ AI key na thakle "not configured" lekha thake. Eta thik.
5. **Save and export** tab e **Save plan** chapun, tarpor **Download JSON** chapun.
   - ✔ "Plan saved" dekhay ar file download hoy.
6. **Saved runs** page khulun.
   - ✔ plan ta list e ache.

## 8. Bangladesh (US er baire)
1. `Mymensingh` e field banan, tarpor Evidence page e **Refresh all** chapun.
   - ✔ weather ar satellite data ashe.
   - ✔ SSURGO "Not available here" dekhay. Eta thik.
2. Soil observation e ei value gulo din:
   - Property: **Available water capacity**
   - Value: `0.15`
   - Top: `0`, Bottom: `100`
   - Zone: whole field
3. Scenario banan:
   - crops: `rice, wheat`;
   - nijer planting window: rice 06-15 theke 120 din, wheat 11-20 theke 110 din.
4. Run korun.
   - ✔ result ashe.
   - ✔ Why tab e "150 mm per metre, Your soil test" lekha thake.

## 9. Bangla
1. **Settings** e Language **বাংলা** korun, tarpor run page khulun.
   - ✔ menu, button ar tarikh Banglay dekhay.

## 10. Privacy
1. Account A er run er link copy korun.
2. Sign out kore Account B banan, link ta paste korun.
   - ✔ **Not found** dekhay.
   - ✔ Account B er Farms khali.

## 11. Phone
F12 chapun, tarpor phone icon e 390 px bachhun. Home, workspace ar run page khulun.
- ✔ page pashe scroll hoy na.
- ✔ button chapa jay.

---

**Egulo bug na:**
- MODIS greenness optional; simulation e lage na.
- Live site e job shuru hote kichu minute lage.
- AI key nai.
- 3D gach illustrative, asol chobi na.
- Result forecast na, yield na.
