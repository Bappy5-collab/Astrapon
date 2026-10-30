import { z } from "zod";

import type { Provenance } from "@/domain/provenance/evidence";

import { check, fetchText, type Check } from "./http";

/**
 * ISRIC SoilGrids 2.0 REST point query (non-NASA). Licence CC-BY 4.0; cite
 * Poggio et al. 2021, https://doi.org/10.5194/soil-7-217-2021.
 * ISRIC states the REST service is temporarily paused (https://www.isric.org/explore/soilgrids);
 * fair-use was 5 calls/minute when active. Values are 250 m model predictions with
 * 90% prediction intervals, not field measurements.
 */
export const SOILGRIDS_QUERY = "https://rest.isric.org/soilgrids/v2.0/properties/query";

/** Mapped-unit divisors to conventional units, from the ISRIC SoilGrids FAQ. */
export const SOILGRIDS_CONVERSIONS = {
  clay: { divisor: 10, conventional: "%" },
  sand: { divisor: 10, conventional: "%" },
  silt: { divisor: 10, conventional: "%" },
  soc: { divisor: 10, conventional: "g/kg" },
  bdod: { divisor: 100, conventional: "kg/dm³" },
  phh2o: { divisor: 10, conventional: "pH" },
  cfvo: { divisor: 10, conventional: "vol%" },
  cec: { divisor: 10, conventional: "cmol(c)/kg" },
  nitrogen: { divisor: 100, conventional: "g/kg" },
} as const;

export type SoilProperty = keyof typeof SOILGRIDS_CONVERSIONS;
export const SOILGRIDS_DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"] as const;

const responseSchema = z.object({
  geometry: z.object({ coordinates: z.array(z.number()) }),
  properties: z.object({
    layers: z.array(
      z.object({
        name: z.string(),
        unit_measure: z.object({ d_factor: z.number(), mapped_units: z.string(), target_units: z.string() }),
        depths: z.array(z.object({ label: z.string(), values: z.record(z.string(), z.number().nullable()) })),
      }),
    ),
  }),
});

export type SoilValue = {
  property: SoilProperty;
  depth: string;
  units: string;
  q05: number | null;
  q50: number | null;
  q95: number | null;
  mean: number | null;
};

export function buildSoilGridsUrl(lat: number, lon: number, properties: SoilProperty[], depths: readonly string[]) {
  const p = new URLSearchParams({ lon: String(lon), lat: String(lat) });
  for (const x of properties) p.append("property", x);
  for (const d of depths) p.append("depth", d);
  for (const v of ["Q0.05", "Q0.5", "Q0.95", "mean"]) p.append("value", v);
  return `${SOILGRIDS_QUERY}?${p}`;
}

/** Parse and convert to conventional units. The response's own d_factor must match the documented divisor. */
export function parseSoilGrids(raw: unknown, retrievedAt?: string): { values: SoilValue[]; checks: Check[]; provenance: Provenance } {
  const r = responseSchema.parse(raw);
  const checks: Check[] = [];
  const values: SoilValue[] = [];
  for (const layer of r.properties.layers) {
    const conv = SOILGRIDS_CONVERSIONS[layer.name as SoilProperty];
    if (!conv) continue;
    checks.push(check(`${layer.name}:d_factor`, layer.unit_measure.d_factor === conv.divisor, `response d_factor ${layer.unit_measure.d_factor}, documented ${conv.divisor}`));
    const f = (v: number | null | undefined) => (v === null || v === undefined ? null : v / layer.unit_measure.d_factor);
    for (const d of layer.depths) {
      values.push({
        property: layer.name as SoilProperty,
        depth: d.label,
        units: conv.conventional,
        q05: f(d.values["Q0.05"]),
        q50: f(d.values["Q0.5"]),
        q95: f(d.values["Q0.95"]),
        mean: f(d.values.mean),
      });
    }
  }
  const nonNull = values.filter((v) => v.q50 !== null || v.mean !== null).length;
  // A paused backend has been observed to answer HTTP 200 with every value null: that is not data.
  checks.push(check("has-values", nonNull > 0, `${nonNull}/${values.length} property-depth cells have a value`));
  const pct = values.filter((v) => v.units === "%" && v.q50 !== null);
  checks.push(check("texture-range", pct.every((v) => (v.q50 as number) >= 0 && (v.q50 as number) <= 100), "texture % within 0–100"));
  return {
    values,
    checks,
    provenance: {
      evidenceClass: "assimilated_model_product",
      source: "ISRIC SoilGrids 2.0 (machine-learning predictions from soil profiles and covariates)",
      product: { id: "SoilGrids", version: "2.0", doi: "10.5194/soil-7-217-2021" },
      spatialResolutionMeters: 250,
      retrievedAt,
    },
  };
}

export async function fetchSoilGrids(lat: number, lon: number, properties: SoilProperty[], depths: readonly string[] = SOILGRIDS_DEPTHS) {
  const url = buildSoilGridsUrl(lat, lon, properties, depths);
  const res = await fetchText(url, { timeoutMs: 120_000 });
  if (!res.ok) return { ok: false as const, url, error: res.error, status: res.status, retrievedAt: res.retrievedAt };
  return { ok: true as const, url, retrieval: res.retrieval, raw: JSON.parse(res.body) as unknown, ...parseSoilGrids(JSON.parse(res.body), res.retrieval.retrievedAt) };
}
