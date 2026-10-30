import { describe, expect, it } from "vitest";

import { EVIDENCE_CLASSES, EVIDENCE_CLASS_INFO, deriveSimulationProvenance, lineageIncludes, type Provenance } from "./evidence";

const observed: Provenance = { evidenceClass: "assimilated_model_product", source: "Reanalysis product" };
const farmer: Provenance = { evidenceClass: "farmer_report", source: "Farmer entry" };
const whatIf: Provenance = { evidenceClass: "hypothetical_input", source: "User rainfall scenario" };

describe("evidence classes", () => {
  it("documents every class", () => {
    for (const c of EVIDENCE_CLASSES) expect(EVIDENCE_CLASS_INFO[c].label.length).toBeGreaterThan(0);
  });
});

describe("deriveSimulationProvenance", () => {
  it("always labels derived values as simulation output", () => {
    const p = deriveSimulationProvenance("Water balance v0", [observed, farmer]);
    expect(p.evidenceClass).toBe("simulation_output");
    expect(p.dependsOnHypothetical).toBe(false);
  });

  it("flags hypothetical inputs anywhere in the lineage", () => {
    const intermediate = deriveSimulationProvenance("Step A", [observed, whatIf]);
    const final = deriveSimulationProvenance("Step B", [intermediate, farmer]);
    expect(final.dependsOnHypothetical).toBe(true);
    expect(lineageIncludes(final, "farmer_report")).toBe(true);
    expect(lineageIncludes(final, "satellite_observation")).toBe(false);
  });

  it("refuses outputs without declared inputs", () => {
    expect(() => deriveSimulationProvenance("Orphan", [])).toThrow();
  });
});
