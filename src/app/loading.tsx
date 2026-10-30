import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

export default function Loading() {
  return (
    <Box role="status" aria-label="Loading" sx={{ flexGrow: 1, display: "grid", placeItems: "center", py: 12 }}>
      <CircularProgress color="primary" />
    </Box>
  );
}
