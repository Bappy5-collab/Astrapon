/**
 * Places on the home-page globe. These are the locations where Astrapon's own live software checks
 * ran (scripts/global-cases.mts, scripts/water-trace.mts; see data/verification). They are test
 * squares at public places, not farms, and the crops are the test records used there.
 */
export type GlobePlace = {
  key: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  crops: string;
  checks: string[];
};

export const GLOBE_PLACES: GlobePlace[] = [
  { key: "iowa", name: "Central Iowa", country: "USA", lat: 42.1, lon: -93.8, crops: "Corn → soybean", checks: ["NASA POWER weather since 1981", "USDA soil survey water capacity", "USGS groundwater wells", "Rotation comparison re-run identical"] },
  { key: "mymensingh", name: "Mymensingh", country: "Bangladesh", lat: 24.75, lon: 90.4, crops: "Boro and Aman rice", checks: ["NASA POWER weather and sunshine", "Mapped rivers and ponds (OpenStreetMap)", "Groundwater gap reported honestly", "Farmer-typed planting windows"] },
  { key: "wagga", name: "Wagga Wagga", country: "Australia", lat: -35.1, lon: 147.4, crops: "Wheat → canola", checks: ["Southern-hemisphere seasons", "Farmer soil test value", "Bureau of Meteorology bores via IGRAC", "Rotation comparison re-run identical"] },
  { key: "toulouse", name: "Toulouse", country: "France", lat: 43.6, lon: 1.44, crops: "Groundwater check", checks: ["Hub'Eau groundwater levels to 2026", "Duplicate records from two portals merged", "Depth derived only with matching datum"] },
  { key: "gauteng", name: "Gauteng", country: "South Africa", lat: -26.0, lon: 28.0, crops: "Groundwater check", checks: ["No national adapter: global IGRAC route", "Department of Water and Sanitation wells"] },
];
