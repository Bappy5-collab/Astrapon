import Box from "@mui/material/Box";

import type { BoundaryGeometry, Position } from "@/domain/geo/boundary";
import { tokens } from "@/theme/tokens";

const ZONE_COLOURS = ["#C3DE4E", "#7A5A3C", "#5E8F72", "#B5543A", "#DCE6E3", "#2F6649"];

/**
 * Plan view of the stored boundary and zones (equirectangular, scaled by cos(latitude) so shapes
 * keep their proportions at field scale). Drawn from the saved coordinates, not illustrative.
 */
export function BoundaryPreview({ boundary, zones, label }: { boundary: BoundaryGeometry; zones: { id: string; name: string; boundary: BoundaryGeometry }[]; label: string }) {
  const rings = (g: BoundaryGeometry): Position[][] => (g.type === "Polygon" ? g.coordinates : g.coordinates.flat());
  const all = rings(boundary).flat();
  const lat0 = (Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = all.map((p) => p[0] * k);
  const ys = all.map((p) => -p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1e-9, h = Math.max(...ys) - minY || 1e-9;
  const size = 300, pad = 10;
  const s = (size - 2 * pad) / Math.max(w, h);
  const path = (g: BoundaryGeometry) =>
    rings(g).map((r) => `M${r.map((p) => `${((p[0] * k - minX) * s + pad).toFixed(1)},${((-p[1] - minY) * s + pad).toFixed(1)}`).join("L")}Z`).join("");
  return (
    <Box component="figure" sx={{ m: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 320, display: "block", background: tokens.sky, borderRadius: 8 }} role="img" aria-label={label}>
        <path d={path(boundary)} fill={tokens.neutral[100]} stroke={tokens.forest[900]} strokeWidth={2} fillRule="evenodd" />
        {zones.map((z, i) => (
          <path key={z.id} d={path(z.boundary)} fill={ZONE_COLOURS[i % ZONE_COLOURS.length]} fillOpacity={0.55} stroke={tokens.forest[700]} strokeWidth={1} fillRule="evenodd">
            <title>{z.name}</title>
          </path>
        ))}
      </svg>
      <Box component="figcaption" sx={{ fontSize: "0.8rem", color: "text.secondary", mt: 0.5 }}>
        Plan view from saved coordinates (north up).{zones.length ? ` Zones: ${zones.map((z) => z.name).join(", ")}.` : ""}
      </Box>
    </Box>
  );
}
