# Implementation status

Last updated: 2026-10-31, end of Phase 3 (prompt 3: art-directed 3D UI and field interaction).

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Phase 0 foundation | Done | Scaffold, theme and shell, env validation, module boundaries. |
| Challenge source verified | Done | `docs/research/challenge-source.md`. The Resources tab publishes 13 Nov 2026 and must be re-checked. |
| Data source research | Done (Phase 1) | `docs/research/data-sources.md`, registry `src/domain/sources/`, `/sources`. |
| NASA POWER, MODIS (ORNL), USDA SSURGO clients | **Live-verified** (Phase 1) | `src/server/providers/`, `data/verification/*.json`. |
| IMERG / SMAP / NASADEM adapters | Pending (next phase) | Credentials are configured; the registry stays `credential_blocked` until adapters pass content checks. |
| Dev Supabase, schema, RLS, auth | Done (Phase 2) | 5 migrations applied. `pnpm db:verify` passes 14 checks. |
| Design system | **Done (Phase 3)** | `docs/design-system.md`, `src/theme/tokens.ts`; 24 text/background pairings tested in `contrast.test.ts`; Latin + Bangla font stacks; three elevations; tabular numerals; reduced motion. |
| Landing page | **Done** | Working location search (usable before 3D loads), live 3D sample hero, farmer problem, workflow with honest per-step status, grid-vs-field evidence table, no invented statistics. |
| Public sample | **Done** | `/sample`. Invented outline and records, labelled everywhere. Edits are saved to this browser only and survive reload; "Reset sample" restores it. |
| Location | **Done** | Place search via Nominatim (submit-only, server queue 1 req/s, cache, attribution, kill switch); typed coordinates (decimal, N/S/E/W, DMS); device location only on button press, with denial/timeout/unsupported messages. |
| Boundary and zone drawing | **Done** | Leaflet map on OSM streets or NASA GIBS HLS 30 m imagery (date picker + "nearest earlier" search). Click/tap corners, finish, drag, midpoint insert, select + delete, undo, cut-out areas (holes), keyboard "add point at centre". Confirmation step before saving. |
| Geometry rules | **Done** | Local ECEF→ENU frame; holes inside shells; no overlapping parts; ±85° latitude; ≤ 30 km extent; antimeridian-crossing fields rejected with an explanation (adjacent fields work). Zones stay inside the field, checked at commit even when the boundary changes in the same save. |
| 3D field workspace | **Done** | `/fields/[id]`: real field and zones in local metres, flat illustrative terrain, original instanced crop forms per recorded crop, illustrative growth stages, orbit/pan/zoom, compass with reset, camera buttons, click/tap or list selection with a lime outline, tint and edge ribbon, quality presets, WebGL fallback, context-loss restart. |
| Crops, history, save | **Done** | Assign a crop per zone or whole field, year and season; year × zone timeline table; Inspect drawer with history, soil and evidence coverage. All edits saved atomically by `save_field_workspace` after a summary dialog. The full record forms moved to `/fields/[id]/records`. |
| Saved runs, methodology, settings | **Done** | `/runs` (scenarios + snapshots; honest "no runs: engine not built"), `/methodology`, `/settings` (language, 3D quality, motion). |
| Bangla interface | Partial | Navigation, workspace controls, location search, settings and landing hero. Record forms, evidence text and methodology are English (stated in Settings). |
| Simulation engine (Phase 4) | **Pending** | Snapshots record engine `0.0.0-pre-engine`; no results exist and none are shown. |

## Verified in Phase 3

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (109 unit tests in 8 files), `pnpm build` pass.
  - New tests: local frame round-trip, metres vs degrees, antimeridian continuity; boundary holes, overlaps, extent, latitude and antimeridian rejection; coordinate parsing; crop forms (English, Bangla, Banglish); crop resolution and timeline; save-payload validation; sample zones inside the sample field; source coverage vs field size; WCAG contrast of every pairing.
