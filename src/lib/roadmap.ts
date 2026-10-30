/**
 * User-facing summary of the staged plan in docs/implementation-plan.md.
 * Keep the two in sync; the docs are authoritative.
 */
export type WorkflowStep = { title: string; detail: string; phase: number };

export const CURRENT_PHASE = 2;

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    title: "Find your field",
    detail: "Search any location worldwide, then draw or confirm the field boundary yourself.",
    phase: 2,
  },
  {
    title: "Add what you know",
    detail: "Zones you manage differently, soil notes, past crops, irrigation and water limits, and your priorities.",
    phase: 2,
  },
  {
    title: "Bring in evidence",
    detail: "Environmental records from NASA and soil sources, each labelled with its type, resolution, and coverage for your region.",
    phase: 3,
  },
  {
    title: "Replay and ask what-if",
    detail: "Step through past seasons on your field, then change weather or water assumptions to see how sensitive the outcome is.",
    phase: 5,
  },
  {
    title: "Compare rotations",
    detail: "Your current rotation alongside feasible alternatives on the same inputs, with reasons, tradeoffs, gaps, and what to check locally.",
    phase: 6,
  },
];
