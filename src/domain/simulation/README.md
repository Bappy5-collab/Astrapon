# Simulation engine (Phase 4)

This folder is intentionally empty. It will hold a pure, deterministic, versioned TypeScript engine.

- Inputs: field, zones, history, pinned evidence snapshot, hypothetical overrides, and priorities.
- Outputs: per-season indicators, each carrying `Provenance` from `../provenance/evidence.ts`.
- Constraint: no I/O, framework, or randomness without an explicit seed. ESLint enforces the import restrictions.
