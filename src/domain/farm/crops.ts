/**
 * Maps a farmer's free-text crop name to an *illustrative* plant form for the 3D scene.
 * This is a drawing choice only: it carries no agronomic parameters, and an unknown name
 * is drawn as a generic crop rather than guessed. English, Bangla and common Banglish
 * spellings are recognised.
 */

export const CROP_FORMS = ["tall_row", "small_grain", "paddy", "broadleaf", "oilseed_flower", "fibre", "cover", "fallow", "generic"] as const;
export type CropForm = (typeof CROP_FORMS)[number];

export const CROP_FORM_LABELS: Record<CropForm, string> = {
  tall_row: "Tall row crop",
  small_grain: "Small grain",
  paddy: "Flooded paddy",
  broadleaf: "Broadleaf / legume",
  oilseed_flower: "Flowering oilseed",
  fibre: "Tall fibre crop",
  cover: "Cover crop",
  fallow: "Fallow / bare soil",
  generic: "Other crop (generic form)",
};

const NAMES: [CropForm, string[]][] = [
  ["tall_row", ["maize", "corn", "sorghum", "sugarcane", "millet", "pearl millet", "sunflower", "ভুট্টা", "bhutta", "vutta", "আখ", "akh", "joar", "জোয়ার"]],
  ["small_grain", ["wheat", "barley", "oat", "oats", "rye", "triticale", "teff", "গম", "gom", "যব", "job", "jab"]],
  ["paddy", ["rice", "paddy", "aman", "boro", "aus", "ধান", "dhan", "চাল"]],
  [
    "broadleaf",
    [
      "soybean", "soy", "soya", "bean", "beans", "dry bean", "pea", "peas", "lentil", "chickpea", "groundnut", "peanut", "potato", "sweet potato", "cotton",
      "alfalfa", "lucerne", "vegetable", "vegetables", "tomato", "cabbage", "মসুর", "mosur", "masur", "ডাল", "dal", "আলু", "alu", "aloo", "মুগ", "mug", "moog", "ছোলা", "chola", "খেসারি", "kheshari", "চিনাবাদাম", "badam", "সবজি", "sobji",
    ],
  ],
  ["oilseed_flower", ["mustard", "canola", "rapeseed", "rape", "sesame", "linseed", "flax", "সরিষা", "shorisha", "sorisha", "sharisha", "তিল", "til", "তিসি", "tishi"]],
  ["fibre", ["jute", "hemp", "kenaf", "পাট", "pat", "paat"]],
  ["cover", ["cover", "cover crop", "clover", "vetch", "hairy vetch", "cereal rye cover", "radish", "phacelia", "green manure", "dhaincha", "ধইঞ্চা", "ধৈঞ্চা"]],
  ["fallow", ["fallow", "bare", "none", "পতিত", "potit", "fallow land"]],
];

const LOOKUP = new Map<string, CropForm>(NAMES.flatMap(([form, names]) => names.map((n) => [n.normalize("NFC").toLowerCase(), form] as const)));

export function cropForm(name: string | null | undefined): CropForm {
  if (!name) return "fallow";
  const key = name.normalize("NFC").trim().toLowerCase();
  const exact = LOOKUP.get(key);
  if (exact) return exact;
  // "winter wheat", "hybrid maize", "boro dhan": match any whole word.
  for (const word of key.split(/[\s,/()-]+/).reverse()) {
    const hit = LOOKUP.get(word);
    if (hit) return hit;
  }
  return "generic";
}

/** Illustrative palette per form (plant, accent, soil). Not a reflectance or NDVI colour. */
export const CROP_FORM_COLORS: Record<CropForm, { plant: string; accent: string; soil: string }> = {
  tall_row: { plant: "#3E7A3A", accent: "#D9BE62", soil: "#6B4E33" },
  small_grain: { plant: "#B89A45", accent: "#E0C778", soil: "#7A5B3C" },
  paddy: { plant: "#5E9B4A", accent: "#9CC27A", soil: "#5F5A45" },
  broadleaf: { plant: "#2F6B3F", accent: "#4F8F4F", soil: "#74553A" },
  oilseed_flower: { plant: "#5C8A3A", accent: "#E7CF3A", soil: "#77583B" },
  fibre: { plant: "#357040", accent: "#6C9A4E", soil: "#6A4D33" },
  cover: { plant: "#76A84B", accent: "#A9C82E", soil: "#7A5A3C" },
  fallow: { plant: "#8C6E4D", accent: "#A88A64", soil: "#8A6A49" },
  generic: { plant: "#5F8B55", accent: "#8DB27A", soil: "#77583B" },
};

/** Suggestions offered in crop pickers; farmers can still type any name. */
export const COMMON_CROPS = ["maize", "wheat", "rice", "soybean", "lentil", "mustard", "potato", "jute", "sorghum", "barley", "cotton", "cover crop", "fallow"] as const;
