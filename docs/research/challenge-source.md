# Challenge source verification

Checked: 2026-10-30.

## Official challenge page

- **Title:** Field Shift: Adapting Farms with NASA Data
- **Event:** 2026 NASA Space Apps Challenge
- **Details URL:** https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/
- **Resources tab URL:** https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=resources
- **Listed difficulty:** Advanced and Intermediate.
- **Listed subjects:** Arts & Multimedia, Earth Science, Software.

How it was retrieved:

- The page was loaded through headless Chrome, which validated TLS against the Windows certificate store.
- `curl` failed certificate verification (exit 60) because of its own CA bundle. Certificate checks were **not** bypassed.
- A URL found in search results (`/2026/challenges/field-shift-adapting-farms-with-nasa-data/`) returns the site's "Page Not Found". The working slug was found on the official `/2026/challenges/` index.

**Match verification:** the page describes a decision-support tool that combines NASA Earth observations with local soil information, crop characteristics, and farmer priorities to explore crop-rotation strategies. That matches FieldShift's product question.

## Resources gap

On 2026-10-30 the Resources tab says resources will be available on Friday, 13 November. **No official resource list exists yet.** The dataset selection below is therefore our own choice, grounded in the challenge text. The Resources tab must be re-checked after 13 November 2026 and this document updated.

## Faithful summary of the challenge text (not a quotation)

**Goal.** Build a decision-support tool. It should help farmers explore rotation strategies that may improve soil health and resilience to changing weather and water conditions, using NASA Earth observations together with local soil information, crop characteristics, and farmer priorities.

**Background.** A crop that helps soil in one place may:
- use too much water,
- introduce disease,
- conflict with local markets, or
- fall outside the growing season elsewhere.

**Datasets named as options ("may explore").**
- SMAP, ECOSTRESS, GPM, Landsat, MODIS, NASA POWER, GRACE/GRACE-FO, SRTM or other NASA elevation products.
- The harmonisation note also mentions GEDI biomass.

**Patterns named as options.** Temperature, heat stress, rainfall, soil moisture, evaporation, frost risk, extreme precipitation, vegetation stress, long-term water trends.

**Farmer priorities named as options.**
- Water use, forage value, nitrogen fixing, erosion reduction, organic matter.
- Market suitability.

**Optional outputs.**
- Typical bare-field times, vulnerable seasons, pest-cycle interruption opportunities.
- Comparing **at least three rotation strategies, including the existing one** (phrased with "may").
- For each strategy: why it was suggested, supporting evidence, benefits, information gaps, and risks needing local review.

**Intended outcome.** The tool supports, and does not replace, farmer judgment and local expertise.

**"Potential Considerations" (explicitly optional).**
- Explain scientific terms.
- Explain how satellite observations differ from ground measurements.
- Explain how the model handles uncertainty.
- Optional harmonisation of resolutions to a common grid.
- Maps and timelines, scenario sliders for rainfall or temperature.
- Farmer input of priorities and constraints.

## What is and is not an official requirement

- The page uses "may", "you may consider", and "may (but are not required to)" throughout. **No judging criteria appear on the challenge page.** We do not invent any.
- The C1–C8 requirements in `docs/challenge-alignment.md` are our faithful structuring of this text.
- Three-strategy comparison, specific missions, AI ("SI" on the page), and harmonisation are suggestions. FieldShift adopts three-strategy comparison as a product target, without inventing infeasible alternatives.
