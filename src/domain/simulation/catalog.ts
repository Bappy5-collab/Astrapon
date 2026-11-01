import { z } from "zod";

/**
 * Crop catalogue, published as the reference dataset `crop-parameters` and pinned by snapshots.
 * Every number was checked on 2026-11-01 against the primary source:
 *
 * - FAO-56 (Allen et al. 1998) Table 12 (Kc), Table 11 (stage lengths, regional examples) and
 *   Table 22 (maximum rooting depth range, depletion fraction p).
 * - USDA PLANTS Database PlantProfile API (botanical family).
 *
 * Group Kc ini is used where a crop row leaves it blank (Table 12 note). Table 11 rows without a
 * stated region were not transcribed. Crops with no FAO-56 row carry only their family, and the
 * engine reports water indicators for them as insufficient evidence. See
 * docs/scientific-methodology.md §3.
 */

const kcValue = z.union([z.number().min(0).max(1.5), z.object({ low: z.number().min(0).max(1.5), high: z.number().min(0).max(1.5) })]);

export const stageExampleSchema = z.object({
  ini: z.number().int().min(0),
  dev: z.number().int().min(0),
  mid: z.number().int().min(0),
  late: z.number().int().min(0),
  plantDate: z.string(),
  region: z.string().min(1),
});

export const cropParamsSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().min(1),
  scientificName: z.string().nullable(),
  plantsSymbol: z.string().nullable(),
  family: z.string().min(1),
  familyNote: z.string().optional(),
  aliases: z.array(z.string().min(1)),
  role: z.enum(["crop", "cover"]),
  fao56: z
    .object({
      table12Row: z.string(),
      kcIni: z.union([z.number().min(0).max(1.5), z.object({ frozen: z.number(), nonFrozen: z.number() })]),
      kcMid: kcValue,
      kcEnd: kcValue,
      kcNote: z.string().optional(),
      /** Footnote 9: the lower Kc mid applies to rainfed crops. */
      rainfedUsesLowKcMid: z.boolean().optional(),
      table22Row: z.string(),
      rootDepthM: z.tuple([z.number().positive(), z.number().positive()]),
      p: z.number().min(0.05).max(0.9),
      /** "potential_only": FAO-56 p is relative to saturation (flooded paddy); no root-zone balance. */
      waterBalance: z.enum(["full", "potential_only"]),
      stages: z.array(stageExampleSchema),
    })
    .nullable(),
  notes: z.array(z.string()),
});

export type CropParams = z.infer<typeof cropParamsSchema>;
export type StageExample = z.infer<typeof stageExampleSchema>;

const st = (ini: number, dev: number, mid: number, late: number, plantDate: string, region: string): StageExample => ({ ini, dev, mid, late, plantDate, region });
const SMALL_GRAIN_STAGES = [
  st(15, 25, 50, 30, "November", "Central India"),
  st(20, 25, 60, 30, "March/Apr", "35-45°L"),
  st(15, 30, 65, 40, "July", "East Africa"),
  st(20, 50, 60, 30, "Dec", "Calif. Desert, USA"),
];

