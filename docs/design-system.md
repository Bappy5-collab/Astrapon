# Astrapon design system

Art direction: a calm, sophisticated agricultural simulation studio. Near-realistic materials on simple, readable geometry; restrained colour; strong type; no decorative clutter. The 3D field is the stage and the HTML/MUI interface frames it.

Source of truth: `src/theme/tokens.ts` (values), `src/theme/theme.ts` (MUI theme), `src/theme/contrast.ts` (pairings, enforced by `contrast.test.ts`).

## Colour

| Token | Value | Role |
|---|---|---|
| `forest[900]` (forest) | `#102B22` | App bar, dark sections, display headings |
| `forest[500]` (leaf) | `#3F6B4B` | Links, overlines, focus ring on light surfaces |
| `lime[400]` (accent) | `#C7E77A` | Active nav, selected states, highlights. **Fill only on light surfaces, never text.** |
| `neutral[100]` (surface) | `#F5F6F0` | Page background (elevation 0) |
| `neutral[0]` | `#FFFFFF` | Raised panels (elevation 1) |
| `neutral[900]` (ink) | `#14231B` | Body text |
| `neutral[700]` / `[600]` | `#48514A` / `#5E6759` | Secondary / caption text |
| `clay` | `#A3412C` | Errors, destructive actions |
| `amber` | `#8A5A00` | Warning text |
| `sky` | `#DCE4DF` | 3D scene background and fog |

Crop colours (`CROP_FORM_COLORS` in `src/domain/farm/crops.ts`) are illustrative fills for plant forms. They are not reflectance or NDVI colours, and they are never used as text.

### Contrast (WCAG 2.x), every pairing the UI uses

Values are a direction, not a guarantee; this table is what was actually checked. Generated from `PAIRINGS` and asserted in `src/theme/contrast.test.ts`.

| Use | Text | Background | Ratio | Needs |
|---|---|---|---|---|
| Body text on surface | `#14231B` | `#F5F6F0` | 15.03:1 | 4.5:1 |
| Body text on raised panel | `#14231B` | `#FFFFFF` | 16.33:1 | 4.5:1 |
| Secondary text on surface | `#48514A` | `#F5F6F0` | 7.57:1 | 4.5:1 |
| Secondary text on raised panel | `#48514A` | `#FFFFFF` | 8.23:1 | 4.5:1 |
| Subtle text (captions) on raised panel | `#5E6759` | `#FFFFFF` | 5.90:1 | 4.5:1 |
| Subtle text on sunken surface | `#5E6759` | `#ECEEE5` | 5.04:1 | 4.5:1 |
| Leaf text (links, overlines) on surface | `#3F6B4B` | `#F5F6F0` | 5.66:1 | 4.5:1 |
| Leaf text on raised panel | `#3F6B4B` | `#FFFFFF` | 6.15:1 | 4.5:1 |
| Surface text on forest (header, hero) | `#F5F6F0` | `#102B22` | 13.89:1 | 4.5:1 |
| Muted text on forest | `#CDD2C3` | `#102B22` | 9.78:1 | 4.5:1 |
| Accent text on forest | `#C7E77A` | `#102B22` | 10.89:1 | 4.5:1 |
| Accent text on deepest forest (footer) | `#C7E77A` | `#0A1D16` | 12.61:1 | 4.5:1 |
| Muted text on deepest forest (footer) | `#CDD2C3` | `#0A1D16` | 11.33:1 | 4.5:1 |
| Forest text on accent (active nav, chips) | `#0A1D16` | `#C7E77A` | 12.61:1 | 4.5:1 |
| Surface text on primary button | `#FAFBF7` | `#173A2D` | 12.03:1 | 4.5:1 |
| Surface text on leaf fill | `#FAFBF7` | `#3F6B4B` | 5.92:1 | 4.5:1 |
| Danger text on raised panel | `#A3412C` | `#FFFFFF` | 6.27:1 | 4.5:1 |
| Warning text on raised panel | `#8A5A00` | `#FFFFFF` | 5.93:1 | 4.5:1 |
| Ink text on scene background | `#14231B` | `#DCE4DF` | 12.60:1 | 4.5:1 |
| Ink text on accent-200 (selected rows) | `#14231B` | `#E4F3BC` | 13.88:1 | 4.5:1 |
| Focus ring (leaf) against surface | `#3F6B4B` | `#F5F6F0` | 5.66:1 | 3:1 |
| Focus ring (accent) against forest | `#C7E77A` | `#102B22` | 10.89:1 | 3:1 |
| Input border against raised panel | `#7D8677` | `#FFFFFF` | 3.78:1 | 3:1 |
| Large display heading (forest) on surface | `#102B22` | `#F5F6F0` | 13.89:1 | 3:1 |

The accent on the light surface measures under 3:1, which is why it is never text there (also asserted).

Labels over the 3D scene sit on an opaque forest pill (`rgba(10,29,22,.84)`) or on the accent fill, so their contrast does not depend on what is rendered behind them.

