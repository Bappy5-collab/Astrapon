"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

import { tokens } from "@/theme/tokens";

const LINKS = [
  { href: "/farms", label: "Farms" },
  { href: "/workspace", label: "Workspace" },
  { href: "/sources", label: "Sources" },
  // Hidden in the phone header for space; linked from the footer instead.
  { href: "/setup", label: "Setup", hideOnPhone: true },
] as const;

export function MainNav() {
  const pathname = usePathname();
  return (
    <Stack component="nav" aria-label="Main" direction="row" spacing={{ xs: 0.25, sm: 0.5 }}>
      {LINKS.map(({ href, label, ...rest }) => {
        const hideOnPhone = "hideOnPhone" in rest;
        const active = href === "/farms" ? ["/farms", "/fields", "/scenarios"].some((p) => pathname.startsWith(p)) : pathname.startsWith(href);
        return (
          <Button
            key={href}
            component={NextLink}
            href={href}
            aria-current={active ? "page" : undefined}
            size="small"
            sx={{
              color: active ? tokens.forest[950] : tokens.neutral[100],
              bgcolor: active ? tokens.lime[400] : "transparent",
              px: { xs: 0.9, sm: 2 },
              minWidth: 0,
              display: hideOnPhone ? { xs: "none", sm: "inline-flex" } : undefined,
              fontSize: { xs: "0.8rem", sm: "0.875rem" },
              "&:hover": { bgcolor: active ? tokens.lime[300] : tokens.forest[700] },
            }}
          >
            {label}
          </Button>
        );
      })}
    </Stack>
  );
}
