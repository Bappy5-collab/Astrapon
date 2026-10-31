import "server-only";

import type { WorkspaceFieldData } from "@/components/workspace/types";
import { SOIL_PROPERTIES, ZONE_BASES } from "@/domain/farm/records";

import type { getField } from "./queries";

type Field = NonNullable<Awaited<ReturnType<typeof getField>>>;

/** Maps a loaded field (RLS-scoped) to the workspace's client data. Notes are not sent to the 3D view. */
export function toWorkspaceField(field: Field): WorkspaceFieldData {
  const zoneGeom = new Map(field.geometry.zones.map((z) => [z.id, z.boundary]));
  const placeLabel = field.notes?.startsWith("Located via: ") ? field.notes.slice("Located via: ".length).split("\n")[0]!.slice(0, 120) : null;
  return {
    id: field.id,
    name: field.name,
    farmName: field.farmName,
    farmHref: `/farms/${field.farm_id}`,
    countryCode: field.countryCode,
    placeLabel,
    boundary: field.geometry.boundary,
    areaHa: field.area_ha === null ? null : Number(field.area_ha),
    zones: field.zones
      .filter((z) => zoneGeom.has(z.id))
      .map((z) => ({
        id: z.id,
        name: z.name,
        basis: (ZONE_BASES as readonly string[]).includes(z.basis) ? (z.basis as (typeof ZONE_BASES)[number]) : "farmer_knowledge",
        notes: z.notes,
        areaHa: Number(z.area_ha ?? 0),
        boundary: zoneGeom.get(z.id)!,
      })),
    history: field.history.map((h) => ({
      id: h.id,
      zone_id: h.zone_id,
      season_year: h.season_year,
      season: h.season,
      crop_name: h.crop_name,
      planted_on: h.planted_on,
      harvested_on: h.harvested_on,
      reported_yield: h.reported_yield === null ? null : Number(h.reported_yield),
      reported_yield_unit: h.reported_yield_unit,
    })),
    soil: field.soil.map((s) => ({
      id: s.id,
      zone_id: s.zone_id,
      label: SOIL_PROPERTIES[s.property as keyof typeof SOIL_PROPERTIES]?.label ?? s.property,
      value: `${s.value_numeric ?? s.value_text ?? ""}${s.unit ? ` ${s.unit}` : ""}`,
      observed_on: s.observed_on,
      evidence_class: s.evidence_class,
    })),
    scenarioCount: field.scenarios.length,
  };
}
