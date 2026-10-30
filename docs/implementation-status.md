# Implementation status

Last updated: 2026-10-30, end of Phase 0.

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Project scaffold (Next.js 16.4.3 App Router, React 19.3.1, strict TS 6.0.3, pnpm 12.16.1) | Done | `pnpm dev / build / start / lint / typecheck / test` all configured |
| MUI 9.5 theme + responsive shell | Done | Tokens in `src/theme/tokens.ts`; Fraunces + Manrope via `next/font` |
| Landing page foundation | Done | Honest status copy, workflow with phase chips, evidence classes, guardrails |
| 3D preview (R3F 9.8 / Drei 10.7 / three 0.186) | Done (illustrative) | Instanced crop strips, orbit + button controls, WebGL fallback, software-renderer tier, offscreen pause |
| Loading/error/not-found boundaries | Done | `loading.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, scene error boundary |
| Env validation (public/server split) | Done | Value-free reports; `/setup` page and `/api/health` |
| Supabase client wiring | Done (unconfigured) | Browser/server clients return `null` without config; `proxy.ts` refreshes sessions only when configured |
| Module boundaries | Done | ESLint `no-restricted-imports` rules, verified by probe files |
| Provenance/evidence taxonomy | Done | `src/domain/provenance` with tests |
| Research decisions (Phase 1) | **Pending** | n/a |
| Authentication, schema, migrations (Phase 2) | **Pending** | No dev Supabase project designated yet |
| NASA/soil data integration (Phase 3) | **Pending** | n/a |
| Simulation engine (Phase 4) | **Pending** | `src/domain/simulation` intentionally empty |
| Real-data 3D simulator (Phase 5) | **Pending** | n/a |
| Comparison, explanations, saved runs (Phase 6) | **Pending** | n/a |
| Hardening (Phase 7) | **Pending** | n/a |

## Verified in Phase 0

- `pnpm lint`: pass (0 problems).
- `pnpm typecheck`: pass.
- `pnpm test`: 17 tests in 3 files pass (env parsing/no-secret-leak, provenance lineage, renderer classification).
- `pnpm build`: pass. `/` and `/workspace` are static; `/setup` and `/api/health` are dynamic.
- Production server checks:
  - `/api/health` reports every service as `missing` without credentials.
  - `/setup` returns 200.
  - Unknown routes return 404.
- Headless Chrome checks using installed Chrome with SwiftShader, so these are software-rendering conditions:
  - Home and workspace render the scene.
  - The canvas fills its stage, including after a live resize.
  - The camera buttons work and auto-rotate `aria-pressed` toggles.
  - No horizontal overflow at 375 px; the layout was checked in a 375 px iframe.
  - The WebGL-disabled fallback message renders.
  - No console errors on `/workspace`.

## Known limitations

- The 3D scene is illustrative. It does not represent any real field, crop calendar, or data.
- Visual checks used headless software rendering. Hardware-GPU rendering was not observed directly in this environment.
- Phase 1 must confirm crop geometry, colours, and strip semantics against real crop references before they convey any meaning.
- Dev Supabase project, NASA Earthdata token, and AI key are not configured.
