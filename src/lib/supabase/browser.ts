"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/env/public";

let client: SupabaseClient | null | undefined;

/**
 * Browser Supabase client, or `null` when public Supabase configuration is
 * missing/invalid. Callers must render an honest "not configured" state on null.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const { config } = getSupabasePublicEnv();
  client = config ? createBrowserClient(config.url, config.publishableKey) : null;
  return client;
}
