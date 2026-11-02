# Submission draft and demo script

**Status: draft for the owner to edit.** The official 2026 Project Submission Guide (spaceappschallenge.org/resources/project-submission-guide) could not be read from this environment, so field names and length limits below are **assumptions**: a short summary (~100 words), a longer description (~500 words) and a demo of about 30 seconds to 2 minutes. Check the guide and trim before submitting. Do not add impact statistics, awards, endorsements or expert validation that do not exist.

## Short summary (draft, ~100 words)

Astrapon helps a farmer compare crop rotations for their own field before planting. You draw the field, record what you grew, and Astrapon fetches NASA POWER daily weather (and US soil survey data) for that exact location. A transparent, versioned engine replays the existing rotation and feasible alternatives on the same past weather with the FAO-56 water balance, applies the farmer's water limits, exclusions and planting windows, and ranks options by the farmer's priorities. A 3D replay, tables and a "Why this option?" view explain the tradeoffs, gaps and questions for a local expert. It is a comparison on past weather, not a forecast.

## Description (draft, ~500 words)

**Problem.** Farmers adapting to changing seasons need to test a new rotation without risking a season. Global datasets exist, but they describe grid cells, not a farmer's field, history or constraints, and most tools hide how a recommendation was reached.

**What Astrapon does.** A farmer (or an agronomist with them) locates the field anywhere in the world, draws its boundary, and records crop history with dates, soil tests, water availability, equipment and priorities. For that field, a background worker retrieves NASA POWER daily temperature and precipitation (1981 onwards) and MODIS MOD13Q1 greenness, and, in the United States, SSURGO soil water capacity. Each value is stored with its source, version, period, resolution and completeness, and can be inspected.

The rotation engine (TypeScript, deterministic, version 1.1.0) builds the farmer's existing rotation from dated history and searches alternatives that respect hard constraints first: excluded crops, market access, local planting windows (the farmer's own dates, or the USDA NASS calendar in the US — never another region's seasons), harvest-to-planting turnaround, the canola return interval and the seasonal water allocation. Each option is replayed on the same 20 years of weather with FAO-56 reference evapotranspiration (Hargreaves), crop coefficients and a daily root-zone water balance that is checked for conservation. Indicators — relative water supply or irrigation need, bare-field days, family repetition, legumes, diversity, frost and heat exposure — are combined with the farmer's priority weights into relative scores among the options shown. Sensitivity cases (dry start, coefficient ranges, driest and wettest years) say whether the order is stable or fragile. A hypothetical scenario (e.g. 20% less rain) is reported separately from the historical replay.

**How a farmer sees it.** The run page replays each option day by day in an illustrative 3D view, side by side with the existing rotation, with a timeline, planting and harvest markers and a table of the day's values. The comparison table states the common inputs and units. A priority preview shows how the order changes with other weights before anything is saved. "Why this option?" lists the reasons, the evidence, planting dates and their sources, what was ruled out, data gaps and questions for a local expert. A plan can be saved; it stays tied to the exact stored result and can be exported with its inputs and hashes. Re-running the same inputs gives a byte-identical result.

**Honesty by design.** Missing data stays missing. Outside the US, soil water capacity is unknown unless the farmer enters a soil test, and the result says so. Astrapon does not predict yield, profit or soil outcomes, and its scores are not probabilities. An optional AI explanation can only restate the stored result and cite its sources.

**Built with.** Next.js, React Three Fiber, Material UI, Supabase (PostgreSQL, PostGIS, row-level security), NASA POWER, MODIS (ORNL DAAC), NASA GIBS, USDA SSURGO/NASS/PLANTS, FAO-56, OpenStreetMap. English and Bangla interface.

**Verification so far.** Software verification only: unit tests of the equations (FAO-56 worked example, conservation), reproducibility, two-user isolation, live traces from raw NASA responses to stored values, end-to-end tests with fresh accounts, and three exploratory cases (Iowa, Bangladesh, New South Wales). No field trial or agronomist validation has been done.

## Demo script (editable, ~2 minutes; uses the live application only)

| # | Screen | Action | Say |
|---|---|---|---|
| 1 | Home | Search a place or type coordinates (e.g. Ames, Iowa). | "A farmer starts from their own field, anywhere." |
| 2 | Draw field | Click the corners, finish, save. | "This is their boundary, not a grid cell." |
| 3 | Records | Show two dated seasons (corn, soybeans) and priorities. | "Their history and what matters to them." |
| 4 | Evidence | Show NASA POWER "Up to date", open "How is this measured?". | "Real NASA POWER daily weather for this location — source, period and resolution are shown." |
| 5 | Scenario | Iowa calendar, rainfall −20 %, Run simulation → Finished → Open result. | "The decision: keep corn–soybean, or change?" |
| 6 | Replay | Press Play; scrub to a summer day; point at the selected-date table. | "Existing practice and two alternatives on the same days. Every number in 3D is in this table." |
| 7 | Compare | Point at common inputs; move the Water use slider (preview). | "Changing an assumption — the farmer's priority — changes the order, before anything is saved." |
| 8 | Why this option? | Show better/worse vs existing practice with units. | "An explained tradeoff: less bare soil, but the same plant family twice." |
| 9 | Scenario toggle | Switch Historical replay ↔ Scenario: rainfall −20 %. | "A hypothetical drier climate, shown separately from history." |
| 10 | Save and export | Save plan; download JSON; (optionally) Re-run and compare → identical. | "The result is saved and reproducible, bit for bit." |
| 11 | Data gaps | Show a gap line (e.g. irrigation not recorded / soil unknown outside the US). | "One honest uncertainty: this is past weather at a coarse grid cell, not a forecast — check it locally." |

Record the demo on the deployed site after the owner has pushed and redeployed the release commit. Do not use a separate scripted showcase.
