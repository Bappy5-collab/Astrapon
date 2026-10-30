import { REFERENCE_SOURCES } from "@/domain/sources/references";
import { DATA_SOURCES } from "@/domain/sources/registry";
import type { DataSource, ReferenceSource } from "@/domain/sources/types";

/**
 * Builds the reference datasets FieldShift imports into the database. Only content that is
 * already sourced in the repository is included. Crop parameters, rotation rules and crop
 * calendars are deliberately absent: their table values have not been checked against the
 * sources yet (see docs/research/data-sources.md), so importing them would publish unverified
 * numbers.
 */

export type CitationVerification = "verified" | "title_to_verify" | "secondary_source" | "catalog_pointer";

export type CitationRecord = {
  citationKey: string;
  citation: string;
  url: string | null;
  doi: string | null;
  verification: CitationVerification;
};

export type DatasetItem = { itemKey: string; payload: Record<string, unknown>; citationKeys: string[] };

export type DatasetDefinition = {
  kind: "data_source_registry" | "reference_library";
  name: string;
  description: string;
  items: DatasetItem[];
};

const httpsOrNull = (url: string | undefined) => (url && url.startsWith("https://") ? url : null);

export function sourceCitation(s: DataSource): CitationRecord {
  const pointer = /not yet transcribed|<date>/i.test(s.citation);
  return {
    citationKey: `source-${s.id}`,
    citation: s.citation,
    url: httpsOrNull(s.officialUrls[0]),
    doi: s.doi ?? null,
    verification: pointer ? "catalog_pointer" : "verified",
  };
}

export function literatureCitation(r: ReferenceSource): CitationRecord {
  return {
    citationKey: r.id,
    citation: r.citation,
    url: httpsOrNull(r.url),
    doi: r.doi ?? null,
    verification: /title to verify/i.test(r.title) ? "title_to_verify" : "verified",
  };
}

export function buildReferenceDatasets(): { citations: CitationRecord[]; datasets: DatasetDefinition[] } {
  const citations = [...DATA_SOURCES.map(sourceCitation), ...REFERENCE_SOURCES.map(literatureCitation)];
  const datasets: DatasetDefinition[] = [
    {
      kind: "data_source_registry",
      name: "fieldshift-data-sources",
      description: "Environmental data sources: evidence class, coverage, access, what each supports and cannot establish, and verification status.",
      items: DATA_SOURCES.map((s) => ({ itemKey: s.id, payload: { ...s }, citationKeys: [`source-${s.id}`] })),
    },
    {
      kind: "reference_library",
      name: "agronomic-references",
      description: "Agronomic literature and tables FieldShift may draw on, with intended use, caveats and unconfirmed points. Contains no transcribed parameter values.",
      items: REFERENCE_SOURCES.map((r) => ({ itemKey: r.id, payload: { ...r }, citationKeys: [r.id] })),
    },
  ];
  return { citations, datasets };
}
