import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

import { TextLink } from "@/components/links";
import { tokens } from "@/theme/tokens";

import { BrandMark } from "./BrandMark";
import { MainNav } from "./MainNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <Link
        href="#main"
        sx={{
          position: "absolute",
          left: 8,
          top: -48,
          zIndex: 2000,
          p: 1,
          bgcolor: "secondary.main",
          color: "secondary.contrastText",
          borderRadius: 1,
          "&:focus": { top: 8 },
        }}
      >
        Skip to content
      </Link>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: tokens.forest[900], borderBottom: `1px solid ${tokens.forest[700]}` }}>
        <Toolbar sx={{ gap: { xs: 1, sm: 2 }, minHeight: { xs: 60, md: 68 }, px: { xs: 1.5, sm: 2 } }}>
          <TextLink href="/" underline="none" color="inherit" aria-label="FieldShift home">
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <BrandMark />
              <Typography
                component="span"
                sx={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.3rem", display: { xs: "none", sm: "inline" } }}
              >
                FieldShift
              </Typography>
            </Stack>
          </TextLink>
          <Box sx={{ flexGrow: 1 }} />
          <MainNav />
        </Toolbar>
      </AppBar>
      <Box component="main" id="main" sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </Box>
      <Box component="footer" sx={{ bgcolor: tokens.forest[950], color: tokens.neutral[200], py: 4 }}>
        <Container maxWidth="lg">
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
            <Typography variant="body2" sx={{ maxWidth: 680, color: tokens.neutral[300] }}>
              FieldShift supports farmer and agronomist judgment; it does not replace local agronomic advice. Historical replay is
              not a forecast. FieldShift is being built to use publicly available NASA data products and is not affiliated with or
              endorsed by NASA.
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.neutral[500], flexShrink: 0 }}>
              Development build · Phase 1
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
