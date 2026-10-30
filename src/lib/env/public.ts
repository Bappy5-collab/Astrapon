import { parseSupabasePublicEnv } from "./schema";

/**
 * Public (browser-safe) configuration. Each NEXT_PUBLIC_* variable must be
 * referenced literally so Next.js can inline it at build time.
 */
export function getSupabasePublicEnv() {
  return parseSupabasePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
