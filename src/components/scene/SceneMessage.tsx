import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";

import { tokens } from "@/theme/tokens";

/** Fills the 3D stage with a readable status message (loading, unsupported, failed). */
export function SceneMessage({ title, body, busy = false }: { title: string; body?: string; busy?: boolean }) {
  return (
    <Box
      role={busy ? "status" : "alert"}
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1.5,
        p: 4,
        textAlign: "center",
        background: `linear-gradient(180deg, ${tokens.sky} 0%, ${tokens.neutral[200]} 100%)`,
      }}
    >
      {busy && <CircularProgress size={28} sx={{ color: tokens.forest[700] }} aria-hidden="true" />}
      <Typography variant="h5" component="p" sx={{ color: tokens.forest[900] }}>
        {title}
      </Typography>
      {body && (
        <Typography variant="body2" sx={{ maxWidth: 440, color: tokens.neutral[700] }}>
          {body}
        </Typography>
      )}
    </Box>
  );
}
