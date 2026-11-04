"use client";

import Box from "@mui/material/Box";
import GlobalStyles from "@mui/material/GlobalStyles";
import dynamic from "next/dynamic";

import { SceneMessage } from "@/components/scene/SceneMessage";
import { tokens } from "@/theme/tokens";

import type { FieldMapProps } from "./FieldMapGL";

export type { Basemap, FieldMapProps, MapFocus, MapOverlay, MapShape } from "./FieldMapGL";

const FieldMapGL = dynamic(() => import("./FieldMapGL"), {
  ssr: false,
  loading: () => <SceneMessage title="Loading the globe…" busy />,
});

/** Browser-only MapLibre globe map, lazy-loaded so location search stays usable while it loads. */
export function FieldMap(props: FieldMapProps & { crosshair?: boolean }) {
  const { crosshair, ...rest } = props;
  return (
    <Box sx={{ position: "relative", height: "100%", minHeight: 0, overflow: "hidden", bgcolor: tokens.forest[950] }}>
      <GlobalStyles
        styles={{
          ".maplibregl-map": { fontFamily: "var(--font-body), var(--font-bn-sans), sans-serif" },
          ".maplibregl-ctrl-attrib": { fontSize: "0.72rem", lineHeight: 1.5 },
          ".maplibregl-ctrl-group button": { width: "36px", height: "36px" },
          ".maplibregl-ctrl-group": { borderRadius: "10px !important", boxShadow: "0 6px 18px -8px rgba(10,29,22,.5) !important" },
          ".maplibregl-canvas:focus-visible, .maplibregl-map :focus-visible": { outline: `3px solid ${tokens.lime[400]}`, outlineOffset: -3 },
          ".fs-vertex:focus-visible": { outline: `3px solid ${tokens.lime[400]}`, borderRadius: "50%" },
          ".fs-tip .maplibregl-popup-content": { padding: "6px 10px", borderRadius: "8px", fontSize: "0.8rem", color: tokens.neutral[900], boxShadow: "0 6px 18px -8px rgba(10,29,22,.5)" },
          ".maplibregl-ctrl-scale": { borderColor: tokens.neutral[0], color: tokens.neutral[900], background: "rgba(255,255,255,.8)" },
        }}
      />
      <FieldMapGL {...rest} />
      {crosshair && (
        <Box aria-hidden="true" sx={{ position: "absolute", left: "50%", top: "50%", width: 28, height: 28, ml: "-14px", mt: "-14px", pointerEvents: "none", zIndex: 5 }}>
          <Box sx={{ position: "absolute", left: 13, top: 0, width: 2, height: 28, bgcolor: tokens.neutral[0], boxShadow: `0 0 0 1px ${tokens.forest[900]}` }} />
          <Box sx={{ position: "absolute", top: 13, left: 0, height: 2, width: 28, bgcolor: tokens.neutral[0], boxShadow: `0 0 0 1px ${tokens.forest[900]}` }} />
        </Box>
      )}
    </Box>
  );
}
