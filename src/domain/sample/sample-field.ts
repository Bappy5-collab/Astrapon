import type { BoundaryGeometry } from "@/domain/geo/boundary";
import type { HistoryEntry } from "@/domain/workspace/workspace";

/**
 * The public sample field. Its outline is INVENTED and drawn over real farmland in central
 * Iowa, USA, so the map and imagery have something to show. The zones and crop history are
 * invented examples, not any farmer's records. Everything about it is labelled "Sample".
 */

export const SAMPLE_FIELD = {
  name: "Sample field",
  farmName: "Sample farm (invented)",
  placeLabel: "Central Iowa, USA",
  boundary: {
    type: "Polygon",
    coordinates: [
      [
        [-93.8042, 42.1004],
        [-93.7988, 42.1004],
        [-93.7986, 42.0969],
        [-93.8016, 42.0962],
        [-93.8043, 42.0966],
        [-93.8042, 42.1004],
      ],
      // A wet hollow left uncropped (hole).
      [
        [-93.8007, 42.0977],
        [-93.7999, 42.0977],
        [-93.7999, 42.0971],
        [-93.8007, 42.0971],
        [-93.8007, 42.0977],
      ],
    ],
  } satisfies BoundaryGeometry,
  zones: [
    {
      key: "sample-zone-north",
      name: "North upland",
      basis: "farmer_knowledge" as const,
      notes: "Invented example: lighter, better-drained soil.",
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [-93.8041, 42.1003],
            [-93.7989, 42.1003],
            [-93.7989, 42.0985],
            [-93.8041, 42.0985],
            [-93.8041, 42.1003],
          ],
        ],
      } satisfies BoundaryGeometry,
    },
    {
      key: "sample-zone-south",
      name: "South low ground",
      basis: "farmer_knowledge" as const,
      notes: "Invented example: wetter in spring.",
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [-93.8041, 42.0984],
            [-93.7988, 42.0984],
            [-93.7987, 42.0970],
            [-93.8016, 42.0963],
            [-93.8041, 42.0967],
            [-93.8041, 42.0984],
          ],
          [
            [-93.8007, 42.0977],
            [-93.7999, 42.0977],
            [-93.7999, 42.0971],
            [-93.8007, 42.0971],
            [-93.8007, 42.0977],
          ],
        ],
      } satisfies BoundaryGeometry,
    },
  ],
} as const;

const h = (id: string, zone: string | null, year: number, crop: string, season = "main"): HistoryEntry => ({ id, zone_id: zone, season_year: year, season, crop_name: crop });

export const SAMPLE_HISTORY: HistoryEntry[] = [
  h("s1", null, 2021, "maize"),
  h("s2", null, 2022, "soybean"),
  h("s3", null, 2023, "maize"),
  h("s4", "sample-zone-north", 2024, "soybean"),
  h("s5", "sample-zone-south", 2024, "maize"),
  h("s6", "sample-zone-north", 2025, "maize"),
  h("s7", "sample-zone-south", 2025, "soybean"),
  h("s8", null, 2025, "cereal rye cover", "cover"),
];
