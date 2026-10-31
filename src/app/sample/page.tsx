import type { Metadata } from "next";

import { SampleWorkspace } from "@/components/workspace/SampleWorkspace";
import { boundaryOrigin, projectField } from "@/domain/geo/local-frame";
import { SAMPLE_FIELD } from "@/domain/sample/sample-field";
import { fieldCoverage } from "@/domain/sources/coverage";

export const metadata: Metadata = {
  title: "Sample field",
  description: "Explore Astrapon's 3D field workspace with an invented sample field. No account needed.",
};

export default function SamplePage() {
  const coverage = fieldCoverage(boundaryOrigin(SAMPLE_FIELD.boundary)[1], projectField(SAMPLE_FIELD.boundary).extentM, "US");
  return <SampleWorkspace coverage={coverage} currentYear={new Date().getUTCFullYear()} />;
}