export const CROP_CATALOG: CropParams[] = [
  {
    id: "maize", label: "Maize (grain)", scientificName: "Zea mays", plantsSymbol: "ZEMA", family: "Poaceae", role: "crop",
    aliases: ["maize", "corn", "field corn", "grain maize", "corn for grain", "ভুট্টা", "bhutta", "vutta"],
    fao56: {
      table12Row: "Maize, Field (grain) (field corn)", kcIni: 0.3, kcMid: 1.2, kcEnd: 0.35,
      kcNote: "Kc end 0.35 is for harvest after field drying; Table 12 gives 0.60 for harvest at high grain moisture (footnote 11). Kc ini is the cereals group value.",
      table22Row: "Maize, Field (grain) (field corn)", rootDepthM: [1.0, 1.7], p: 0.55, waterBalance: "full",
      stages: [
        st(30, 50, 60, 40, "April", "East Africa (alt.)"), st(25, 40, 45, 30, "Dec/Jan", "Arid Climate"), st(20, 35, 40, 30, "June", "Nigeria (humid)"),
        st(20, 35, 40, 30, "October", "India (dry, cool)"), st(30, 40, 50, 30, "April", "Spain (spr, sum.); Calif."), st(30, 40, 50, 50, "April", "Idaho, USA"),
      ],
    },
    notes: [],
  },
  {
    id: "soybean", label: "Soybean", scientificName: "Glycine max", plantsSymbol: "GLMA4", family: "Fabaceae", role: "crop",
    aliases: ["soybean", "soybeans", "soy", "soya", "soya bean", "সয়াবিন", "soyabin"],
    fao56: {
      table12Row: "Soybeans", kcIni: 0.4, kcMid: 1.15, kcEnd: 0.5, kcNote: "Kc ini is the legumes group value.",
      table22Row: "Soybeans", rootDepthM: [0.6, 1.3], p: 0.5, waterBalance: "full",
      stages: [st(15, 15, 40, 15, "Dec", "Tropics"), st(20, 35, 60, 25, "May", "Central USA"), st(20, 25, 75, 30, "June", "Japan")],
    },
    notes: ["Table 11 lists the Central USA development stage as 30/35 days; 35 is used because it matches the stated 140-day total."],
  },
  {
    id: "winter_wheat", label: "Winter wheat", scientificName: "Triticum aestivum", plantsSymbol: "TRAE", family: "Poaceae", role: "crop",
    aliases: ["winter wheat", "wheat, winter", "winter, wheat"],
    fao56: {
      table12Row: "Winter Wheat", kcIni: { frozen: 0.4, nonFrozen: 0.7 }, kcMid: 1.15, kcEnd: 0.25,
      kcNote: "Kc end 0.25 is for machine harvest; Table 12 gives up to 0.4 for hand-harvested crops (footnote 10).",
      table22Row: "Winter Wheat", rootDepthM: [1.5, 1.8], p: 0.55, waterBalance: "full",
      stages: [st(20, 60, 70, 30, "December", "Calif., USA"), st(30, 140, 40, 30, "November", "Mediterranean"), st(160, 75, 75, 25, "October", "Idaho, USA")],
    },
    notes: [],
  },
  {
    id: "spring_wheat", label: "Wheat (spring type)", scientificName: "Triticum aestivum", plantsSymbol: "TRAE", family: "Poaceae", role: "crop",
    aliases: ["spring wheat", "wheat, spring", "wheat", "গম", "gom"],
    fao56: {
      table12Row: "Spring Wheat", kcIni: 0.3, kcMid: 1.15, kcEnd: 0.25, kcNote: "Kc end 0.25 is for machine harvest (footnote 10). Kc ini is the cereals group value.",
      table22Row: "Spring Wheat", rootDepthM: [1.0, 1.5], p: 0.55, waterBalance: "full", stages: SMALL_GRAIN_STAGES,
    },
    notes: ["Stage examples are FAO-56 Table 11 'Barley/Oats/Wheat'.", "Unqualified 'wheat' is treated as a spring (non-vernalising) type; record 'winter wheat' if yours is."],
  },
  {
    id: "barley", label: "Barley", scientificName: "Hordeum vulgare", plantsSymbol: "HOVU", family: "Poaceae", role: "crop",
    aliases: ["barley", "barley, spring", "barley, fall", "যব", "job", "jab"],
    fao56: { table12Row: "Barley", kcIni: 0.3, kcMid: 1.15, kcEnd: 0.25, table22Row: "Barley", rootDepthM: [1.0, 1.5], p: 0.55, waterBalance: "full", stages: SMALL_GRAIN_STAGES },
    notes: ["Stage examples are FAO-56 Table 11 'Barley/Oats/Wheat'."],
  },
  {
    id: "oats", label: "Oats", scientificName: "Avena sativa", plantsSymbol: "AVSA", family: "Poaceae", role: "crop",
    aliases: ["oats", "oat", "oats, spring", "oats, fall", "ওট"],
    fao56: { table12Row: "Oats", kcIni: 0.3, kcMid: 1.15, kcEnd: 0.25, table22Row: "Oats", rootDepthM: [1.0, 1.5], p: 0.55, waterBalance: "full", stages: SMALL_GRAIN_STAGES },
    notes: ["Stage examples are FAO-56 Table 11 'Barley/Oats/Wheat'."],
  },
  {
    id: "sorghum", label: "Sorghum (grain)", scientificName: "Sorghum bicolor", plantsSymbol: "SOBI2", family: "Poaceae", role: "crop",
    aliases: ["sorghum", "grain sorghum", "sorghum for grain", "milo", "joar", "জোয়ার"],
    fao56: {
      table12Row: "Sorghum - grain", kcIni: 0.3, kcMid: { low: 1.0, high: 1.1 }, kcEnd: 0.55,
      table22Row: "Sorghum - grain", rootDepthM: [1.0, 2.0], p: 0.55, waterBalance: "full",
      stages: [st(20, 35, 40, 30, "May/June", "USA, Pakis., Med."), st(20, 35, 45, 30, "Mar/April", "Arid Region")],
    },
    notes: [],
  },
  {
    id: "rice", label: "Rice (paddy)", scientificName: "Oryza sativa", plantsSymbol: "ORSA", family: "Poaceae", role: "crop",
    aliases: ["rice", "paddy", "rice, all", "aman", "boro", "aus", "ধান", "dhan", "চাল"],
    fao56: {
      table12Row: "Rice", kcIni: 1.05, kcMid: 1.2, kcEnd: { low: 0.6, high: 0.9 },
      table22Row: "Rice", rootDepthM: [0.5, 1.0], p: 0.2, waterBalance: "potential_only",
      stages: [st(30, 30, 60, 30, "Dec; May", "Tropics; Mediterranean"), st(30, 30, 80, 40, "May", "Tropics")],
    },
    notes: ["FAO-56 gives p for rice as 0.20 of saturation (flooded); Astrapon reports potential water use only."],
  },
  {
    id: "lentil", label: "Lentil", scientificName: "Lens culinaris", plantsSymbol: "LECU2", family: "Fabaceae", role: "crop",
    aliases: ["lentil", "lentils", "মসুর", "mosur", "masur"],
    fao56: {
      table12Row: "Lentil", kcIni: 0.4, kcMid: 1.1, kcEnd: 0.3, kcNote: "Kc ini is the legumes group value.",
      table22Row: "Lentil", rootDepthM: [0.6, 0.8], p: 0.5, waterBalance: "full",
      stages: [st(20, 30, 60, 40, "April", "Europe"), st(25, 35, 70, 40, "Oct/Nov", "Arid Region")],
    },
    notes: [],
  },
  {
    id: "chickpea", label: "Chickpea", scientificName: "Cicer arietinum", plantsSymbol: "CIAR5", family: "Fabaceae", role: "crop",
    aliases: ["chickpea", "chickpeas", "chick pea", "garbanzo", "ছোলা", "chola", "chhola"],
    fao56: {
      table12Row: "Chick pea", kcIni: 0.4, kcMid: 1.0, kcEnd: 0.35, kcNote: "Kc ini is the legumes group value.",
      table22Row: "Chick pea", rootDepthM: [0.6, 1.0], p: 0.5, waterBalance: "full", stages: [],
    },
    notes: ["FAO-56 Table 11 has no chickpea row, so daily water indicators are insufficient evidence."],
  },
  {
    id: "dry_bean", label: "Dry bean", scientificName: "Phaseolus vulgaris", plantsSymbol: "PHVU", family: "Fabaceae", role: "crop",
    aliases: ["dry bean", "dry beans", "bean", "beans", "beans, dry edible", "dry edible beans"],
    fao56: {
      table12Row: "Beans, dry and Pulses", kcIni: 0.4, kcMid: 1.15, kcEnd: 0.35,
      table22Row: "Beans, dry and Pulses", rootDepthM: [0.6, 0.9], p: 0.45, waterBalance: "full",
      stages: [st(20, 30, 40, 20, "May/June", "Continental Climates"), st(15, 25, 35, 20, "June", "Pakistan, Calif."), st(25, 25, 30, 20, "June", "Idaho, USA")],
    },
    notes: [],
  },
  {
    id: "pea_dry", label: "Pea (dry)", scientificName: "Pisum sativum", plantsSymbol: "PISA6", family: "Fabaceae", role: "crop",
    aliases: ["pea", "peas", "dry pea", "dry peas", "field pea", "peas, dry edible", "মটর", "motor", "matar"],
    fao56: {
      table12Row: "Peas - Dry/Seed", kcIni: 0.4, kcMid: 1.15, kcEnd: 0.3, kcNote: "Kc ini is the legumes group value.",
      table22Row: "Peas - Dry/Seed", rootDepthM: [0.6, 1.0], p: 0.4, waterBalance: "full",
      stages: [st(15, 25, 35, 15, "May", "Europe"), st(20, 30, 35, 15, "Mar/Apr", "Mediterranean"), st(35, 25, 30, 20, "April", "Idaho, USA")],
    },
    notes: [],
  },
  {
    id: "faba_bean", label: "Faba bean (dry)", scientificName: "Vicia faba", plantsSymbol: "VIFA", family: "Fabaceae", role: "crop",
    aliases: ["faba bean", "fava bean", "broad bean", "fababean"],
    fao56: {
      table12Row: "Fababean - Dry/Seed", kcIni: 0.5, kcMid: 1.15, kcEnd: 0.3,
      table22Row: "Fababean - Dry/Seed", rootDepthM: [0.5, 0.7], p: 0.45, waterBalance: "full",
      stages: [st(15, 25, 35, 15, "May", "Europe"), st(20, 30, 35, 15, "Mar/Apr", "Mediterranean"), st(90, 45, 40, 60, "Nov", "Europe (dry)")],
    },
    notes: [],
  },
  {
    id: "green_gram_cowpea", label: "Mung bean / cowpea", scientificName: "Vigna unguiculata; Vigna radiata", plantsSymbol: "VIUN", family: "Fabaceae", role: "crop",
    aliases: ["mung", "mung bean", "mungbean", "green gram", "cowpea", "cowpeas", "মুগ", "mug", "moog"],
    fao56: {
      table12Row: "Green Gram and Cowpeas", kcIni: 0.4, kcMid: 1.05, kcEnd: 0.35, kcNote: "Kc end 0.35 is for dry harvest; 0.60 if harvested fresh (footnote 6). Kc ini is the legumes group value.",
      table22Row: "Green Gram and Cowpeas", rootDepthM: [0.6, 1.0], p: 0.45, waterBalance: "full",
      stages: [st(20, 30, 30, 20, "March", "Mediterranean")],
    },
    notes: ["Family checked for cowpea (VIUN); mung bean is in the same genus."],
  },
  {
    id: "groundnut", label: "Groundnut (peanut)", scientificName: "Arachis hypogaea", plantsSymbol: "ARHY", family: "Fabaceae", role: "crop",
    aliases: ["groundnut", "peanut", "peanuts", "চিনাবাদাম", "badam", "chinabadam"],
    fao56: {
      table12Row: "Groundnut (Peanut)", kcIni: 0.4, kcMid: 1.15, kcEnd: 0.6, kcNote: "Kc ini is the legumes group value.",
      table22Row: "Groundnut (Peanut)", rootDepthM: [0.5, 1.0], p: 0.5, waterBalance: "full",
      stages: [st(25, 35, 45, 25, "Dry season", "West Africa"), st(35, 35, 35, 35, "(not stated)", "High Latitudes")],
    },
    notes: [],
  },
  {
    id: "potato", label: "Potato", scientificName: "Solanum tuberosum", plantsSymbol: "SOTU", family: "Solanaceae", role: "crop",
    aliases: ["potato", "potatoes", "potatoes, fall", "potatoes, spring", "potatoes, summer", "potatoes, all", "আলু", "alu", "aloo"],
    fao56: {
      table12Row: "Potato", kcIni: 0.5, kcMid: 1.15, kcEnd: 0.75, kcNote: "Kc end is about 0.40 for long-season potatoes with vine kill (footnote 4). Kc ini is the roots and tubers group value.",
      table22Row: "Potato", rootDepthM: [0.4, 0.6], p: 0.35, waterBalance: "full",
      stages: [st(25, 30, 45, 30, "May", "Continental Climate"), st(30, 35, 50, 30, "April", "Europe"), st(45, 30, 70, 20, "Apr/May", "Idaho, USA"), st(30, 35, 50, 25, "Dec", "Calif. Desert, USA")],
    },
    notes: [],
  },
  {
    id: "cotton", label: "Cotton", scientificName: "Gossypium hirsutum", plantsSymbol: "GOHI", family: "Malvaceae", role: "crop",
    aliases: ["cotton", "cotton, all", "তুলা", "tula"],
    fao56: {
      table12Row: "Cotton", kcIni: 0.35, kcMid: { low: 1.15, high: 1.2 }, kcEnd: { low: 0.5, high: 0.7 }, kcNote: "Kc ini is the fibre crops group value.",
      table22Row: "Cotton", rootDepthM: [1.0, 1.7], p: 0.65, waterBalance: "full",
      stages: [st(30, 50, 60, 55, "Mar-May", "Egypt; Pakistan; Calif."), st(45, 90, 45, 45, "Mar", "Calif. Desert, USA"), st(30, 50, 60, 55, "Sept", "Yemen"), st(30, 50, 55, 45, "April", "Texas")],
    },
    notes: [],
  },
  {
    id: "sunflower", label: "Sunflower", scientificName: "Helianthus annuus", plantsSymbol: "HEAN3", family: "Asteraceae", role: "crop",
    aliases: ["sunflower", "sunflower, all", "সূর্যমুখী", "surjomukhi"],
    fao56: {
      table12Row: "Sunflower", kcIni: 0.35, kcMid: { low: 1.0, high: 1.15 }, kcEnd: 0.35, rainfedUsesLowKcMid: true, kcNote: "Kc ini is the oil crops group value.",
      table22Row: "Sunflower", rootDepthM: [0.8, 1.5], p: 0.45, waterBalance: "full", stages: [st(25, 35, 45, 25, "April/May", "Medit.; California")],
    },
    notes: [],
  },
  {
    id: "rapeseed", label: "Rapeseed / canola", scientificName: "Brassica napus", plantsSymbol: "BRNA", family: "Brassicaceae", role: "crop",
    aliases: ["rapeseed", "canola", "rape", "oilseed rape"],
    fao56: {
      table12Row: "Rapeseed, Canola", kcIni: 0.35, kcMid: { low: 1.0, high: 1.15 }, kcEnd: 0.35, rainfedUsesLowKcMid: true, kcNote: "Kc ini is the oil crops group value.",
      table22Row: "Rapeseed, Canola", rootDepthM: [1.0, 1.5], p: 0.6, waterBalance: "full", stages: [],
    },
    notes: ["FAO-56 Table 11 has no rapeseed row, so daily water indicators are insufficient evidence.", "Return interval: at most once in three years (Canola Council of Canada)."],
  },
  {
    id: "sesame", label: "Sesame", scientificName: "Sesamum orientale", plantsSymbol: "SEIN3", family: "Pedaliaceae", role: "crop",
    aliases: ["sesame", "তিল", "til"],
    fao56: {
      table12Row: "Sesame", kcIni: 0.35, kcMid: 1.1, kcEnd: 0.25, kcNote: "Kc ini is the oil crops group value.",
      table22Row: "Sesame", rootDepthM: [1.0, 1.5], p: 0.6, waterBalance: "full", stages: [st(20, 30, 40, 20, "June", "China")],
    },
    notes: [],
  },
  {
    id: "millet", label: "Millet", scientificName: null, plantsSymbol: null, family: "Poaceae", role: "crop",
    aliases: ["millet", "pearl millet", "proso millet", "kaon", "কাউন"],
    fao56: {
      table12Row: "Millet", kcIni: 0.3, kcMid: 1.0, kcEnd: 0.3, kcNote: "Kc ini is the cereals group value.",
      table22Row: "Millet", rootDepthM: [1.0, 2.0], p: 0.55, waterBalance: "full",
      stages: [st(15, 25, 40, 25, "June", "Pakistan"), st(20, 30, 55, 35, "April", "Central USA")],
    },
    notes: ["FAO-56 'Millet' does not name a species. Family checked for pearl millet (PEGL2)."],
  },
  {
    id: "flax", label: "Flax / linseed", scientificName: "Linum usitatissimum", plantsSymbol: "LIUS", family: "Linaceae", role: "crop",
    aliases: ["flax", "linseed", "flaxseed", "তিসি", "tishi"],
    fao56: {
      table12Row: "Flax", kcIni: 0.35, kcMid: 1.1, kcEnd: 0.25, kcNote: "Kc ini is the fibre crops group value.",
      table22Row: "Flax", rootDepthM: [1.0, 1.5], p: 0.5, waterBalance: "full",
      stages: [st(25, 35, 50, 40, "April", "Europe"), st(30, 40, 100, 50, "October", "Arizona")],
    },
    notes: [],
  },
  {
    id: "mustard", label: "Mustard", scientificName: "Brassica juncea", plantsSymbol: "BRJU", family: "Brassicaceae", role: "crop",
    aliases: ["mustard", "সরিষা", "shorisha", "sorisha", "sharisha", "sarisha"],
    fao56: null,
    notes: ["FAO-56 lists rapeseed/canola but not mustard; Astrapon does not substitute another crop's coefficients."],
  },
  {
    id: "jute", label: "Jute", scientificName: "Corchorus olitorius", plantsSymbol: "COOL", family: "Tiliaceae", familyNote: "USDA PLANTS lists Tiliaceae; APG IV places Corchorus in Malvaceae.", role: "crop",
    aliases: ["jute", "পাট", "pat", "paat"],
    fao56: null,
    notes: ["Not in FAO-56 Tables 11, 12 or 22."],
  },
  {
    id: "rye", label: "Rye", scientificName: "Secale cereale", plantsSymbol: "SECE", family: "Poaceae", role: "crop",
    aliases: ["rye", "cereal rye", "winter rye"],
    fao56: null,
    notes: ["Not in FAO-56 Tables 11, 12 or 22."],
  },
  {
    id: "common_vetch", label: "Common vetch (cover)", scientificName: "Vicia sativa", plantsSymbol: "VISA", family: "Fabaceae", role: "cover",
    aliases: ["vetch", "common vetch"],
    fao56: null,
    notes: ["Not in FAO-56 Tables 11, 12 or 22."],
  },
  {
    id: "red_clover", label: "Red clover (cover)", scientificName: "Trifolium pratense", plantsSymbol: "TRPR2", family: "Fabaceae", role: "cover",
    aliases: ["clover", "red clover"],
    fao56: null,
    notes: ["FAO-56 'Clover hay, Berseem' describes a cut hay crop and is not used for a cover crop."],
  },
  {
    id: "radish", label: "Radish (cover)", scientificName: "Raphanus sativus", plantsSymbol: "RASA2", family: "Brassicaceae", role: "cover",
    aliases: ["radish", "tillage radish", "oilseed radish"],
    fao56: null,
    notes: ["FAO-56 'Radish' is a small vegetable, not a cover crop; not used."],
  },
];

/** Names meaning "nothing planted" (not a crop). */
export const FALLOW_NAMES = ["fallow", "bare", "none", "fallow land", "পতিত", "potit"];

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

export function isFallowName(name: string): boolean {
  return FALLOW_NAMES.includes(norm(name));
}

/** Resolves a farmer's crop name to a catalogue entry: exact alias first, then any whole word. */
export function resolveCrop(name: string, catalog: CropParams[]): CropParams | null {
  const key = norm(name);
  for (const c of catalog) if (c.id === key || c.aliases.some((a) => norm(a) === key)) return c;
  const words = key.split(/[\s,/()-]+/).filter(Boolean);
  for (let n = words.length; n >= 1; n--)
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(" ");
      for (const c of catalog) if (c.aliases.some((a) => norm(a) === phrase)) return c;
    }
  return null;
}

/** Display threshold for "deep-rooted" (Astrapon convention, not an FAO category). */
export const DEEP_ROOT_THRESHOLD_M = 1.5;

export function isLegume(c: CropParams): boolean {
  return c.family === "Fabaceae";
}

export function isDeepRooted(c: CropParams): boolean {
  return (c.fao56?.rootDepthM[1] ?? 0) >= DEEP_ROOT_THRESHOLD_M;
}
