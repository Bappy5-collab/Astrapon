import { z } from "zod";

/**
 * Parser for USDA NASS "Usual Planting and Harvesting Dates for U.S. Field Crops" (October 2010),
 * raw text committed at data/reference/usda-nass-usual-dates-2010.txt. Only the per-state tables
 * ("Usual Planting and Harvesting Dates by Crop - <State>") are read. Dates are "MM-DD".
 */

export const calendarEntrySchema = z.object({
  region: z.string().min(1),
  sourceCrop: z.string().min(1),
  cropId: z.string().min(1),
  plant: z.object({ begin: z.string(), activeStart: z.string(), activeEnd: z.string(), end: z.string() }),
  harvest: z.object({ begin: z.string(), activeStart: z.string(), activeEnd: z.string(), end: z.string() }),
});
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

/** NASS row label → catalogue id. Silage, hay, sugar crops, tobacco and durum are not mapped. */
export const NASS_CROP_MAP: Record<string, string> = {
  "corn for grain": "maize",
  "wheat, winter": "winter_wheat",
  "winter, wheat": "winter_wheat",
  "wheat, spring": "spring_wheat",
  soybeans: "soybean",
  "oats, spring": "oats",
  "oats, fall": "oats",
  "barley, spring": "barley",
  "barley, fall": "barley",
  "cotton, all": "cotton",
  "sorghum for grain": "sorghum",
  "potatoes, fall": "potato",
  "potatoes, spring": "potato",
  "potatoes, summer": "potato",
  "potatoes, all": "potato",
  "beans, dry edible": "dry_bean",
  "peas, dry edible": "pea_dry",
  peanuts: "groundnut",
  "sunflower, all": "sunflower",
  "rice, all": "rice",
  rye: "rye",
  flaxseed: "flax",
  canola: "rapeseed",
};

const MONTH: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12" };
const TOKEN = /\(NA\)|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/g;

function tokens(s: string): (string | null)[] {
  const out: (string | null)[] = [];
  for (const m of s.matchAll(TOKEN)) {
    if (m[0] === "(NA)") out.push(null);
    else out.push(`${MONTH[m[1]!.toLowerCase()]}-${m[2]!.padStart(2, "0")}`);
  }
  return out;
}

export function parseNassUsualDates(text: string): CalendarEntry[] {
  const lines = text.split(/\r?\n/);
  const out: CalendarEntry[] = [];
  let state: string | null = null;
  for (const line of lines) {
    const header = /^Usual Planting and Harvesting Dates by Crop - (.+?)\s*$/.exec(line);
    if (header) {
      state = header[1]!;
      continue;
    }
    if (!state) continue;
    const row = /^([A-Z][A-Za-z ,()-]+?)\s*\.{2,}\s*:(.*)$/.exec(line);
    if (!row) continue;
    const label = row[1]!.trim().toLowerCase().replace(/\s+/g, " ");
    const cropId = NASS_CROP_MAP[label];
    if (!cropId) continue;
    const t = tokens(row[2]!);
    // Planting: 4 dates, or 3 (NA) markers; harvesting likewise.
    let i = 0;
    const take = (): CalendarEntry["plant"] | null => {
      if (t[i] === null) {
        i += 3;
        return null;
      }
      const v = t.slice(i, i + 4);
      i += 4;
      return v.length === 4 && v.every((x): x is string => typeof x === "string") ? { begin: v[0]!, activeStart: v[1]!, activeEnd: v[2]!, end: v[3]! } : null;
    };
    const plant = take();
    const harvest = take();
    if (!plant || !harvest) continue;
    out.push({ region: state, sourceCrop: row[1]!.trim(), cropId, plant, harvest });
  }
  return out;
}

export function calendarRegions(entries: CalendarEntry[]): string[] {
  return [...new Set(entries.map((e) => e.region))].sort();
}