- `pnpm db:rehearse` then `pnpm db:migrate` applied `20261031100000_field_workspace.sql`. `pnpm db:types` regenerated types. `pnpm db:verify`: 14/14 (5 migrations recorded, anon cannot execute the new RPC, no SECURITY DEFINER).
- `pnpm test:db`: 13/13. The new test covers one atomic save (boundary + new zone + crops referencing it); re-assigning updates instead of duplicating; a boundary that leaves a zone outside rolls back the whole batch; the same boundary with the zone deleted succeeds; another user cannot save to the field, reference its zone, or delete it.
- End-to-end on the production build (puppeteer, headless Chrome with SwiftShader), 30/30, run twice:
  - sign-in redirect and return;
  - geolocation denial message;
  - real Nominatim search;
  - coordinates;
  - map attribution;
  - drawing four corners on the map, finishing, dragging a vertex;
  - confirmation and save of a new field and farm;
  - 3D canvas with the illustrative label and honest run state;
  - drawing a zone, naming it, assigning two crops, timeline cells;
  - unsaved count;
  - confirmation summary;
  - save, then reload with zone and crops persisted;
  - records page;
  - 390 px mobile with no horizontal overflow, bottom sheet and evidence;
  - Bangla labels with `lang="bn"`;
  - throwaway user deleted;
  - no console errors and no unexpected dialogs.
- State checks, 16/16:
  - clicking a zone in the 3D scene selects it;
  - keyboard zone selection;
  - growth stages;
  - sample save → reload → reset;
  - keyboard-only zone drawing;
  - NASA imagery date search;
  - forced WebGL context loss → restart;
  - reduced motion stops the hero turning;
  - with WebGL disabled, the sample and landing show fallbacks and keep their tables.
- Screenshots inspected at 1440, 1024 and 390 px for the landing, sample, sign-in, methodology, settings, workspace hub, sources, new-field flow, saved workspace and Bangla workspace pages. No horizontal overflow and no console errors.
- Only the owner's 2 accounts remain in the dev project.

## Defects found and fixed in Phase 3

- Hydration mismatch (#418) on the sample at desktop width: the layout branch used a client-only media query. A placeholder now renders until the width is known.
- After a successful save, leaving within ~2 s raised a false "unsaved changes" prompt and the Save button still showed the old count. The post-save state now clears both immediately.
- The drei `<Html>` zone label threw `removeChild` when the workspace remounted after save. Replaced with an HTML overlay chip.
- A stray-looking 3D north-arrow mesh was removed; the HTML compass is the north indicator.
- The quality selector's floating label clipped over the scene. Replaced with a compact select.
- The field outline had low contrast on the street map. Added a white halo.
- The default NASA imagery date usually had no tile. Streets is now the default; choosing NASA imagery searches back for the nearest date with a tile.
- The stage toggle and timeline header were clipped at 1024 px; they now wrap. Rail labels raised to 12 px.
- A caption string was corrupted by a shell edit and has been rewritten.

## Known limitations

- HLS imagery is 30 m, is date-specific and may be cloudy. It is a drawing aid, not evidence. Small fields are better drawn on the street map or imported as GeoJSON.
- Public OSM tiles and Nominatim are best-effort services, suitable for development only. Production needs a commercial or self-hosted provider (URLs are configurable; `GEOCODER_DISABLED=1` switches search off).
- Fields crossing the 180° meridian are not supported (explained to the user).
- Crop forms are chosen from the crop name; unknown names use a generic form. Plants are drawn larger than life at an illustrative density.
- Growth stages are illustrative controls, not observations.
- Bangla covers the interface chrome only.
- A zone shape edit that leaves the zone partly outside the field is caught by the client pre-check (~1 m) and finally by the database.
- Not-found for another user's record is still served with HTTP 200 (streamed page, no data).
- Live provider verification still covers one location (Iowa, USA).
