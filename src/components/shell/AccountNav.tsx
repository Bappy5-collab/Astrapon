"use client";

import Button from "@mui/material/Button";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getSupabasePublicEnv } from "@/lib/env/public";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { tokens } from "@/theme/tokens";

/**
 * Shows "Sign in" or "Account". Display only: authorization happens on the server with
 * getClaims(). Hidden entirely when accounts are not configured.
 */
export function AccountNav() {
  const pathname = usePathname();
  const configured = getSupabasePublicEnv().config !== undefined;
  const [state, setState] = useState<"unknown" | "signed_in" | "signed_out">("unknown");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setState(data.session ? "signed_in" : "signed_out"));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState(session ? "signed_in" : "signed_out"));
    return () => data.subscription.unsubscribe();
  }, [pathname]);

  if (!configured || state === "unknown") return null;
  const href = state === "signed_in" ? "/account" : "/sign-in";
  const active = pathname.startsWith(href);
  return (
    <Button
      component={NextLink}
      href={href}
      size="small"
      variant="outlined"
      aria-current={active ? "page" : undefined}
      sx={{
        color: tokens.neutral[100],
        borderColor: tokens.forest[400],
        px: { xs: 0.9, sm: 1.5 },
        minWidth: 0,
        whiteSpace: "nowrap",
        fontSize: { xs: "0.8rem", sm: "0.875rem" },
        "&:hover": { borderColor: tokens.lime[400], bgcolor: tokens.forest[700] },
      }}
    >
      {state === "signed_in" ? "Account" : "Sign in"}
    </Button>
  );
}
