"use client";

import Box from "@mui/material/Box";
import GlobalStyles from "@mui/material/GlobalStyles";
import dynamic from "next/dynamic";

import { SceneMessage } from "@/components/scene/SceneMessage";
import { tokens } from "@/theme/tokens";

import type { FieldMapProps } from "./FieldMapLeaflet";

export type { Basemap, FieldMapProps, MapFocus, MapShape } from "./FieldMapLeaflet";

const FieldMapLeaflet = dynamic(() => import("./FieldMapLeaflet"), {
  ssr: false,
  loading: () => <SceneMessage title="Loading map…" busy />,
});

/** Browser-only Leaflet map, lazy-loaded so location search stays usable while it loads. */
export function FieldMap(props: FieldMapProps & { crosshair?: boolean }) {
  const { crosshair, ...rest } = props;
  return (
    <Box sx={{ position: "relative", height: "100%", minHeight: 0, overflow: "hidden", bgcolor: tokens.neutral[150] }}>
      <GlobalStyles
        styles={{
          ".fs-drawing.leaflet-container": { cursor: "crosshair" },
          ".fs-vertex": { background: "transparent", border: 0 },
          ".leaflet-container": { fontFamily: "var(--font-body), var(--font-bn-sans), sans-serif", fontSize: "0.8125rem" },
          ".leaflet-control-attribution": { fontSize: "0.72rem", lineHeight: 1.5, maxWidth: "100%", whiteSpace: "normal" },
          ".leaflet-bar a": { width: "36px !important", height: "36px !important", lineHeight: "36px !important" },
          ".leaflet-container :focus-visible": { outline: `3px solid ${tokens.forest[500]}`, outlineOffset: 1 },
        }}
      />
      <FieldMapLeaflet {...rest} />
      {crosshair && (
        <Box aria-hidden="true" sx={{ position: "absolute", left: "50%", top: "50%", width: 28, height: 28, ml: "-14px", mt: "-14px", pointerEvents: "none", zIndex: 500 }}>
          <Box sx={{ position: "absolute", left: 13, top: 0, width: 2, height: 28, bgcolor: tokens.forest[900], boxShadow: "0 0 0 1px #fff" }} />
          <Box sx={{ position: "absolute", top: 13, left: 0, height: 2, width: 28, bgcolor: tokens.forest[900], boxShadow: "0 0 0 1px #fff" }} />
        </Box>
      )}
    </Box>
  );
}
