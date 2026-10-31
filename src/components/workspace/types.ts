import type { ZONE_BASES } from "@/domain/farm/records";
import type { BoundaryGeometry } from "@/domain/geo/boundary";
import type { SourceCoverage } from "@/domain/sources/coverage";
import type { HistoryEntry, WorkspaceEdits } from "@/domain/workspace/workspace";

export type WorkspaceHistory = HistoryEntry & {
  planted_on?: string | null;
  harvested_on?: string | null;
  reported_yield?: number | null;
  reported_yield_unit?: string | null;
};

export type WorkspaceSoil = { id: string; zone_id: string | null; label: string; value: string; observed_on: string; evidence_class: string };

export type WorkspaceFieldData = {
  /** Null for the public sample. */
  id: string | null;
  name: string;
  farmName: string;
  farmHref: string | null;
  countryCode: string | null;
  placeLabel: string | null;
  boundary: BoundaryGeometry | null;
  areaHa: number | null;
  zones: { id: string; name: string; basis: (typeof ZONE_BASES)[number]; notes: string | null; areaHa: number; boundary: BoundaryGeometry }[];
  history: WorkspaceHistory[];
  soil: WorkspaceSoil[];
  scenarioCount: number;
};

export type SaveResult = { ok: true; message: string } | { ok: false; message: string };

export type WorkspaceMode = "saved" | "sample";

export type CoverageList = SourceCoverage[];

export type SaveHandler = (edits: WorkspaceEdits) => Promise<SaveResult>;
