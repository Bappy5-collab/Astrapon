"use client";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getSupabasePublicEnv } from "@/lib/env/public";
import { useT } from "@/lib/i18n/I18nProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { tokens } from "@/theme/tokens";

export type AuthDisplay = "unknown" | "signed_in" | "signed_out";

/** Display-only session state (authorization always happens on the server with getClaims()). */
export function useAuthDisplay(): { configured: boolean; state: AuthDisplay } {
  const pathname = usePathname();
  const configured = getSupabasePublicEnv().config !== undefined;
  const [state, setState] = useState<AuthDisplay>("unknown");
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setState(data.session ? "signed_in" : "signed_out"));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState(session ? "signed_in" : "signed_out"));
    return () => data.subscription.unsubscribe();
  }, [pathname]);
  return { configured, state };
}

const cta = {
  bgcolor: tokens.lime[400],
  color: tokens.forest[950],
  fontWeight: 700,
  borderRadius: 99,
  px: 2,
  minHeight: 40,
  whiteSpace: "nowrap",
  boxShadow: "0 8px 22px -10px rgba(199,231,122,0.9)",
  "&:hover": { bgcolor: tokens.lime[300] },
} as const;

/**
 * Signed in: an "Add a field" call to action and an account avatar. Signed out: "Sign in" and
 * "Get started". `compact` is the drawer version (full-width buttons). Hidden without accounts.
 */
export function AccountNav({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const { configured, state } = useAuthDisplay();
  if (!configured || state === "unknown") return null;

  if (state === "signed_in") {
    const active = pathname.startsWith("/account");
    return (
      <Stack direction={compact ? "column" : "row"} spacing={1} sx={{ alignItems: compact ? "stretch" : "center" }}>
        <Button component={NextLink} href="/fields/new" startIcon={<AddRoundedIcon />} sx={{ ...cta, display: compact ? "inline-flex" : { xs: "none", sm: "inline-flex" } }}>
          Add a field
        </Button>
        {compact ? (
          <Button component={NextLink} href="/account" variant="outlined" startIcon={<PersonRoundedIcon />} sx={{ borderRadius: 99, color: tokens.neutral[100], borderColor: tokens.forest[400] }}>
            {t("nav.account")}
          </Button>
        ) : (
          <Tooltip title={t("nav.account")}>
            <IconButton
              component={NextLink}
              href="/account"
              aria-label={t("nav.account")}
              aria-current={active ? "page" : undefined}
              sx={{ width: 40, height: 40, color: tokens.forest[950], background: `linear-gradient(135deg, ${tokens.lime[300]}, ${tokens.lime[500]})`, border: `2px solid ${active ? tokens.neutral[0] : "rgba(255,255,255,0.25)"}`, "&:hover": { filter: "brightness(1.05)" } }}
            >
              <PersonRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    );
  }
  return (
    <Stack direction={compact ? "column" : "row"} spacing={1} sx={{ alignItems: compact ? "stretch" : "center" }}>
      <Button component={NextLink} href="/sign-in" aria-current={pathname.startsWith("/sign-in") ? "page" : undefined} sx={{ color: tokens.neutral[100], borderRadius: 99, px: 1.75, minHeight: 40, whiteSpace: "nowrap", "&:hover": { bgcolor: "rgba(255,255,255,0.08)" } }}>
        {t("nav.signIn")}
      </Button>
      <Button component={NextLink} href="/sign-up" sx={{ ...cta, display: compact ? "inline-flex" : { xs: "none", sm: "inline-flex" } }}>
        Get started
      </Button>
    </Stack>
  );
}
