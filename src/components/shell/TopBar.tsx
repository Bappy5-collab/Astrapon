"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

import { TextLink } from "@/components/links";
import { tokens } from "@/theme/tokens";

import { AccountNav } from "./AccountNav";
import { BrandMark } from "./BrandMark";
import { MainNav } from "./MainNav";

/**
 * Sticky header: a rounded, glass-like forest bar floating on the deepest forest band (which runs
 * into the home hero). After scrolling the bar tightens and its shadow deepens.
 */
export function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 1100, px: { xs: 1, sm: 1.5 }, pt: scrolled ? 0.75 : { xs: 1, md: 1.25 }, pb: 0.75, transition: "padding 200ms", bgcolor: tokens.forest[950], borderBottom: scrolled ? `1px solid ${tokens.forest[800]}` : "1px solid transparent", "@media (prefers-reduced-motion: reduce)": { transition: "none" } }}>
      <Box
        sx={{
          maxWidth: 1280,
          mx: "auto",
          display: "flex",
          alignItems: "center",
          gap: { xs: 1, sm: 1.5 },
          minHeight: { xs: 58, md: 64 },
          pl: { xs: 1.25, sm: 1.75 },
          pr: { xs: 1, sm: 1.25 },
          borderRadius: "20px",
          color: tokens.neutral[100],
          bgcolor: scrolled ? "rgba(10, 29, 22, 0.92)" : "rgba(16, 43, 34, 0.82)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: scrolled ? "0 14px 34px -18px rgba(0,0,0,0.65)" : "0 10px 30px -22px rgba(0,0,0,0.5)",
          backdropFilter: "saturate(1.4) blur(14px)",
          WebkitBackdropFilter: "saturate(1.4) blur(14px)",
          transition: "background-color 200ms, box-shadow 200ms",
          "& :focus-visible": { outlineColor: tokens.lime[400] },
          "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        }}
      >
        <TextLink href="/" underline="none" aria-label="Astrapon home" sx={{ color: "inherit", flexShrink: 0 }}>
          <Stack direction="row" spacing={1.1} sx={{ alignItems: "center" }}>
            <Box sx={{ display: "grid", placeItems: "center", filter: "drop-shadow(0 4px 10px rgba(199,231,122,0.35))" }}>
              <BrandMark size={32} />
            </Box>
            <Typography component="span" sx={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: { xs: "1.15rem", sm: "1.3rem" }, letterSpacing: "-0.01em", display: "none", "@media (min-width: 360px)": { display: "inline" } }}>
              Astrapon
            </Typography>
          </Stack>
        </TextLink>
        <Box sx={{ flexGrow: 1 }} />
        <MainNav accountSlot={<AccountNav compact />} />
        <Box sx={{ display: { xs: "none", lg: "block" }, width: "1px", height: 26, bgcolor: "rgba(255,255,255,0.12)", mx: 0.25 }} />
        <Box sx={{ order: { xs: 2, lg: 0 } }}>
          <AccountNav />
        </Box>
      </Box>
    </Box>
  );
}
