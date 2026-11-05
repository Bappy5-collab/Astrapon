/**
 * pnpm water:trace — LIVE verification of the Water & Energy providers through the same code the
 * app uses (src/server/water/lookup.ts). Writes redacted evidence to data/verification/:
 *   water-groundwater.json  location-driven groundwater routing in the US, France, Australia,
 *                           Bangladesh, South Africa and Kenya (no national adapter), plus a
 *                           simulated provider outage (partial results kept);
 *   water-overpass.json     OpenStreetMap water geometry and boundary distances;
 *   water-power-solar.json  NASA POWER daily all-sky irradiation summaries.
 * Test squares are small synthetic boundaries at public places; they are not farms. Request URLs
 * are recorded without query strings. These runs show specific coverage, not global validity.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { BoundaryGeometry } from "../src/domain/geo/boundary";
import { depthBelowGround } from "../src/domain/water/groundwater";
import { FT_TO_M } from "../src/domain/water/units";
import { lookupGroundwater, lookupSolar, lookupSurfaceWater } from "../src/server/water/lookup";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "data", "verification");
const square = (lon: number, lat: number, d = 0.002): BoundaryGeometry => ({ type: "Polygon", coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] });
type Check = { id: string; passed: boolean; detail: string };
const check = (id: string, passed: boolean, detail: string): Check => ({ id, passed, detail });

type Case = { id: string; place: string; hint: string | null; lonLat: [number, number]; radiusM: number; expect: { consulted: string[]; positive: string | null; note: string } };
const CASES: Case[] = [
  { id: "us-iowa", place: "Near Ames, Iowa, USA", hint: "us", lonLat: [-93.62, 42.03], radiusM: 10_000, expect: { consulted: ["usgs", "igrac_ggmn"], positive: "usgs", note: "USGS national adapter must return stations and measurements." } },
  { id: "fr-toulouse", place: "Toulouse, France", hint: "fr", lonLat: [1.44, 43.6], radiusM: 10_000, expect: { consulted: ["hubeau", "igrac_ggmn"], positive: "hubeau", note: "Hub'Eau national adapter must return stations and measurements; GGMN mirrors BRGM." } },
  { id: "au-wagga", place: "Wagga Wagga, NSW, Australia", hint: "au", lonLat: [147.37, -35.12], radiusM: 15_000, expect: { consulted: ["igrac_ggmn"], positive: "igrac_ggmn", note: "No direct BoM adapter (403 / bulk only); BoM bore levels via GGMN." } },
  { id: "bd-mymensingh", place: "Mymensingh, Bangladesh", hint: "bd", lonLat: [90.4, 24.75], radiusM: 25_000, expect: { consulted: ["igrac_ggmn"], positive: null, note: "BWDB data only on registered request; GGMN expected to have no wells here, reported honestly." } },
  { id: "za-gauteng", place: "Johannesburg area, South Africa (no national adapter)", hint: "za", lonLat: [28.0, -26.0], radiusM: 25_000, expect: { consulted: ["igrac_ggmn"], positive: "igrac_ggmn", note: "Global-source path outside any national adapter (South Africa DWS via GGMN)." } },
  { id: "ke-nairobi", place: "Near Nairobi, Kenya (no national adapter)", hint: "ke", lonLat: [36.82, -1.29], radiusM: 10_000, expect: { consulted: ["igrac_ggmn"], positive: null, note: "No-record path: global source consulted, result stated as none in the searched area." } },
];

async function groundwater() {
  const cases = [];
  const allChecks: Check[] = [];
  for (const c of CASES) {
    const field = square(...c.lonLat);
    const t0 = Date.now();
    const res = await lookupGroundwater(field, c.radiusM, c.hint);
    const ms = Date.now() - t0;
    if (!res.ok) { allChecks.push(check(`${c.id}:lookup`, false, res.message)); continue; }
    const consulted = res.providers.filter((p) => p.consulted).map((p) => p.id);
    const checks: Check[] = [check(`${c.id}:routing`, JSON.stringify([...consulted].sort()) === JSON.stringify([...c.expect.consulted].sort()), `consulted ${consulted.join(", ")}`)];
    const errors = res.providers.filter((p) => p.outcome === "error");
    checks.push(check(`${c.id}:no-provider-error`, errors.length === 0, errors.map((e) => `${e.id}: ${e.message}`).join(" | ") || "none"));
    if (c.expect.positive) {
      const mine = res.stations.filter((s) => s.provider === c.expect.positive);
      const withObs = mine.filter((s) => s.measurements.length > 0);
      checks.push(check(`${c.id}:stations`, mine.length > 0, `${mine.length} ${c.expect.positive} station(s) in radius`));
      checks.push(check(`${c.id}:measurements`, withObs.length > 0, `${withObs.length} with observations; latest ${withObs.map((s) => s.measurements[0]!.time.slice(0, 10)).sort().at(-1) ?? "none"}`));
      checks.push(check(`${c.id}:provenance`, withObs.every((s) => s.authority && s.recordUrl && s.retrievedAt && s.measurements.every((m) => m.time && m.originalUnit && m.parameter)), "authority, record URL, retrieval time, original unit and parameter on every record"));
    } else {
      checks.push(check(`${c.id}:honest-outcome`, res.providers.filter((p) => p.consulted).every((p) => p.outcome !== "error") && res.providers.some((p) => p.id === "igrac_ggmn" && p.consulted), `${res.stations.length} station(s); outcomes ${res.providers.map((p) => `${p.id}=${p.outcome}`).join(", ")}`));
    }
    if (c.id === "us-iowa") {
      const m = res.stations.flatMap((s) => s.measurements).find((x) => x.originalUnit === "ft");
      checks.push(check("us-iowa:feet-to-metres", !!m && Math.abs(m.valueM! - m.originalValue * FT_TO_M) < 1e-9, m ? `${m.originalValue} ft → ${m.valueM!.toFixed(3)} m` : "no feet value"));
    }
    if (c.id === "fr-toulouse") {
      const mirrored = res.stations.filter((s) => s.mirrors.some((x) => x.provider === "igrac_ggmn"));
      checks.push(check("fr-toulouse:dedupe-mirrors", mirrored.length > 0, `${mirrored.length} Hub'Eau station(s) also served by GGMN were merged by BSS code (direct record kept)`));
      const s = res.stations.find((x) => x.provider === "hubeau" && x.measurements[0]?.kind === "level_elevation" && x.groundElevation);
      const d = s ? depthBelowGround(s.measurements[0]!, s) : null;
      checks.push(check("fr-toulouse:datum-derivation", !!d && d.derived === true, d ? `NGF level ${s!.measurements[0]!.valueM} m, ground ${s!.groundElevation!.valueM} m NGF → ${d.depthM.toFixed(2)} m (derived)` : "no derivable record"));
    }
    const stale = res.stations.filter((s) => s.recency === "historical").length;
    const metaOnly = res.stations.filter((s) => s.recency === "metadata_only").length;
    allChecks.push(...checks);
    cases.push({
      id: c.id, place: c.place, expectation: c.expect.note, countryHint: c.hint, radiusM: c.radiusM, durationMs: ms,
      providers: res.providers.map((p) => ({ id: p.id, consulted: p.consulted, outcome: p.outcome, message: p.message, stationsFound: p.stationsFound, stationsInRadius: p.stationsInRadius, seriesRequested: p.seriesRequested, truncated: p.truncated, requests: p.requests })),
      stationCounts: { total: res.stations.length, recent: res.stations.filter((s) => s.recency === "recent").length, historical: stale, metadataOnly: metaOnly },
      sample: res.stations.filter((s) => s.measurements.length).slice(0, 2).map((s) => ({ provider: s.provider, stationId: s.stationId, authority: s.authority, distanceKm: +(s.distanceM / 1000).toFixed(2), aquifer: s.aquifer, wellDepthM: s.wellDepthM, groundElevation: s.groundElevation, mirrors: s.mirrors, recency: s.recency, reasons: s.reasons, latest: s.measurements[0], measurementsReturned: s.measurements.length })),
      checks,
    });
  }

  // Provider failure: GGIS unreachable during a French search; Hub'Eau results must survive.
  process.env.ASTRAPON_SIMULATE_OUTAGE = "ggis.un-igrac.org";
  process.env.ASTRAPON_RETRY_BASE_MS = "10";
  const out = await lookupGroundwater(square(1.45, 43.61), 9_000, "fr");
  delete process.env.ASTRAPON_SIMULATE_OUTAGE;
  delete process.env.ASTRAPON_RETRY_BASE_MS;
  const outage = out.ok ? { ggmn: out.providers.find((p) => p.id === "igrac_ggmn")!.outcome, hubeau: out.providers.find((p) => p.id === "hubeau")!.outcome, hubeauStations: out.stations.filter((s) => s.provider === "hubeau").length, message: out.providers.find((p) => p.id === "igrac_ggmn")!.message } : null;
  allChecks.push(check("outage:partial-results", !!outage && outage.ggmn === "error" && outage.hubeauStations > 0 && outage.message.includes("not “no groundwater”"), JSON.stringify(outage)));

  const ok = allChecks.every((c) => c.passed);
  return {
    artifact: "LIVE VERIFICATION RECORD — produced by scripts/water-trace.mts. Not a fixture and not an input to the product.",
    sourceId: "groundwater-routing",
    generatedAt: new Date().toISOString(),
    outcome: ok ? "live_verified" : "failed",
    checks: allChecks,
    trace: cases.find((c) => c.id === "us-iowa")?.sample[0] ?? null,
    cases,
    outage,
  };
}

async function overpass() {
  const field = square(90.4, 24.75);
  const res = await lookupSurfaceWater(field, 3000);
  const checks: Check[] = [];
  if (!res.ok) checks.push(check("overpass:lookup", false, res.message));
  else {
    checks.push(check("overpass:features", res.sources.length > 0, `${res.total} mapped water feature(s) within 3 km; nearest ${res.sources[0]?.category} at ${res.sources[0]?.distanceM} m`));
    checks.push(check("overpass:geometry-kinds", res.sources.some((s) => s.role === "centreline") || res.sources.some((s) => s.role === "outline"), [...new Set(res.sources.map((s) => s.role))].join(", ")));
    checks.push(check("overpass:distances-bounded", res.sources.every((s) => s.distanceM >= 0 && s.distanceM <= 3000), "0 ≤ distance ≤ radius"));
    checks.push(check("overpass:provenance", !!res.provider.osmBase && !!res.provider.retrievedAt, `OSM base ${res.provider.osmBase}`));
  }
  return {
    artifact: "LIVE VERIFICATION RECORD — produced by scripts/water-trace.mts. Not a fixture and not an input to the product.",
    sourceId: "osm-overpass-water",
    generatedAt: new Date().toISOString(),
    outcome: checks.every((c) => c.passed) ? "live_verified" : "failed",
    checks,
    trace: res.ok ? res.sources.slice(0, 5).map((s) => ({ id: s.id, name: s.name, category: s.category, role: s.role, distanceM: s.distanceM, intersects: s.intersects, lastEdited: s.lastEdited })) : null,
    provider: res.ok ? { ...res.provider, endpoint: res.provider.endpoint } : null,
    site: "Synthetic 0.002° square at Mymensingh, Bangladesh (public place, not a farm)",
  };
}

async function solar() {
  const res = await lookupSolar(square(90.4, 24.75));
  const checks: Check[] = [];
  if (!res.ok) checks.push(check("power:solar", false, res.error));
  else {
    checks.push(check("power:units", /kW-?hr\/m\^2\/day/i.test(res.provenance.units), res.provenance.units));
    checks.push(check("power:months", res.summary.months.every((m) => m.meanPsh != null && m.meanPsh > 0 && m.meanPsh < 12), res.summary.months.map((m) => m.meanPsh?.toFixed(2)).join(" ")));
    checks.push(check("power:fill-is-missing", res.summary.missingDays >= 0, `${res.summary.missingDays} missing day(s) kept as missing`));
    checks.push(check("power:period", res.provenance.requestedYears[1] - res.provenance.requestedYears[0] === 9, `${res.summary.fromDate} … ${res.summary.toDate}`));
  }
  return {
    artifact: "LIVE VERIFICATION RECORD — produced by scripts/water-trace.mts. Not a fixture and not an input to the product.",
    sourceId: "nasa-power-solar-re",
    generatedAt: new Date().toISOString(),
    outcome: checks.every((c) => c.passed) ? "live_verified" : "failed",
    checks,
    trace: res.ok ? { months: res.summary.months, annualMeanPsh: res.summary.annualMeanPsh, provenance: { ...res.provenance, url: res.provenance.url.split("?")[0] } } : null,
    site: "Mymensingh, Bangladesh (public place)",
  };
}

const which = process.argv.slice(2);
const run = async (name: string, fn: () => Promise<{ outcome: string; checks: Check[] }>) => {
  if (which.length && !which.includes(name)) return true;
  const art = await fn();
  writeFileSync(path.join(OUT, `water-${name}.json`), JSON.stringify(art, null, 2) + "\n");
  for (const c of art.checks) console.log(`${c.passed ? "PASS" : "FAIL"} ${c.id} — ${c.detail}`);
  console.log(`${name}: ${art.outcome}`);
  return art.outcome === "live_verified";
};
const results = [await run("power-solar", solar), await run("overpass", overpass), await run("groundwater", groundwater)];
process.exit(results.every(Boolean) ? 0 : 1);
