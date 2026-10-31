# Astrapon product contract

This is the permanent contract for Astrapon. Every phase must keep it. `AGENTS.md` and `CLAUDE.md` point here. If this document conflicts with a phase prompt, raise the conflict; do not silently drop the contract.

## Product outcome

Astrapon helps a farmer answer:

> "Given my field, crop history, environmental evidence, water limits, and priorities, which rotation options are plausible, and what tradeoffs should I review locally?"

The main experience is an interactive 3D farm simulator. Farmers:

1. search for a location worldwide and confirm field boundaries,
2. configure management zones and crop history,
3. replay historical conditions,
4. change hypothetical weather and water assumptions,
5. compare their existing rotation with at least two feasible alternatives *when evidence supports them*.

Saving and reopening a run must reproduce its original result exactly. That means inputs, data snapshots, and the engine version are pinned.

## Challenge requirements (tracked in `docs/challenge-alignment.md`)

Official source: "Field Shift: Adapting Farms with NASA Data", 2026 NASA Space Apps Challenge. https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/ (verified 2026-10-30; see `docs/research/challenge-source.md`). The challenge text is phrased as options ("may"); no judging criteria are stated on the page.

| ID | Requirement |
|----|-------------|
| C1 | NASA environmental evidence has a traceable role in a farmer decision. |
| C2 | Local soil information, crop characteristics, and farmer history inform feasibility. |
| C3 | Farmer priorities and constraints affect comparisons. |
| C4 | The existing rotation and alternative strategies are compared on common inputs. |
| C5 | Explain reasons, evidence, benefits, tradeoffs, gaps, and local-review risks. |
| C6 | The tool supports farmer and agronomist judgment. |
| C7 | Global location selection with honest regional coverage reporting. |
| C8 | Optional indicators (bare-soil periods, heat/frost exposure, water stress, diversification, cover-crop opportunities) only when evidence permits. |

Interpretation of the supplied brief:

- The brief *suggests* three strategies, particular missions, AI techniques, and resolution harmonization. These are not universal mandates.
- **Our product choice:** comparing three strategies (existing plus two alternatives) is an acceptance target. We never invent infeasible alternatives to reach that count. If fewer are feasible, we say so and explain why.
- The brief does not require integrating every NASA dataset, and it does not require 3D. 3D is our chosen interaction design.

## Scientific contract

1. **Evidence classes are kept separate and labelled everywhere.** The classes are satellite observations, assimilated/model-derived products, ground measurements, farmer reports, hypothetical inputs, simulation outputs, and illustrative content. The canonical list is `src/domain/provenance/evidence.ts`.
2. **Provenance is preserved.** Every value records its source, product/version, native resolution, temporal coverage, and retrieval time where applicable. Derived values record their lineage.
3. **Historical replay is not a forecast.** The UI must never present replayed seasons as predictions.
4. **Simulated visuals are not satellite reconstructions.** 3D crop geometry is stylised and labelled as such.
5. **Coarse data cannot justify invented within-field differences.** Zone differences must come from farmer input or data whose resolution actually resolves them.
6. **No manufactured outcomes.** There will be no yield, profit, carbon gain, nitrogen credit, disease reduction, or precision claim unless the model supports it, and then only with stated uncertainty.
7. **Gaps are first-class.** Missing coverage, low resolution, or unsupported crops are reported, not papered over.

## Design contract

- The 3D scene is the main workspace. HTML/MUI controls, forms, charts, and accessible text alternatives surround it, and every 3D-conveyed fact has a non-3D equivalent.
- The visual direction is a restrained premium agricultural product: deep forest tones, warm neutral surfaces, lime accents, strong typography, generous space, and excellent readability. Crop geometry is expressive but purposeful. Tokens live in `src/theme/tokens.ts`.
- There are no fabricated metrics, testimonials, or NASA endorsement. A footer disclaimer states non-affiliation.
- The app must work without WebGL (informative fallback), on software renderers (reduced quality), with reduced motion, and at phone widths.

## Technology contract

- Next.js App Router, strict TypeScript, Material UI (sole component/theme system), Supabase (PostgreSQL/Auth/Storage), React Three Fiber, Three.js, and Drei.
- Node.js/TypeScript for scripts and jobs. No Python and no Unity. Use pnpm with one committed lockfile. Typed Supabase access; no Prisma by default.
- Module boundaries are described in `docs/architecture.md` and enforced by ESLint.

## Operating contract

- Use a **dedicated Astrapon development Supabase project**. Never infer it from old environment files, and never reuse or reset an older app's database.
- Apply only non-destructive migrations after verifying the target. Ask before destructive actions, purchases, public publishing, or production changes.
- Never print or commit secrets. Missing credentials produce honest "not configured" states, never fake success.
- Every phase ends by:
  - running the applicable checks and inspecting rendered UI for visual work,
  - fixing observed defects,
  - updating `AGENTS.md`, `docs/implementation-status.md`, and `docs/challenge-alignment.md`,
  - making a local commit of task-owned changes, without pushing.
- Never report an unrun check as passed.
