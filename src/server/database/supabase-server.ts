import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "@/lib/env/public";

/**
 * Request-scoped Supabase client acting as the signed-in user (RLS applies).
 * Returns `null` when Supabase is not configured so pages can show a setup
 * state instead of failing. Protect data with `auth.getClaims()`, never with
 * an unverified `getSession()` on the server.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const { config } = getSupabasePublicEnv();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, which cannot write cookies.
          // The proxy refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}
