import { z } from "zod";

import { SEASONS, ZONE_BASES } from "@/domain/farm/records";
import type { BoundaryGeometry } from "@/domain/geo/boundary";

/**
 * Field workspace: what the farmer edits in the 3D/map workspace and how it is saved.
 * Edits are staged in the browser and committed together by one transactional RPC
 * (`save_field_workspace`), after the farmer confirms a summary of the changes.
 */

export type Season = (typeof SEASONS)[number];

export type HistoryEntry = {
  id: string;
  zone_id: string | null;
  season_year: number;
  season: string;
  crop_name: string;
};

export type WorkspaceZone = {
  /** Existing zone id, or a client key ("new-…") for a zone not yet saved. */
  key: string;
  saved: boolean;
  name: string;
  basis: (typeof ZONE_BASES)[number];
  notes: string;
  boundary: BoundaryGeometry;
  areaHa: number;
};

export type CropAssignment = { zoneKey: string | null; seasonYear: number; season: Season; cropName: string };

const geometry = z.custom<BoundaryGeometry>((v) => typeof v === "object" && v !== null && "type" in v && "coordinates" in v, "Geometry required");

export const workspaceEditsInput = z
  .object({
    boundary: z.object({ geometry, source: z.enum(["farmer_drawn", "farmer_uploaded", "farmer_entered_coordinates"]) }).nullable(),
    deleteZoneIds: z.array(z.uuid()).max(200),
    zones: z
      .array(
        z.object({
          id: z.uuid().nullable(),
          ref: z.string().min(1).max(64),
          name: z.string().trim().min(1, "Zone name required").max(120),
          basis: z.enum(ZONE_BASES),
          notes: z.string().max(2000).nullable(),
          boundary: geometry.nullable(),
        }),
      )
      .max(200),
    crops: z
      .array(
        z.object({
          zoneRef: z.string().max(64).nullable(),
          seasonYear: z.number().int().min(1950).max(2100),
          season: z.enum(SEASONS),
          cropName: z.string().trim().min(1, "Crop name required").max(80),
        }),
      )
      .max(500),
  })
  .refine((v) => v.zones.every((z) => z.id !== null || z.boundary !== null), { message: "A new zone needs a boundary", path: ["zones"] })
  .refine((v) => new Set(v.zones.map((z) => z.name.toLowerCase())).size === v.zones.length, { message: "Zone names must be unique", path: ["zones"] });

export type WorkspaceEdits = z.infer<typeof workspaceEditsInput>;

export const isNewZoneKey = (key: string) => key.startsWith("new-");

/** Years shown on the seasonal timeline: every recorded year plus the last `span` years up to `currentYear`. */
export function timelineYears(history: Pick<HistoryEntry, "season_year">[], currentYear: number, span = 6): number[] {
  const years = new Set<number>(history.map((h) => h.season_year));
  for (let y = currentYear - span + 1; y <= currentYear; y++) years.add(y);
  return [...years].filter((y) => y <= currentYear).sort((a, b) => a - b);
}

const SEASON_ORDER: Record<string, number> = { main: 0, summer: 1, spring: 2, winter: 3, double_crop: 4, cover: 5 };

export type ResolvedCrop = { cropName: string; season: string; scope: "zone" | "field"; pending: boolean } | null;

/**
 * The crop shown for a zone (or the whole field when zoneKey is null) in a year.
 * A pending assignment wins; then a zone-specific record; then a whole-field record.
 * Among several seasons in one year the main season is preferred.
 */
export function resolveCrop(history: HistoryEntry[], pending: CropAssignment[], zoneKey: string | null, year: number): ResolvedCrop {
  const p = pending.filter((a) => a.seasonYear === year && a.zoneKey === zoneKey).sort((a, b) => (SEASON_ORDER[a.season] ?? 9) - (SEASON_ORDER[b.season] ?? 9))[0];
  if (p) return { cropName: p.cropName, season: p.season, scope: zoneKey ? "zone" : "field", pending: true };
  const pick = (zone: string | null) =>
    history.filter((h) => h.season_year === year && h.zone_id === zone).sort((a, b) => (SEASON_ORDER[a.season] ?? 9) - (SEASON_ORDER[b.season] ?? 9))[0];
  const own = zoneKey ? pick(zoneKey) : undefined;
  if (own) return { cropName: own.crop_name, season: own.season, scope: "zone", pending: false };
  if (zoneKey) {
    const fieldPending = pending.find((a) => a.seasonYear === year && a.zoneKey === null);
    if (fieldPending) return { cropName: fieldPending.cropName, season: fieldPending.season, scope: "field", pending: true };
  }
  const whole = pick(null);
  return whole ? { cropName: whole.crop_name, season: whole.season, scope: "field", pending: false } : null;
}

/** Adds or replaces one pending assignment (same zone, year and season). */
export function upsertAssignment(list: CropAssignment[], next: CropAssignment): CropAssignment[] {
  return [...list.filter((a) => !(a.zoneKey === next.zoneKey && a.seasonYear === next.seasonYear && a.season === next.season)), next];
}

export type ChangeLine = { kind: "boundary" | "zone_new" | "zone_edit" | "zone_delete" | "crop"; text: string };

/** Human-readable summary shown in the save confirmation. */
export function summariseChanges(args: {
  boundary: { before: number | null; after: number } | null;
  zones: WorkspaceZone[];
  editedZoneKeys: Set<string>;
  deletedZones: { name: string }[];
  crops: CropAssignment[];
  zoneName: (key: string | null) => string;
}): ChangeLine[] {
  const out: ChangeLine[] = [];
  if (args.boundary)
    out.push({
      kind: "boundary",
      text: args.boundary.before === null ? `Field boundary: new, ${args.boundary.after.toFixed(2)} ha` : `Field boundary: ${args.boundary.before.toFixed(2)} ha → ${args.boundary.after.toFixed(2)} ha`,
    });
  for (const z of args.zones) {
    if (!z.saved) out.push({ kind: "zone_new", text: `New zone “${z.name}”, ${z.areaHa.toFixed(2)} ha` });
    else if (args.editedZoneKeys.has(z.key)) out.push({ kind: "zone_edit", text: `Zone “${z.name}” changed` });
  }
  for (const d of args.deletedZones) out.push({ kind: "zone_delete", text: `Delete zone “${d.name}” and its zone-specific records` });
  for (const c of [...args.crops].sort((a, b) => a.seasonYear - b.seasonYear))
    out.push({ kind: "crop", text: `${c.seasonYear} ${c.season.replace("_", " ")} · ${args.zoneName(c.zoneKey)}: ${c.cropName}` });
  return out;
}