## Typography

- Latin display: Fraunces (headings h1–h3). Latin body: Manrope.
- Bangla: Noto Serif Bengali (display) and Noto Sans Bengali (body), placed after the Latin faces in each font stack, so mixed English/Bangla lines keep a consistent size and weight.
- Minimum sizes: body 16px, secondary 15px, captions 13px. Rail labels are 12px (0.75rem) and always paired with an icon and an accessible name.
- Metrics use tabular figures (`numeric` token: `font-variant-numeric: tabular-nums`) so hectares and years align.

## Spacing, radius, elevation, motion

- Spacing: MUI unit = 8px. Allowed steps (`SPACE`): 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10 (4–80px).
- Radius: 6 (chips, small), 10 (inputs, buttons, list rows), 14 (cards, panels, viewport). Nothing fully rounded except the compass.
- Three elevations:
  1. **Flat:** page surface `#F5F6F0`, no shadow.
  2. **Raised:** white panel, 1px line, a soft 1–2px shadow.
  3. **Overlay:** translucent white with blur and a deep soft shadow, used only for controls floating over the 3D scene or map (`overlaySurface`).
- Motion: 120 / 200 / 320 ms with `cubic-bezier(0.2, 0, 0, 1)`. Under `prefers-reduced-motion` (or Settings → "Always reduce motion") CSS transitions collapse and the landing 3D sample stops turning. The workspace camera never moves on its own.

## Touch and focus

- Interactive targets are at least 40px tall (44px for map vertices via a transparent hit area, camera buttons, rail items).
- Focus ring: 3px leaf outline on light surfaces, accent on the dark app bar.
- Every 3D-conveyed fact has a text equivalent (zone list, year-by-zone timeline table, Inspect panel).

## Screen composition

- **Landing:** split hero (claim + actions + working location search | live 3D sample), the farmer problem, a four-step "How it works", the evidence/source explanation (computed grid-vs-field table), and a final call to action. No traction statistics or testimonials.
- **Workspace, desktop (≥900px):** compact top bar (field, farm, location, run state, Save with unsaved count) · 72px navigation rail (3D/Map, tools, links) · 316px collapsible crops/settings panel · central viewport · 340px Inspect/Evidence drawer (docked by default at ≥1536px, toggled below) · seasonal timeline under the viewport. At 1440px with the drawer closed the viewport takes about 75% of the width; about 50% with both side panels open.
- **Workspace, mobile:** top bar with Save and Inspect, full-width scene, a tool row directly below (view switch, tools, "Crops and settings"), the readable timeline, and a bottom sheet for inputs and evidence. While drawing, the drawing controls sit below the map, never over it.
- **Farmer path (Phase 8):** each field page opens with the step guide (forest header with the single next action and a progress bar, then six step tiles: done ✓, next on lime-200, optional, to do). Sections are cards with a 40px lime-200 badge (icon) and a status chip; optional inputs sit under a "More details" disclosure (native `<details>`, closed controls still submit); advanced and destructive cards are collapsed by default. Lists of fields are cards with progress and one primary action.
- **Result page:** the summary card comes first (forest header: "Ranked first" option; then better/worse lists on pale lime / pale clay, three actions, and a "Check it locally" note), then the tabs.
- Authentication, results, methodology and settings reuse the same surfaces, radii and type.

## 3D scene rules

- Flat terrain, labelled "Illustrative 3D · flat terrain · not satellite imagery" on every scene.
- No invented buildings, trees or relief. Original procedural plant models only; no external 3D assets are used, so no asset attribution is needed.
- Lighting: hemisphere + one warm directional light; soft shadows only at High quality; light fog for depth; no bloom or post-processing.
- Selection: lime outline, lime canopy tint and a translucent lime ribbon on the selected region's edges, plus a "Selected: …" chip.

## Map terms (checked 2026-10-31; Esri added 2026-11-05)

- Esri World Imagery (default "Satellite" base, chosen by the owner 2026-11-05): attribution "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community" is shown; Esri's terms of use apply and production use may need an ArcGIS account or key (`NEXT_PUBLIC_SATELLITE_TILE_URL` overrides the URL). Display only, never evidence.
- The map opens as a globe with a slowly turning Earth and flies to searched places; both stop with reduced motion (device or Settings).

- OpenStreetMap tiles: attribution shown, HTTPS, browser Referer kept, no prefetch/offline/bulk use; best effort with no SLA. Production traffic needs a commercial or self-hosted tile source (`NEXT_PUBLIC_OSM_TILE_URL` overrides the URL).
- NASA GIBS HLS (L30 + S30) 30 m true colour: public WMTS, no key, acknowledgement shown. Imagery is a drawing aid only, not evidence.
- Nominatim search: used under its usage policy with the owner's explicit acceptance (2026-10-31). Submit-only (no autocomplete), shared 1 request/second server queue, 24 h cache, identifying User-Agent, no personal data, ODbL attribution, `GEOCODER_DISABLED=1` kill switch.
