import { z } from "zod";

import type { Provenance } from "@/domain/provenance/evidence";

import { check, fetchText, type Check, type Retrieval } from "./http";

/**
 * USDA NRCS Soil Data Access (SSURGO), US only. Public, no authentication.
 * Docs: https://sdmdataaccess.sc.egov.usda.gov/WebServiceHelp.aspx
 * Gives survey-mapped available water capacity directly, so no texture→AWC inference is needed in the US.
 */
export const SDA_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest";

const tableSchema = z.object({ Table: z.array(z.array(z.string().nullable())).min(1) });

export type SdaHorizon = {
  mukey: string;
  muname: string;
  compname: string;
  comppct: number;
  topCm: number;
  bottomCm: number;
  awc: number | null;
  clayPct: number | null;
  sandPct: number | null;
  omPct: number | null;
};

const num = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Major components and their horizons for the map unit containing a WGS84 point. */
export function buildSdaHorizonQuery(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("invalid coordinates");
  return [
    "SELECT mu.mukey, mu.muname, c.compname, c.comppct_r, ch.hzdept_r, ch.hzdepb_r, ch.awc_r, ch.claytotal_r, ch.sandtotal_r, ch.om_r",
    `FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(${lon} ${lat})') AS k`,
    "INNER JOIN mapunit mu ON mu.mukey = k.mukey",
    "INNER JOIN component c ON c.mukey = mu.mukey AND c.majcompflag = 'Yes'",
    "LEFT JOIN chorizon ch ON ch.cokey = c.cokey",
    "ORDER BY c.comppct_r DESC, c.compname, ch.hzdept_r",
  ].join(" ");
}

export function buildSdaSurveyVersionQuery(mukey: string): string {
  if (!/^\d+$/.test(mukey)) throw new Error("invalid mukey");
  return `SELECT TOP 1 sc.areasymbol, sc.areaname, sc.saverest FROM sacatalog sc INNER JOIN legend l ON l.areasymbol = sc.areasymbol INNER JOIN mapunit m ON m.lkey = l.lkey WHERE m.mukey = '${mukey}'`;
}

export function parseSdaTable(raw: unknown): Record<string, string | null>[] {
  const t = tableSchema.parse(raw).Table;
  const [header, ...rows] = t;
  return rows.map((r) => Object.fromEntries((header ?? []).map((h, i) => [h ?? `col${i}`, r[i] ?? null])));
}

export function toHorizons(rows: Record<string, string | null>[]): SdaHorizon[] {
  return rows
    .filter((r) => r.hzdept_r !== null && r.hzdepb_r !== null)
    .map((r) => ({
      mukey: r.mukey ?? "",
      muname: r.muname ?? "",
      compname: r.compname ?? "",
      comppct: num(r.comppct_r) ?? 0,
      topCm: num(r.hzdept_r) ?? 0,
      bottomCm: num(r.hzdepb_r) ?? 0,
      awc: num(r.awc_r),
      clayPct: num(r.claytotal_r),
      sandPct: num(r.sandtotal_r),
      omPct: num(r.om_r),
    }));
}

/**
 * Plant-available water held in the top `depthCm` (mm), per component, using
 * survey representative AWC (cm/cm × cm thickness × 10 = mm). Horizons with
 * missing AWC make the component's total null rather than silently smaller.
 */
export function rootZoneAwcMm(horizons: SdaHorizon[], depthCm: number) {
  const byComp = new Map<string, SdaHorizon[]>();
  for (const h of horizons) byComp.set(`${h.compname}|${h.comppct}`, [...(byComp.get(`${h.compname}|${h.comppct}`) ?? []), h]);
  return [...byComp.values()].map((hs) => {
    let mm = 0;
    let complete = true;
    for (const h of hs) {
      const thick = Math.max(0, Math.min(h.bottomCm, depthCm) - h.topCm);
      if (thick === 0) continue;
      if (h.awc === null) complete = false;
      else mm += h.awc * thick * 10;
    }
    const covered = Math.min(depthCm, Math.max(0, ...hs.map((h) => h.bottomCm)));
    return { compname: hs[0]?.compname ?? "", comppct: hs[0]?.comppct ?? 0, depthCm, awcMm: complete && covered >= depthCm ? Math.round(mm) : null };
  });
}

export function validateSda(horizons: SdaHorizon[]): Check[] {
  return [
    check("has-horizons", horizons.length > 0, `${horizons.length} horizons`),
    check("awc-range", horizons.every((h) => h.awc === null || (h.awc >= 0 && h.awc <= 0.7)), "awc_r within 0–0.7 cm/cm"),
    check("depth-order", horizons.every((h) => h.bottomCm > h.topCm), "every horizon bottom > top"),
    check("texture-range", horizons.every((h) => (h.clayPct ?? 0) + (h.sandPct ?? 0) <= 100), "clay + sand ≤ 100%"),
  ];
}

export function sdaProvenance(survey: { areasymbol: string; saverest: string } | null, retrieval?: Retrieval): Provenance {
  return {
    evidenceClass: "ground_measurement",
    source: "USDA NRCS SSURGO via Soil Data Access (survey representative values for the map unit)",
    product: { id: `SSURGO/${survey?.areasymbol ?? "unknown"}`, version: survey?.saverest ?? "unknown" },
    spatialSupport: "Soil survey map-unit polygon containing the point",
    retrievedAt: retrieval?.retrievedAt,
  };
}

export async function postSdaQuery(query: string): Promise<{ ok: true; raw: unknown; retrieval: Retrieval } | { ok: false; error: string }> {
  const res = await fetchText(SDA_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, format: "JSON+COLUMNNAME" }), timeoutMs: 90_000 });
  if (!res.ok) return { ok: false, error: `${res.error}${res.bodySnippet ? `: ${res.bodySnippet.slice(0, 200)}` : ""}` };
  if (!res.body.trim().startsWith("{")) return { ok: false, error: `non-JSON response: ${res.body.slice(0, 200)}` };
  return { ok: true, raw: JSON.parse(res.body), retrieval: { ...res.retrieval, url: `${SDA_URL} (POST)` } };
}
