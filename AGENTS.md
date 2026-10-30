# AGENTS.md

FieldShift: crop-rotation decision support with an interactive 3D farm simulator.

**Read first:** `docs/fieldshift-product-contract.md`, the permanent product, scientific, design, and operating contract. It overrides convenience.

## Where things are

- `docs/implementation-plan.md`: phases 1–7.
- `docs/implementation-status.md`: what is done and verified.
- `docs/challenge-alignment.md`: C1–C8 matrix. Update it every phase.
- `docs/architecture.md`: module layout and enforced boundaries.

## Commands (pnpm only; one lockfile)

```
pnpm install
pnpm dev          # http://localhost:3000
pnpm build && pnpm start
pnpm lint         # ESLint flat config incl. module-boundary rules
pnpm typecheck    # next typegen + tsc --noEmit
pnpm test         # vitest
pnpm check        # lint + typecheck + test
```

## Rules that bite

- `src/domain/**` is pure TypeScript with no React, Next, MUI, Three, Supabase, or server imports (ESLint-enforced).
- `src/server/**` imports `server-only`. Client components and `src/components/**` must never import it.
- MUI components that need `component={NextLink}` from a Server Component must use `ButtonLink`/`TextLink` from `src/components/links.tsx`. Passing the component directly fails prerendering.
- 3D code is client-only and dynamically imported with `ssr:false`. Keep the WebGL fallback, software-renderer tier, and offscreen pause working.
- Env: never log or render values. Use the reports from `src/lib/env/schema.ts`.
- Pinned toolchain:
  - TypeScript is 6.0.x because typescript-eslint requires `<6.1`.
  - ESLint is 9.x for React plugin peer support.
  - React must stay `<19.4` for `@react-three/fiber` 9.8.
- Next 16 specifics:
  - `proxy.ts` replaces `middleware.ts`.
  - There is no `next lint`.
  - Request APIs are async.
  - Turbopack is the default.
- pnpm 12 blocks dependency build scripts. Review any new one and add it to `allowBuilds` in `pnpm-workspace.yaml`.

## Phase status

Phase 0 is complete. Next is Phase 1 (research decisions). Use only a newly designated FieldShift dev Supabase project; none is configured yet.

## End-of-phase duties

Run the checks and inspect the UI. Update this file, `docs/implementation-status.md`, and `docs/challenge-alignment.md`. Commit task-owned changes locally and do not push.
