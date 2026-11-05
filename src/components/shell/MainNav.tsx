"use client";

import AgricultureRoundedIcon from "@mui/icons-material/AgricultureRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { useT } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { tokens } from "@/theme/tokens";

import { BrandMark } from "./BrandMark";

type NavLink = { href: string; key: MessageKey; icon: ReactNode; match?: string[]; hint: string };

const LINKS: NavLink[] = [
  { href: "/workspace", key: "nav.workspace", icon: <AgricultureRoundedIcon />, match: ["/workspace", "/fields", "/farms", "/scenarios"], hint: "Your fields and their next step" },
  { href: "/runs", key: "nav.runs", icon: <InsightsRoundedIcon />, match: ["/runs"], hint: "Comparisons and saved plans" },
  { href: "/sample", key: "nav.sample", icon: <ExploreRoundedIcon />, hint: "A ready-made field, no account" },
  { href: "/methodology", key: "nav.method", icon: <MenuBookRoundedIcon />, match: ["/methodology"], hint: "Methods, limits and evidence" },
];
const EXTRA: NavLink[] = [
  { href: "/sources", key: "nav.sources", icon: <StorageRoundedIcon />, match: ["/sources"], hint: "Data providers and their status" },
  { href: "/settings", key: "nav.settings", icon: <SettingsRoundedIcon />, match: ["/settings"], hint: "Language, motion and 3D quality" },
];

/** Desktop: a pill group with icons and a lime active state; phones and tablets: a side drawer. */
export function MainNav({ accountSlot }: { accountSlot?: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (l: NavLink) => (l.match ?? [l.href]).some((p) => pathname.startsWith(p));
  const settings = EXTRA[1]!;

  return (
    <>
      <Stack
        component="nav"
        aria-label={t("nav.main")}
        direction="row"
        spacing={0.5}
        sx={{ display: { xs: "none", lg: "flex" }, p: 0.5, borderRadius: 99, bgcolor: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.08)` }}
      >
        {LINKS.map((l) => {
          const active = isActive(l);
          return (
            <ButtonBase
              key={l.href}
              component={NextLink}
              href={l.href}
              aria-current={active ? "page" : undefined}
              sx={{
                gap: 0.75,
                px: 1.6,
                height: 38,
                borderRadius: 99,
                fontSize: "0.88rem",
                fontWeight: 600,
                color: active ? tokens.forest[950] : tokens.neutral[100],
                bgcolor: active ? tokens.lime[400] : "transparent",
                boxShadow: active ? "0 6px 18px -8px rgba(199,231,122,0.8)" : "none",
                transition: "background-color 180ms, color 180ms",
                "& svg": { fontSize: 18, opacity: active ? 1 : 0.8 },
                "&:hover": { bgcolor: active ? tokens.lime[300] : "rgba(255,255,255,0.08)" },
                "&.Mui-focusVisible": { outline: `3px solid ${tokens.lime[400]}`, outlineOffset: 2 },
                "@media (prefers-reduced-motion: reduce)": { transition: "none" },
              }}
            >
              {l.icon}
              {t(l.key)}
            </ButtonBase>
          );
        })}
      </Stack>
      <Tooltip title={t(settings.key)}>
        <IconButton
          component={NextLink}
          href={settings.href}
          aria-label={t(settings.key)}
          aria-current={isActive(settings) ? "page" : undefined}
          sx={{ display: { xs: "none", lg: "inline-flex" }, width: 40, height: 40, color: isActive(settings) ? tokens.forest[950] : tokens.neutral[100], bgcolor: isActive(settings) ? tokens.lime[400] : "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.08)`, "&:hover": { bgcolor: isActive(settings) ? tokens.lime[300] : "rgba(255,255,255,0.1)" } }}
        >
          <SettingsRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <IconButton
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        sx={{ order: { xs: 3, lg: 0 }, display: { xs: "inline-flex", lg: "none" }, width: 44, height: 44, color: tokens.neutral[100], bgcolor: "rgba(255,255,255,0.06)", border: `1px solid rgba(255,255,255,0.1)`, "&:hover": { bgcolor: "rgba(255,255,255,0.12)" } }}
      >
        <MenuRoundedIcon />
      </IconButton>
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { width: { xs: "88vw", sm: 360 }, bgcolor: tokens.forest[950], color: tokens.neutral[100], borderLeft: `1px solid ${tokens.forest[700]}`, backgroundImage: "radial-gradient(400px 260px at 100% 0%, rgba(199,231,122,0.10), transparent 70%)" } } }}
      >
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 2.5, py: 2 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <BrandMark size={30} />
            <Typography sx={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.25rem" }}>Astrapon</Typography>
          </Stack>
          <IconButton aria-label="Close menu" onClick={() => setOpen(false)} sx={{ color: tokens.neutral[100] }}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
        <Box component="nav" aria-label={t("nav.main")} sx={{ px: 1.5 }}>
          {[...LINKS, ...EXTRA].map((l) => {
            const active = isActive(l);
            return (
              <ButtonBase
                key={l.href}
                component={NextLink}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                sx={{
                  width: "100%",
                  justifyContent: "flex-start",
                  gap: 1.5,
                  px: 1.5,
                  py: 1.25,
                  mb: 0.5,
                  borderRadius: "14px",
                  textAlign: "left",
                  bgcolor: active ? tokens.lime[400] : "transparent",
                  color: active ? tokens.forest[950] : tokens.neutral[100],
                  "&:hover": { bgcolor: active ? tokens.lime[300] : "rgba(255,255,255,0.06)" },
                  "&.Mui-focusVisible": { outline: `3px solid ${tokens.lime[400]}`, outlineOffset: 1 },
                }}
              >
                <Box aria-hidden sx={{ width: 38, height: 38, borderRadius: "12px", display: "grid", placeItems: "center", bgcolor: active ? "rgba(10,29,22,0.12)" : "rgba(255,255,255,0.06)", "& svg": { fontSize: 20 } }}>
                  {l.icon}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: "0.98rem", lineHeight: 1.3 }}>{t(l.key)}</Typography>
                  <Typography variant="caption" sx={{ color: active ? tokens.forest[800] : tokens.neutral[300] }}>
                    {l.hint}
                  </Typography>
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
        {accountSlot && (
          <Box sx={{ mt: "auto", p: 2.5, borderTop: `1px solid ${tokens.forest[700]}` }} onClick={() => setOpen(false)}>
            {accountSlot}
          </Box>
        )}
      </Drawer>
    </>
  );
}
