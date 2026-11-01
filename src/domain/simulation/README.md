# Simulation and rotation engine

Pure, deterministic, versioned TypeScript (`ENGINE_VERSION` in `engine-version.ts`). The contract is `docs/scientific-methodology.md`.

- `engine.ts`: `runEngine(input)`. Baseline, candidate generation, hard constraints, indicators, ranking, sensitivity.
- `waterbalance.ts`: FAO-56 Kc curve and the Chapter 8 root-zone balance, with a conservation check.
- `climate.ts`: Hargreaves ET0 (Eq. 52), extraterrestrial radiation (Eq. 21–25), weather transformations.
- `schedule.ts`: planting slots, cyclic scheduling, bare days.
- `catalog.ts`: sourced crop parameters (FAO-56, USDA PLANTS). `nass.ts`: USDA NASS 2010 calendar parser.
- `inputs.ts`: the engine input schema, built by `scripts/simulation-runner.mts` from pinned immutable rows.

Constraint: no I/O, framework, clock or randomness. ESLint enforces the import restrictions.
