import type { PipelineSource } from "@/domain/evidence/catalog";
import type { EvidenceClass } from "@/domain/provenance/evidence";
import type { Check } from "@/server/providers/http";

/** One normalised aggregate row, ready for public.evidence_aggregates. */
export type AggregateRow = {
  variable: string;
  unit: string;
  aggregation: "sum" | "mean" | "min" | "max" | "count";
  periodStart: string;
  periodEnd: string;
  value: number | null;
  validCount: number;
  expectedCount: number;
  /** MODIS pixel id ("r3c4") for per-pixel values; "" for field-level values. */
  pixel: string;
};

/** Everything needed to write one public.evidence_retrievals row (no raw data). */
export type RetrievalRecord = {
  sourceId: PipelineSource;
  productId: string;
  productVersion: string | null;
  evidenceClass: Extract<EvidenceClass, "satellite_observation" | "assimilated_model_product" | "ground_measurement">;
  spatialSupport: string;
  request: Record<string, unknown>;
  /** Earliest network fetch among the chunks used (a cached chunk keeps its original fetch time). */
  retrievedAt: string;
  responseSha256: string;
  responseBytes: number;
  outcome: "valid" | "partial" | "invalid" | "unavailable";
  checks: Check[];
  provenance: Record<string, unknown>;
  cacheKey: string;
  processingVersion: string;
  observationStart: string | null;
  observationEnd: string | null;
};

export type PipelineOutput = { retrieval: RetrievalRecord; aggregates: AggregateRow[] };

export type Progress = (p: { step: string; done: number; total: number }) => Promise<void> | void;

export type FieldContext = {
  fieldId: string;
  /** Interior point of the field (PostGIS st_pointonsurface), lon/lat. */
  centroid: { lat: number; lon: number };
  boundary: import("@/domain/geo/boundary").BoundaryGeometry;
  countryCode: string | null;
};

export class PipelineError extends Error {
  constructor(
    message: string,
    /** "unavailable" = the provider could not be reached or refused; "invalid" = it answered with unusable content. */
    readonly kind: "unavailable" | "invalid" | "not_applicable",
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

/** Reads the failure kind without relying on instanceof (the worker and pipeline may load separate module copies). */
export function pipelineErrorKind(e: unknown): "unavailable" | "invalid" | "not_applicable" | "internal" {
  const k = (e as { name?: string; kind?: string } | null)?.kind;
  return (e as { name?: string } | null)?.name === "PipelineError" && (k === "unavailable" || k === "invalid" || k === "not_applicable") ? k : "internal";
}
