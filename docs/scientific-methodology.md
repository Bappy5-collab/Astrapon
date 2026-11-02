# Scientific methodology: simulation and rotation engine

Engine version **1.1.0** (`src/domain/simulation/engine-version.ts`). This document is the contract for the engine. Any change to a rule, equation or parameter here requires a new engine version. Saved runs keep the version they were computed with.

## 1. Purpose and scope

The engine answers one question:

> Which rotation sequences are feasible for this field under the farmer's constraints, and how do they compare on transparent indicators over the same historical weather?

It compares the **existing practice** (from the farmer's dated crop history) with up to **three agronomically distinct feasible alternatives**. It reports why other options were rejected and which priorities and constraints shaped the ranking.

**It does not predict** yield, profit, income, prices, soil carbon, nutrient balance, fertiliser savings, infiltration, erosion, pest or disease outcomes. Those quantities are never produced. Ranking scores are **relative scores among the options shown**. They are not probabilities, and they are not predictions of outcomes.

**Spatial unit.** The whole field. Zone-specific history is listed as a gap; zone-level rotations are not computed in v1.1.0.

**Time unit.** Daily steps, using calendar days. Results do not depend on the 3D frame rate: the engine has no rendering dependency.

## 2. Inputs and evidence classes

| Input | Source | Evidence class | If missing |
|---|---|---|---|
| Field geometry, latitude | Farmer-drawn boundary (snapshot) | farmer report | Engine refuses to run (no location). |
| Crop history (crop, year, season, planted/harvested dates) | Farmer records (snapshot) | farmer report | Baseline = unknown; alternatives are still listed, and the result asks for history. |
| Candidate crops, rotation length, replay years, irrigation assumption, planting windows, turnaround days, weather transformations | Scenario settings (snapshot) | hypothetical input | Defaults are listed in §8. |
| Irrigation availability and seasonal allocation | Farmer constraints (snapshot) | farmer report | Treated as unknown. No allocation constraint is applied, and this is listed as a gap. |
| Exclusions and priorities (0–5) | Farmer priorities (snapshot) | farmer report | All priorities are equal (3). This is stated. |
| Market preferences | Farmer records (snapshot) | farmer report | Market fit = unknown for that crop. |
| Daily Tmax, Tmin, precipitation | NASA POWER daily (pinned retrieval, normalised daily series) | model-derived | Water and exposure indicators are reported as *insufficient evidence*. |
| Plant-available water capacity (AWC) | Farmer lab value (`available_water_capacity`, cm/cm) if present; otherwise USDA SSURGO 0–100 cm (pinned retrieval) | ground measurement / survey | Water-limited uptake = insufficient evidence; only potential demand is shown. |
| Crop parameters | Reference dataset `crop-parameters` (pinned) | reference | Crop not in catalogue: not offered as an alternative; baseline indicators are partial. |
| Planting calendars | Reference dataset `usda-nass-usual-dates-2010` (pinned), farmer windows, farmer history dates | survey / farmer report | Crop cannot be scheduled: rejected with the reason "no local planting window". |

Unknown values stay unknown. The only estimation methods used are the ones listed in this document, and each is shown in the result as an assumption.

## 3. Parameter sources

All values below were checked against the primary source on 2026-11-01.

### 3.1 FAO Irrigation and Drainage Paper 56 (Allen et al., 1998)

Source: https://www.fao.org/4/x0490e/x0490e00.htm

- **Table 12** gives the crop coefficients Kc ini, Kc mid and Kc end.
  - Where an individual crop row leaves Kc ini blank, the group value is used, as Table 12's note states: "one value for Kc ini is listed and it is considered to be representative of the whole group".
  - Where the table gives a range (for example sorghum 1.00–1.10, cotton 1.15–1.20, rapeseed and sunflower 1.0–1.15), both ends are kept. The low end is used for rainfed crops, following footnote 9 for oil crops; for the other crops the midpoint is the base case. The low and high ends are both run as a sensitivity case.
- **Table 11** gives the lengths of the four crop development stages (initial, development, mid-season, late season).
  - These are **regional examples, not universal values**. Rows without a stated region are not used.
  - The engine uses Table 11 **only for stage proportions**, taken from the example whose total length is closest to the local season length. The season length always comes from local evidence (§4).
- **Table 22** gives the maximum effective rooting depth Zr (range) and the depletion fraction p.
  - Following footnote 1, the **larger Zr is used** because the engine models rainfed water stress.
  - p is adjusted daily with p = p_table + 0.04 (5 − ETc), limited to 0.1 ≤ p ≤ 0.8 (FAO-56, Table 22 footnote).

Crops with no Table 11 row (rapeseed/canola, chickpea) have no stage proportions. For them the engine returns *insufficient evidence* for daily water indicators rather than borrowing another crop's stages. Crops with no FAO-56 row at all (mustard, jute, rye, generic cover crops) are catalogued with their botanical family only.

### 3.2 USDA PLANTS Database

Source: https://plants.usda.gov, PlantProfile API, accessed 2026-11-01.

Botanical **family** for each catalogued crop is taken from the database's own family record. Jute (*Corchorus olitorius*) is listed as Tiliaceae in PLANTS. That record is kept, and the catalogue notes that APG IV places it in Malvaceae. Legumes are crops whose family is Fabaceae.

### 3.3 USDA NASS usual planting and harvesting dates (2010)

Source: *Usual Planting and Harvesting Dates for U.S. Field Crops*, USDA NASS, October 2010, https://esmis.nal.usda.gov/concern/publications/vm40xr56k. The raw text is committed at `data/reference/usda-nass-usual-dates-2010.txt`.

- Gives state-level begin, most-active and end dates for planting and harvesting.
- Used only when the farmer selects that US state as the calendar region in the scenario.
- The source states that the dates do not account for exceptionally early or late plantings or abnormal seasons.

**No calendar is imposed anywhere else.** Outside the US the farmer's own recorded dates, or windows they enter, are the only calendars. Bangladesh seasons (Aus, Aman, Boro, Rabi) are never applied to other places, and they are not applied in Bangladesh either unless the farmer's records or windows say so.

### 3.4 Rotation rules

- **Canola return interval.** Canola Council of Canada, Canola Watch (2021-01-13): at least one year in three for clubroot management, and one year in four largely removes blackleg yield-loss risk. Implemented as a hard constraint: rapeseed/canola at most once in any three consecutive years of the cycle. It is applied **only** to rapeseed/canola, the crop the source covers, not to other brassicas.
- **No other return-interval rule is imposed.** Crop-family repetition is reported as an indicator, not a rule. A change of family does not guarantee disease control (§6.3).

## 4. Scheduling and calendars

**Planting period.** A planting period is a crop, a planting date and a season length in days. Day arithmetic uses an absolute day index. Seasons that cross the calendar year (for example winter wheat planted in October and harvested in July, or a crop planted in December and harvested in May) are handled on the absolute timeline. A planting belongs to the calendar year in which it is planted.

**Sources for the planting date and season length, in order:**

1. **Farmer windows** in the scenario: plant-from, plant-to and length in days. The preferred date is the window midpoint.
2. **Farmer history** for that crop with both dates recorded. The preferred date is the median planted day-of-year. The length is the median recorded duration. The window spans the earliest to the latest recorded planting.
3. **NASS calendar** for the selected US state. The preferred date is the midpoint of the most-active planting range. The length runs from that date to the midpoint of the most-active harvesting range. The window runs from the planting begin date to the planting end date.

No other source is used. If none applies, the crop is rejected with the reason **"no local planting window"**, and the result asks the farmer for one.

**Hemisphere.** Dates come only from local sources, so no hemisphere assumption is needed for scheduling. Season names in the output are months (for example "Oct–Jul"), never "winter" or "summer".

**Sequencing rule.**

- In each year, plantings are scheduled in order.
- A planting starts at max(preferred date, previous harvest + turnaround). It must not start after its window end.
- The cycle is cyclic: the last harvest of the cycle plus the turnaround must not be later than the first planting of the next repetition.

**Turnaround days.** Entered by the farmer. If none is entered, 0 days is used and stated as an assumption, with the local-review question "How many days do you need between harvest and the next planting?".

## 5. Rotation logic

### 5.1 Hard constraints

Hard constraints are applied before any preference ranking.

| Code | Rule |
|---|---|
| `excluded` | The farmer excluded the crop. |
| `no_market_access` | The farmer recorded "no market access" for the crop. |
| `unknown_crop` | The crop is not in the catalogue. It is allowed only in the baseline. |
| `no_window` | No local planting window or season length (§4). |
| `overlap` | Plantings overlap, including turnaround, inside the cycle or across the cycle boundary. |
| `window_missed` | A planting would have to start after its window end. |
| `return_interval` | Canola return interval (§3.4). |
| `water_allocation` | Irrigation is available with a seasonal allocation, and the median-year net irrigation requirement of a year's plantings exceeds it. Applied only when the requirement can be computed (§6). |
| `fallow_year` | The sequence leaves the field without any crop for a whole year (a bare window of 365 days or more). Allowed only if the farmer lists "fallow" as a candidate or in their history. |

A rejected sequence is never shown as an alternative. The result lists rejection counts by reason and examples of rejected sequences.

### 5.2 Candidate generation

- The crops considered are the scenario's candidate crops plus the crops in the farmer's history, minus crop-level rejections.
- A year holds one to three plantings.
- Sequences have the scenario's rotation length, 1 to 4 years.
- Cyclic duplicates (A→B and B→A) are collapsed.
- Enumeration is exhaustive when the number of combinations is at most 50,000. Above that, a deterministic beam search keeps the 2,000 best partial sequences per year, using a fixed-scale proxy (crop and family diversity, cropped share of the year and plantings per year, weighted by the priorities). Partial sequences that already overlap are dropped. The result then states that the search was bounded.

### 5.3 Baseline (existing practice)

- The baseline is the farmer's last *rotation length* years of whole-field history, each planting scheduled with its recorded dates (or §4 sources if dates are missing).
- Years with no record make the baseline incomplete. The result asks for those years and never fills them in.
- The baseline is evaluated on the same weather and period as the alternatives. It is not rejected, but any hard-constraint conflicts it has are reported.

### 5.4 Choosing alternatives

- Feasible sequences are ranked by the farmer's priorities (§7).
- Alternatives are chosen in rank order. Each must differ from the baseline, and from alternatives already chosen, in its **set of crops**; reordering alone does not count.
- When the rotation length is 2 years or more, an alternative must contain at least two different crops. A single crop repeated every year is not offered as a rotation alternative.
- Up to three are shown.
- If fewer than two exist, the result says so and lists the constraints that removed the others.

## 6. Simulation

### 6.1 Weather, replay and transformations

**Historical replay** uses the pinned daily NASA POWER series for the replay years without changes.

A **scenario** applies explicit transformations to a copy of that series:

- precipitation × (1 + Δp/100), with Δp between −50% and +50%;
- temperature + ΔT applied to both Tmax and Tmin, with ΔT between −5 and +5 °C. This keeps Tmax ≥ Tmin.

Every transformation is recorded with its parameters. Applying the same transformation twice raises an error (double-application guard). Precipitation is clamped at ≥ 0. When a scenario has transformations, results are reported for both historical replay and the scenario.

**Missing days** stay missing (null):

- a planting period with any missing day in a year is excluded from that year's statistics;
- the number of excluded years is reported;
- at least 50% of the replay years must be complete, or the indicator is insufficient evidence.

### 6.2 Reference evapotranspiration

POWER daily data in the pinned series have temperature and precipitation but no humidity or wind. ET0 therefore uses the **Hargreaves equation (FAO-56 Eq. 52)**:

ET0 = 0.0023 (Tmean + 17.8) (Tmax − Tmin)^0.5 Ra   [mm/day]

- Tmean = (Tmax + Tmin)/2.
- Ra is extraterrestrial radiation as equivalent evaporation: 0.408 × Ra in MJ m⁻² day⁻¹ (FAO-56 Eqs. 20–25):
  - Gsc = 0.0820 MJ m⁻² min⁻¹;
  - dr = 1 + 0.033 cos(2πJ/365);
  - δ = 0.409 sin(2πJ/365 − 1.39);
  - ωs = arccos(−tan φ tan δ), clamped for polar day and night.
- The implementation reproduces FAO-56 Example 8: 3 September at 20°S gives Ra = 32.2 MJ m⁻² day⁻¹.

FAO-56 recommends verifying Eq. 52 against Penman-Monteith in each new region. That has not been done, which is a stated limitation. ET0 is set to 0 if Tmax < Tmin would make the square root undefined. Such days are flagged; they cannot occur after validation, because the series rejects them.

### 6.3 Crop evapotranspiration

**Potential crop ET** (no water limit) is ETc = Kc ET0. Kc follows the FAO-56 single-coefficient curve:

- constant Kc ini during the initial stage;
- linear to Kc mid over development;
- constant Kc mid during mid-season;
- linear to Kc end over the late season.

Stage lengths are the local season length × Table 11 proportions (§3.1).

**Kc ini for winter wheat.** The "frozen soils" value is used when the mean daily Tmin of the initial stage is ≤ 0 °C. Otherwise the "non-frozen soils" value is used.

**No climate adjustment.** Kc mid and Kc end are not adjusted for climate (FAO-56 Eq. 62), because that needs RHmin and wind speed, which are not in the pinned series. Table 12 values assume RHmin ≈ 45% and u2 ≈ 2 m/s. This is a stated limitation.

### 6.4 Root-zone water balance

The balance is FAO-56 Chapter 8, single coefficient. It runs once per planting period, separately for each period.

**Water-holding capacity:**

- Root depth Zr grows linearly from 0.15 m at planting to Zr,max at the end of development, then stays constant. The 0.15 m starting depth is an Astrapon modelling choice, stated in every result.
- TAW = AWC × Zr (Eq. 82), with AWC in mm per m. It is taken from the farmer lab value (cm/cm × 1000) or from SSURGO (mm in 0–100 cm ÷ 1 m).
- RAW = p TAW (Eq. 83).

**Daily balance:**

Dr,i = Dr,i−1 − P_i − I_i + ETa,i + DP_i (Eq. 85, with RO = 0 and CR = 0)

Ks is evaluated after the day's rain and irrigation have been added.

- Ks = 1 when Dr ≤ RAW. Otherwise Ks = (TAW − Dr)/((1 − p) TAW) (Eq. 84).
- ETa = Ks ETc (Eq. 81).
- Deep percolation (drainage) is DP = max(0, P + I − ETa − Dr,i−1) (Eq. 88).
- Dr is bounded to 0 ≤ Dr ≤ TAW (Eq. 86).
- When roots deepen, the newly added soil layer is assumed to be at the same relative depletion as the existing root zone. This keeps storage continuous. It is an Astrapon assumption.

**Runoff and capillary rise.** Runoff RO = 0. All rain enters the balance, and the excess over field capacity drains the same day. This **overstates the water available** on slopes and in intense storms. Capillary rise is 0, which FAO-56 says is appropriate when the water table is more than about 1 m below the root zone.

**Initial storage.** The base case starts at field capacity (Dr = 0), as FAO-56 suggests "following heavy rain or irrigation". The sensitivity case starts at Dr = RAW, the onset of stress.

**Irrigation.**

- Under full irrigation, net irrigation that refills Dr to 0 is applied whenever Dr > RAW. This is the FAO-56 management-allowed-depletion approach. The total is the **net irrigation requirement**.
- Under rainfed conditions, I = 0.
- "As recorded" follows the field constraints:
  - irrigation "none" means rainfed;
  - any other value means the requirement is computed and checked against the allocation;
  - irrigation unknown means rainfed, flagged as a gap.

**Conservation check.** For every period: Σ(P + I + G) − Σ ETa − Σ DP = ΔS. Here S is the stored available water (TAW − Dr), and G is the available water in soil newly explored as roots deepen. This is checked to 1e-6 mm in tests and at runtime. A failure aborts the run.

**Paddy rice.** FAO-56 gives p for rice as 0.20 *of saturation*, under flooded management. Ponding, puddling and percolation are not modelled. For rice the engine reports **potential ETc and rainfall only**, and water-limited uptake is insufficient evidence.

**Without AWC.** The engine reports only potential demand: ETc and rainfall during the period, and their difference, labelled "climatic water balance (no soil storage)". Water-limited uptake and the irrigation requirement are insufficient evidence.

## 7. Indicators, ranking and sensitivity

### 7.1 Indicators

All indicators are computed per strategy over the replay years.

| Indicator | Unit | Definition | Support |
|---|---|---|---|
| Scheduled bare-field days | days/year | Days in the cycle with no crop scheduled, ÷ cycle years | Definition (schedule only). Not a measure of observed bare soil. |
| Crop diversity | count | Distinct crops in the cycle | Bowles et al. 2020; Smith et al. 2023 (rotation diversity context, no effect size claimed) |
| Family diversity | count | Distinct botanical families | USDA PLANTS |
| Family repetition | count per cycle | Consecutive plantings (cyclic) of the same family | USDA PLANTS. A family change does not guarantee disease control. |
| Legume plantings | count per cycle | Plantings of Fabaceae crops | USDA PLANTS. No nitrogen credit is assumed (Zhao et al. 2022 caveat). |
| Deep-rooted plantings | count per cycle | Plantings whose FAO-56 Table 22 upper Zr is ≥ 1.5 m (Astrapon display threshold, not an FAO category) | FAO-56 Table 22 |
| Relative water supply (rainfed) | ratio 0–1 | Σ ETa / Σ ETc over all plantings, median across years, plus the driest-third mean | FAO-56 Ch. 8 |
| Net irrigation requirement | mm/year | Median and 80th percentile across years | FAO-56 Ch. 8 |
| Climatic water balance (no AWC) | mm/year | Σ (P − ETc) during plantings | FAO-56 Eq. 52 + Table 12 |
| Frost days in growing periods | days/year | Tmin ≤ 0 °C on scheduled crop days (air temperature, coarse cell). Reported, **not scored**: crop- and stage-specific critical temperatures are not sourced, and frost during winter dormancy is normal for winter cereals. | NASA POWER. Exposure only, not crop damage. |
| Hot days in growing periods | days/year | Tmax ≥ 35 °C on scheduled crop days. Reported, **not scored** (same reason). | NASA POWER. Exposure only. |
| Field operations | plantings/year | Plantings per year | Proxy for workload, stated as such. Labour hours are not estimated. |
| Market fit | share | Plantings with a farmer-stated "preferred", "acceptable" or contract market ÷ plantings with any stated preference | Farmer report. Unknown is shown separately. Not income. |
| Cover/legume opportunity | days | Longest scheduled bare window in the cycle and the month it starts. Reported, not scored. Together with the legume and deep-rooted counts it shows where a cover or legume crop could be considered. Whether a specific cover crop fits is a local-review question: cover crops in the catalogue have no sourced season lengths. | Schedule |

### 7.2 Ranking

The six farmer priorities (0–5) map to indicator groups:

| Priority | Indicator group |
|---|---|
| water use | Rainfed: higher relative water supply. Irrigated: lower irrigation requirement. Without AWC: climatic water balance. |
| soil health | Fewer bare days, fewer family repeats, more legume and deep-rooted plantings. These are *rotation-structure indicators*, not soil measurements. |
| diversification | Crop and family diversity. |
| weather risk | Smaller gap between median-year and driest-third water supply (or irrigation need). Frost and hot days are reported but not scored. |
| workload | Fewer field operations. |
| income stability | Market fit (stated preferences only). No income is computed. |

**Score:**

- Each indicator is min–max normalised to 0–1 across the strategies being compared, so that 1 is better. If all values are equal, it gets 0.5.
- Group score = mean of its available indicators. Score = Σ w·group / Σ w over groups with data.
- Indicators that are insufficient for any compared strategy are dropped for all, so that strategies are compared on common inputs. They are listed as gaps.
- (1.1.0) Indicators are rounded before they are scored, exactly as they are displayed: ratios and shares to 0.001, everything else to 0.1. The score is therefore a function of the published indicator table, and `scoreOptions()` reproduces the stored ranking from it (tested). Each run publishes its indicator definitions (key, priority group, direction, unit, scored or not).
- (1.1.0) The comparison page may *preview* other priority weights by calling the same `scoreOptions()` on the stored base-case table. A preview re-orders only the options already shown; it does not re-select alternatives or re-run the sensitivity cases, and it is labelled as unsaved. Saving the weights and running again is a separate, explicit action.

**Explanation.** The result shows each group's contribution to each strategy's score, and the rank order with each priority set to 0 in turn (priority ablation). That identifies which priorities changed the ranking.

### 7.3 Sensitivity and stability

The strategies are re-ranked under each case:

1. dry initial storage (Dr = RAW);
2. Kc low and Kc high, where the table gives a range;
3. driest third of replay years only (by precipitation during the plantings);
4. wettest third only.

**Classification:**

- **Stable:** the top-ranked strategy is the same in every case.
- **Fragile:** it changes in at least one case. The result lists the cases that change it.

No probability distributions are assumed or invented.

### 7.4 Data completeness

Completeness is reported as **counts of required inputs available**. Examples:

- "Crop parameters: 3 of 4 plantings";
- "Stage lengths: 2 of 4";
- "Soil water capacity: survey (SSURGO)";
- "Weather: 19 of 20 replay years complete".

It is never converted to a percentage labelled confidence.

## 8. Defaults and assumptions (shown in every result)

- Turnaround: 0 days unless the farmer enters a value.
- Initial storage: field capacity, with a dry-start sensitivity case.
- Runoff: 0. Capillary rise: 0.
- Root depth at planting: 0.15 m. Maximum: the FAO-56 Table 22 upper value.
- Kc: Table 12 without climate adjustment. Range midpoint, or the low end for rainfed oil crops.
- ET0: Hargreaves (Eq. 52), not calibrated locally.
- All priorities are 3 when the farmer has not set them.
- Whole field, with no zone-level rotation.

## 9. Reproducibility and storage

- A run reads only immutable inputs:
  - the input snapshot (scenario, field, history, constraints, priorities and markets, all frozen);
  - the pinned reference dataset versions (crop parameters, calendar);
  - the pinned evidence retrievals: the daily series and the SSURGO aggregate, rows that cannot be updated.
- The worker builds a canonical engine input from these and records its SHA-256 in the result.
- The engine is pure: no clock, no randomness, no I/O. The same input and engine version give byte-identical output. This is tested, and the "Re-run and compare" action checks it against the stored `result_sha256`.
- Results are stored in `simulation_results`, which cannot be updated, together with the engine version, the snapshot id and the input digest.

## 9a. Day-by-day timeline (added in 1.1.0)

Each run also publishes a timeline for the strategies it compares. It is display data for the 3D replay and the selected-date tables; it never feeds the ranking.

- **Window:** the most recent run of rotation-length calendar years inside the replay period in which every day has Tmax, Tmin and precipitation. If none exists, there is no timeline and the result says why.
- **Placement:** each planting's cycle-year offset is placed in those real years. The previous and next repetition of the cycle are also placed where they overlap the window, so a crop that crosses the cycle boundary is shown on both ends.
- **State:** each placed planting is run through the same FAO-56 code path as the indicators (§6.3–6.4; base case, starting at field capacity). The daily Kc, ETc, root depth, root-zone depletion (Dr/TAW), Ks, ETa, irrigation and drainage are stored. When soil water capacity is unknown, or the crop is potential-only, only Kc and ETc are stored.
- **Weather:** the window's daily precipitation, Tmax, Tmin and ET0, after any scenario transformation, are stored with the timeline.
- **Rounding:** Kc, root depth and Ks to 0.01; depletion to 0.001; water quantities to 0.1 mm.
- The 3D growth stage is derived from the FAO-56 stage lengths (initial, development, mid-season, late season); plant height is illustrative.

## 10. Computation bounds

- The replay window is at most 45 years. There are at most 12 candidate crops after merging history, at most 3 plantings per year and at most 4 rotation years.
- Water balances are computed once per (crop, planting slot, year, case) and reused across sequences.
- Search is limited as described in §5.2.
- Runs execute in the background worker (`pnpm evidence:worker` also processes simulation runs), never in a web request.
- A benchmark test bounds the time for a typical run; the measured times are listed in `docs/implementation-status.md`.

## 11. Validation and tests

`src/domain/simulation/*.test.ts` covers:

- unit conversions and FAO-56 Example 8;
- water balance conservation and storage bounds on synthetic cases: no rain, saturating rain, irrigation refill;
- missing inputs giving insufficient evidence;
- cross-year scheduling and cyclic overlap;
- every hard constraint;
- ranking changes when priorities change;
- transformation double-application and physical-range guards;
- identical-input reproducibility, byte for byte;
- a computation benchmark.

The engine has not been validated against field measurements of soil water or ET. Its outputs are planning-level comparisons for local review.

## 12. Known limitations

- Hargreaves ET0 is uncalibrated, and Kc has no climate adjustment.
- There is no runoff model, so water availability is overstated on slopes and in intense rain.
- Carry-over of soil water between plantings is not modelled; each planting starts from the stated initial storage. Bare-soil evaporation between crops is not modelled.
- Paddy rice water use is potential only.
- Calendars exist only for US states (NASS 2010, circa-2009 practice). Elsewhere they come only from the farmer's own dates.
- Crops without FAO-56 stage lengths or coefficients get partial indicators.
- The analysis covers the whole field only.
- Equipment needs and forage suitability are not modelled. They appear as local-review questions.
- Coarse weather (POWER cell ≈ 50 km) represents the whole field.
