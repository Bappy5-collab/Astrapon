# FieldShift

FieldShift helps farmers and agronomists compare crop rotation options for a specific field. The comparison draws on environmental evidence, soil and crop history, water limits, and the farmer's priorities. It explains the tradeoffs to review locally. The main workspace is an interactive 3D farm simulator.

> **Status: Phase 1 (data research and live verification).** The app shell and an *illustrative* 3D preview work. NASA POWER, MODIS (ORNL) and USDA SSURGO clients are live-verified by script. Field setup and the rotation model are not built yet. See `docs/implementation-status.md` and `/sources`.

## Requirements

- Node.js ≥ 22.12 (developed on 22.17.1)
- pnpm 12 (`npm i -g pnpm@12`, or `corepack enable`)

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Production build:

```bash
pnpm build
pnpm start
```

Checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check          # all three
pnpm verify:sources # live provider checks; writes data/verification/*.json
```

## Configuration

The app runs with **no credentials**. To enable services:

1. Create a **new, dedicated** Supabase project for FieldShift development. Do not reuse another app's project.
2. Run `cp .env.example .env.local` and fill in the values. See the comments in the file.
3. Restart `pnpm dev` and open `/setup` to confirm each service shows **Configured**. The page never displays values.

`/api/health` returns the same configuration states as JSON.

## Project docs

- `docs/fieldshift-product-contract.md`: permanent product, scientific, and design contract
- `docs/architecture.md`: module layout and enforced boundaries
- `docs/implementation-plan.md`: phases 1–7
- `docs/implementation-status.md`: what is done and verified
- `docs/challenge-alignment.md`: requirement matrix C1–C8
- `docs/research/`: challenge source and data-source research

FieldShift is being built to use publicly available NASA data products. It is not affiliated with or endorsed by NASA.
