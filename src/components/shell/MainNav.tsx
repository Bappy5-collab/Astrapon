"use client";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useT } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { tokens } from "@/theme/tokens";

const LINKS: { href: string; key: MessageKey; match?: string[]; wideOnly?: boolean }[] = [
  { href: "/farms", key: "nav.farms", match: ["/farms"] },
  { href: "/workspace", key: "nav.workspace", match: ["/workspace", "/fields"] },
  { href: "/sample", key: "nav.sample" },
  { href: "/runs", key: "nav.runs", match: ["/runs", "/scenarios"] },
  { href: "/methodology", key: "nav.method", wideOnly: true },
  { href: "/sources", key: "nav.sources", wideOnly: true },
  { href: "/settings", key: "nav.settings", wideOnly: true },
];

export function MainNav() {
  const t = useT();
  const pathname = usePathname();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const isActive = (l: (typeof LINKS)[number]) => (l.match ?? [l.href]).some((p) => pathname.startsWith(p));
  return (
    <>
      <Stack component="nav" aria-label={t("nav.main")} direction="row" spacing={0.5} sx={{ display: { xs: "none", md: "flex" } }}>
        {LINKS.map((l) => {
          const active = isActive(l);
          return (
            <Button
              key={l.href}
              component={NextLink}
              href={l.href}
              aria-current={active ? "page" : undefined}
              size="small"
              sx={{
                color: active ? tokens.forest[950] : tokens.neutral[100],
                bgcolor: active ? tokens.lime[400] : "transparent",
                px: 1.5,
                display: l.wideOnly ? { md: "none", lg: "inline-flex" } : undefined,
                "&:hover": { bgcolor: active ? tokens.lime[300] : tokens.forest[700] },
              }}
            >
              {t(l.key)}
            </Button>
          );
        })}
      </Stack>
      <IconButton
        aria-label="Menu"
        aria-haspopup="true"
        aria-controls={anchor ? "main-menu" : undefined}
        aria-expanded={Boolean(anchor)}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ color: tokens.neutral[100], display: { xs: "inline-flex", lg: "none" }, width: 44, height: 44 }}
      >
        <MenuRoundedIcon />
      </IconButton>
      <Menu id="main-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {[...LINKS, { href: "/setup", key: "nav.settings" as MessageKey, label: "Setup" }].map((l) => (
          <MenuItem
            key={l.href}
            component={NextLink}
            href={l.href}
            onClick={() => setAnchor(null)}
            selected={isActive(l)}
            sx={{ minHeight: 48, minWidth: 200, display: !("label" in l) && !l.wideOnly ? { md: "none" } : undefined }}
          >
            {"label" in l ? l.label : t(l.key)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
