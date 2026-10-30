import { z } from "zod";

import { check, fetchText, type Check } from "./http";

/**
 * NASA Common Metadata Repository (CMR) search. Public, no authentication.
 * Docs: https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html
 *
 * CMR proves a collection exists and how fresh its newest granule is. It does
 * NOT provide the data values; downloading granules needs Earthdata Login.
 */
export const CMR_SEARCH = "https://cmr.earthdata.nasa.gov/search";

const collectionsSchema = z.object({
  hits: z.number(),
  items: z.array(
    z.object({
      meta: z.object({ "concept-id": z.string(), "provider-id": z.string() }),
      umm: z.object({
        ShortName: z.string(),
        Version: z.string(),
        DOI: z.object({ DOI: z.string().optional() }).optional(),
        TemporalExtents: z.array(z.object({ RangeDateTimes: z.array(z.object({ BeginningDateTime: z.string(), EndingDateTime: z.string().optional() })).optional() })).optional(),
      }),
    }),
  ),
});

const granulesSchema = z.object({
  hits: z.number(),
  items: z.array(
    z.object({
      meta: z.object({ "revision-date": z.string().optional() }),
      umm: z.object({
        TemporalExtent: z.object({ RangeDateTime: z.object({ BeginningDateTime: z.string() }).optional() }).optional(),
        RelatedUrls: z.array(z.object({ URL: z.string(), Type: z.string() })).optional(),
      }),
    }),
  ),
});

export type CollectionCheck = {
  shortName: string;
  version: string;
  conceptId: string | null;
  doi: string | null;
  temporalStart: string | null;
  temporalEnd: string | null;
  granuleCount: number | null;
  latestGranuleStart: string | null;
  latestGranulePublished: string | null;
  sampleDataUrl: string | null;
  /** Unauthenticated probe of the sample data URL. */
  dataAccess: "open" | "earthdata-login-required" | "error" | "not-probed";
  dataAccessDetail: string;
  checks: Check[];
};

export async function checkCollection(shortName: string, version: string, { probeData = true } = {}): Promise<CollectionCheck> {
  const checks: Check[] = [];
  const base: CollectionCheck = {
    shortName,
    version,
    conceptId: null,
    doi: null,
    temporalStart: null,
    temporalEnd: null,
    granuleCount: null,
    latestGranuleStart: null,
    latestGranulePublished: null,
    sampleDataUrl: null,
    dataAccess: "not-probed",
    dataAccessDetail: "",
    checks,
  };

  const col = await fetchText(`${CMR_SEARCH}/collections.umm_json?short_name=${encodeURIComponent(shortName)}&version=${encodeURIComponent(version)}`);
  if (!col.ok) {
    checks.push(check("collection", false, col.error));
    return base;
  }
  const c = collectionsSchema.parse(JSON.parse(col.body));
  const item = c.items[0];
  checks.push(check("collection", c.hits === 1 && !!item, `${c.hits} collection(s) for ${shortName} v${version}`));
  if (!item) return base;
  const range = item.umm.TemporalExtents?.[0]?.RangeDateTimes?.[0];
  Object.assign(base, {
    conceptId: item.meta["concept-id"],
    doi: item.umm.DOI?.DOI ?? null,
    temporalStart: range?.BeginningDateTime ?? null,
    temporalEnd: range?.EndingDateTime ?? null,
  });

  const gr = await fetchText(`${CMR_SEARCH}/granules.umm_json?collection_concept_id=${base.conceptId}&sort_key=-start_date&page_size=1`);
  if (!gr.ok) {
    checks.push(check("latest-granule", false, gr.error));
    return base;
  }
  const g = granulesSchema.parse(JSON.parse(gr.body));
  const latest = g.items[0];
  base.granuleCount = g.hits;
  base.latestGranuleStart = latest?.umm.TemporalExtent?.RangeDateTime?.BeginningDateTime ?? null;
  base.latestGranulePublished = latest?.meta["revision-date"] ?? null;
  base.sampleDataUrl = latest?.umm.RelatedUrls?.find((u) => u.Type === "GET DATA")?.URL ?? null;
  checks.push(check("latest-granule", !!base.latestGranuleStart, `newest granule starts ${base.latestGranuleStart}; ${g.hits} granules`));

  if (probeData && base.sampleDataUrl) {
    // HEAD-like probe without following redirects: Earthdata-protected archives answer 302 → urs.earthdata.nasa.gov.
    try {
      const res = await fetch(base.sampleDataUrl, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(60_000) });
      const location = res.headers.get("location") ?? "";
      await res.body?.cancel();
      if (res.status >= 300 && res.status < 400 && location.includes("urs.earthdata.nasa.gov")) {
        base.dataAccess = "earthdata-login-required";
        base.dataAccessDetail = `HTTP ${res.status} redirect to Earthdata Login`;
      } else if (res.ok) {
        base.dataAccess = "open";
        base.dataAccessDetail = `HTTP ${res.status}`;
      } else {
        base.dataAccess = "error";
        base.dataAccessDetail = `HTTP ${res.status}`;
      }
    } catch (err) {
      base.dataAccess = "error";
      base.dataAccessDetail = (err as Error).message;
    }
  }
  return base;
}
