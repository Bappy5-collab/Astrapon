import { round } from "@/domain/evidence/aggregate";
import { PROCESSING_VERSION } from "@/domain/evidence/catalog";
import { check } from "@/server/providers/http";
import { buildSdaHorizonQuery, buildSdaSurveyVersionQuery, parseSdaTable, postSdaQuery, rootZoneAwcMm, sdaProvenance, toHorizons, validateSda } from "@/server/providers/usda-sda";

import { cacheKey, combinedSha } from "./cache";
import { PipelineError, type FieldContext, type PipelineOutput, type Progress } from "./types";

/**
 * SSURGO plant-available water capacity (0–100 cm) for the map unit under the field's interior
 * point. United States only: elsewhere the job ends as "not applicable", never with a guess.
 */
export async function runSsurgo(ctx: FieldContext, progress: Progress): Promise<PipelineOutput> {
  if (ctx.countryCode && ctx.countryCode !== "US") throw new PipelineError("SSURGO covers the United States only; this farm's country is " + ctx.countryCode + ".", "not_applicable");
  const { lat, lon } = ctx.centroid;
  await progress({ step: "Soil survey map unit", done: 0, total: 2 });
  const hz = await postSdaQuery(buildSdaHorizonQuery(lat, lon));
  if (!hz.ok) throw new PipelineError(`Soil Data Access did not answer: ${hz.error}`, "unavailable");
  const rows = parseSdaTable(hz.raw);
  const horizons = toHorizons(rows);
  if (!horizons.length) throw new PipelineError("No surveyed soil map unit at this location (outside SSURGO coverage or unmapped).", "not_applicable");
  await progress({ step: "Survey version", done: 1, total: 2 });
  const sv = await postSdaQuery(buildSdaSurveyVersionQuery(horizons[0]!.mukey));
  const survey = sv.ok ? (parseSdaTable(sv.raw)[0] as { areasymbol: string; areaname: string; saverest: string } | undefined) ?? null : null;

  const checks = validateSda(horizons);
  const comps = rootZoneAwcMm(horizons, 100);
  const complete = comps.filter((c) => c.awcMm !== null);
  const pct = complete.reduce((s, c) => s + c.comppct, 0);
  const value = complete.length && pct > 0 ? round(complete.reduce((s, c) => s + c.awcMm! * c.comppct, 0) / pct, 0) : null;
  checks.push(check("components-complete", complete.length === comps.length, `${complete.length}/${comps.length} major components have AWC through 100 cm`));
  const surveyDate = survey?.saverest ? new Date(survey.saverest).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const prov = sdaProvenance(survey ? { areasymbol: survey.areasymbol, saverest: survey.saverest } : null, hz.retrieval);
  const shas = [hz.retrieval.bodySha256, ...(sv.ok ? [sv.retrieval.bodySha256] : [])];
  return {
    retrieval: {
      sourceId: "usda-ssurgo-sda",
      productId: prov.product?.id ?? "SSURGO",
      productVersion: survey?.saverest ? surveyDate : null,
      evidenceClass: "ground_measurement",
      spatialSupport: "Soil survey map-unit polygon containing the field's interior point",
      request: { endpoint: "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest", latitude: lat, longitude: lon, mukey: horizons[0]!.mukey },
      retrievedAt: hz.retrieval.retrievedAt,
      responseSha256: combinedSha(shas),
      responseBytes: hz.retrieval.bodyBytes + (sv.ok ? sv.retrieval.bodyBytes : 0),
      outcome: checks.every((c) => c.passed) ? "valid" : "partial",
      checks,
      provenance: {
        evidenceClass: "ground_measurement",
        source: prov.source,
        mapUnit: { mukey: horizons[0]!.mukey, name: horizons[0]!.muname },
        survey,
        components: comps.map((c) => ({ name: c.compname, percent: c.comppct, awcMm: c.awcMm })),
      },
      cacheKey: cacheKey({ source: "usda-ssurgo-sda", mukey: horizons[0]!.mukey, survey: survey?.saverest ?? "unknown", processing: PROCESSING_VERSION }),
      processingVersion: PROCESSING_VERSION,
      observationStart: surveyDate,
      observationEnd: surveyDate,
    },
    aggregates: [
      { variable: "awc_0_100cm", unit: "mm", aggregation: "mean", periodStart: surveyDate, periodEnd: surveyDate, value, validCount: complete.length, expectedCount: Math.max(comps.length, complete.length), pixel: "" },
    ],
  };
}
