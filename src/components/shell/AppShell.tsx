import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

import { TextLink } from "@/components/links";
import { tokens } from "@/theme/tokens";

import { AccountNav } from "./AccountNav";
import { BrandMark } from "./BrandMark";
import { MainNav } from "./MainNav";
import { SiteFooter } from "./SiteFooter";

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
      <AppBar
        position="sticky"
        elevation={0}
        sx={{ bgcolor: tokens.forest[900], borderBottom: `1px solid ${tokens.forest[700]}`, "& :focus-visible": { outlineColor: tokens.lime[400] } }}
      >
        <Toolbar sx={{ gap: { xs: 1, sm: 1.5 }, minHeight: { xs: 60, md: 68 }, px: { xs: 1.5, sm: 2 } }}>
          <TextLink href="/" underline="none" color="inherit" aria-label="Astrapon home" sx={{ color: "inherit" }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <BrandMark />
              <Typography component="span" sx={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.3rem", display: { xs: "none", sm: "inline" } }}>
                Astrapon
              </Typography>
            </Stack>
          </TextLink>
          <Box sx={{ flexGrow: 1 }} />
          <MainNav />
          <AccountNav />
        </Toolbar>
      </AppBar>
      <Box component="main" id="main" sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </Box>
      <SiteFooter />
    </Box>
  );
}
