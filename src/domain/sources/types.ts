import type { EvidenceClass } from "../provenance/evidence";

/**
 * Integration status, from least to most proven. A source is only
 * `live_verified` when a committed verification artifact shows a real response
 * that passed content validation (not just HTTP 200).
 */
export const SOURCE_STATUSES = ["researched", "implemented", "live_verified", "credential_blocked", "unavailable"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_DECISIONS = [
  /** In the initial subset and usable now. */
  "selected_initial",
  /** In the initial subset, but blocked on an account/key the owner must provide. */
  "selected_pending_access",
  /** Useful later; not in the initial subset. */
  "deferred",
  /** Not suitable for Astrapon's field-level decisions. */
  "rejected",
  /** Static reference material (tables, papers), not a live data feed. */
  "reference",
] as const;
export type SourceDecision = (typeof SOURCE_DECISIONS)[number];

export type Workload = "S" | "M" | "L";

export type VariableSpec = {
  name: string;
  units: string;
  dataType?: string;
  scale?: number;
  offset?: number;
  fill?: string;
  validRange?: string;
  quality?: string;
};

export type DataSource = {
  id: string;
  name: string;
  /** Organisation that produces/hosts the data. Hosting by NASA does not make a product a NASA observation. */
  producer: string;
  isNasa: boolean;
  officialUrls: string[];
  productId: string;
  version: string;
  doi?: string;
  citation: string;
  licence: string;
  evidenceClass: EvidenceClass;
  evidenceNote: string;
  coverage: string;
  exclusions: string[];
  spatialSupport: string;
  temporal: { resolution: string; archive: string; documentedLatency: string; observedLatency?: string };
  variables: VariableSpec[];
  access: { auth: "none" | "earthdata_login" | "api_key" | "email_request"; route: string; limits: string };
  processing: { path: string; libraries: string[]; workload: Workload };
  supports: string[];
  cannotEstablish: string[];
  decision: SourceDecision;
  rationale: string;
  status: SourceStatus;
  /** Artifact path (for live_verified) or the actual failure observed (for blocked/unavailable). */
  statusEvidence: string;
  checkedAt: string;
  unconfirmed: string[];
};

export type ReferenceSource = {
  id: string;
  title: string;
  citation: string;
  url: string;
  doi?: string;
  usedFor: string;
  licence: string;
  caveats: string;
  unconfirmed: string[];
};
