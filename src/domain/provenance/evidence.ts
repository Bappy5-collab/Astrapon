/**
 * Evidence classes are the backbone of FieldShift's scientific contract: every
 * value shown to a farmer carries one, and derived values carry their lineage.
 * See docs/fieldshift-product-contract.md §Scientific contract.
 */
export const EVIDENCE_CLASSES = [
  "satellite_observation",
  "assimilated_model_product",
  "ground_measurement",
  "farmer_report",
  "hypothetical_input",
  "simulation_output",
  "illustrative",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const EVIDENCE_CLASS_INFO: Record<EvidenceClass, { label: string; meaning: string }> = {
  satellite_observation: {
    label: "Satellite observation",
    meaning: "Measured remotely by a sensor for a specific place and time, at the product's native resolution.",
  },
  assimilated_model_product: {
    label: "Model / assimilated product",
    meaning: "Estimated by a model that blends observations (e.g. reanalysis). Not a direct measurement.",
  },
  ground_measurement: {
    label: "Ground measurement",
    meaning: "Measured on or near the ground, such as a station or soil survey record.",
  },
  farmer_report: {
    label: "Farmer report",
    meaning: "Supplied by the farmer or advisor from local knowledge and records.",
  },
  hypothetical_input: {
    label: "Hypothetical input",
    meaning: "A what-if assumption chosen by the user. Not an observation or forecast.",
  },
  simulation_output: {
    label: "Simulation output",
    meaning: "Computed by FieldShift's model from the listed inputs. Only as good as those inputs.",
  },
  illustrative: {
    label: "Illustrative",
    meaning: "A visual placeholder. It does not represent any real field, crop, or measurement.",
  },
};

/** Where a value came from. Fields are optional only where a source genuinely lacks them. */
export type Provenance = {
  evidenceClass: EvidenceClass;
  /** Human-readable source, e.g. a dataset or "Farmer entry". */
  source: string;
  /** Dataset/product identifier and version when applicable. */
  product?: { id: string; version?: string; doi?: string };
  /** Native spatial resolution in metres, when the source is gridded. */
  spatialResolutionMeters?: number;
  temporalCoverage?: { start: string; end: string };
  retrievedAt?: string;
  /** Provenance of inputs, for derived values. */
  derivedFrom?: Provenance[];
};

/** True if any value in the lineage (including itself) is of the given class. */
export function lineageIncludes(p: Provenance, evidenceClass: EvidenceClass): boolean {
  return p.evidenceClass === evidenceClass || (p.derivedFrom ?? []).some((d) => lineageIncludes(d, evidenceClass));
}

/**
 * Provenance for a value computed by the simulation engine. Simulation outputs
 * are never relabelled as observations, and any hypothetical input in the
 * lineage is surfaced so the UI can flag the result as a what-if.
 */
export function deriveSimulationProvenance(
  source: string,
  inputs: Provenance[],
): Provenance & { dependsOnHypothetical: boolean; dependsOnIllustrative: boolean } {
  if (inputs.length === 0) throw new Error("A simulation output must declare at least one input.");
  const result: Provenance = { evidenceClass: "simulation_output", source, derivedFrom: inputs };
  return {
    ...result,
    dependsOnHypothetical: lineageIncludes(result, "hypothetical_input"),
    dependsOnIllustrative: lineageIncludes(result, "illustrative"),
  };
}
