# Global acceptance cases

Three reproducible cases in contrasting climates, run live through the application path (user-scoped API, evidence worker, `request_simulation`, stored results) with `pnpm global:cases`. Output: `data/verification/global-cases.json` (generated 2026-11-02, engine 1.1.0, 24/24 checks).

**What these cases are:** software acceptance checks that the whole workflow works with verified environmental data outside one region, that unavailable inputs are reported as gaps, that the Southern Hemisphere and multi-crop years are handled without imposing one region's seasons, and that results reproduce exactly.

**What they are not:** agronomic validation. Three locations cannot establish that advice is correct anywhere. Crop histories, planting windows and one soil value are **supplied test assumptions**, labelled in the output. Rankings below are **exploratory** comparisons on past weather; nobody should plant from them.

Common settings: replay 2006–2025 (20 complete years of NASA POWER daily data in every case), rainfall −20 % as a separate hypothetical scenario, rainfed, a small drawn field (≈ 0.002° square).

| | Iowa, USA | Mymensingh, Bangladesh | Wagga Wagga, NSW, Australia |
|---|---|---|---|
| Location | 42.0° N, 93.8° W | 24.75° N, 90.40° E | 35.1° S, 147.4° E |
| Climate | Humid continental; one summer crop a year | Tropical monsoon; two or three crops a year; paddy rice | Temperate semi-arid, **Southern Hemisphere**; winter crops sown in autumn |
| NASA evidence | POWER daily T2M_MAX, T2M_MIN, PRECTOTCORR, v2.10.1, 1981-01-01 → 2026-10-31, ½° × ⅝° cell | same | same |
| Soil water capacity | USDA SSURGO survey, 0–100 cm: 191 mm/m | **Unknown** (no SSURGO outside the US, no soil test) → potential demand only, stated as a gap | 140 mm/m from a soil value entered as a farmer report — **supplied test assumption** |
| Planting calendar | USDA NASS 2010, Iowa (published regional calendar) | **None available** in Astrapon; windows typed as a farmer would — **supplied test assumptions** | **None available**; windows typed as a farmer would — **supplied test assumptions** |
| Existing practice (dated test history) | Maize → Soybean | Boro rice + Aman rice (same year) | Wheat → Canola |
| Alternatives found (target two; never invented) | 3 | 3 | 3 |
| Top option (relative score among the four) | Oats + winter wheat (0.626); existing 0.350 | Rice + lentil (0.657); existing 0.111 | **Existing practice** (0.542) |
| Stability over sensitivity cases | Fragile | Stable | Stable |
| Top under −20 % rainfall | Same as historical | Same as historical | Existing practice |
| Day-by-day replay window | 2024–2025 | 2025 | 2024–2025 |
| Re-run of the same snapshot | identical hash | identical hash | identical hash |

## What each case shows (and its uncertainty)

**Iowa.** The full US path: NASS calendar, SSURGO soil, water-limited relative water supply (existing practice 0.941; alternatives 0.953–0.996). The alternatives add winter wheat, which lowers bare-field days (210 → 140–174 days/year) but exposes the crop to many more frost days (≈ 71 vs 0.6 days/year; reported, not scored, because frost during wheat dormancy is not damage). The ranking is **fragile**: the top option changes in at least one sensitivity case, and the UI says so.

**Bangladesh.** Multi-crop years with farmer windows and no regional calendar. Paddy rice is potential-only by method, and soil water capacity is unknown, so water use is reported as the climatic balance (rain − crop demand: existing 593.6 mm/year; rice + lentil 539.6; lentil alone −230.3), and the gap is listed. Jute and mustard have no FAO-56 coefficients, so their water indicators are missing, which removes those indicators from the scored comparison for all options. Hot-day exposure differs strongly (existing 24.6 days/year, jute + lentil 19.4, rice + lentil 0.7). The ranking depends heavily on the supplied windows.

**Wagga Wagga (Southern Hemisphere).** Autumn sowing in April–June is handled on the same calendar line as northern crops; nothing assumes a hemisphere. Canola has no FAO-56 stage lengths in Astrapon's catalogue, so the existing practice has no relative water supply; that indicator is therefore **dropped for every option** (common inputs), and the existing practice ranks first on structure indicators alone. This is the honest behaviour, but it means water was not compared here — a material limitation for a dryland location. Adding sourced canola stage lengths would change this case.

## Reproduce

```bash
pnpm global:cases       # needs the dev project keys in .env.local and network access; ~2–4 minutes
```

The script creates throwaway users, fetches the evidence through the worker, runs and re-runs each scenario, writes the JSON and deletes the users.
