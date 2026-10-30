import "server-only";

import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import type { Database } from "@/server/database/database.types";
import { getSupabaseServerClient } from "@/server/database/supabase-server";

export type AuthState =
  | { state: "unconfigured" }
  | { state: "unreachable" }
  | { state: "signed_out"; supabase: SupabaseClient<Database> }
  | { state: "signed_in"; supabase: SupabaseClient<Database>; userId: string; email: string | null };

export type SignedIn = Extract<AuthState, { state: "signed_in" }>;

/**
 * Verified auth state for the current request. Uses getClaims(), which validates the JWT
 * signature, so it is safe for authorization decisions (getSession() is not). A network failure
 * reaching Supabase is reported as "unreachable", never mistaken for being signed out.
 */
export async function getAuth(): Promise<AuthState> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { state: "unconfigured" };
  let result: Awaited<ReturnType<typeof supabase.auth.getClaims>>;
  try {
    result = await supabase.auth.getClaims();
  } catch {
    return { state: "unreachable" };
  }
  const { data, error } = result;
  if (error && (isAuthRetryableFetchError(error) || error.status === 0 || error.name === "AbortError")) return { state: "unreachable" };
  const claims = data?.claims;
  if (error || !claims?.sub) return { state: "signed_out", supabase };
  return { state: "signed_in", supabase, userId: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

/**
 * For protected pages: redirects signed-out users to sign in. Returns the signed-in user, or the
 * reason no user is available (not configured / service unreachable) so the page can say so.
 */
export async function requireUser(nextPath: string): Promise<SignedIn | { state: "unconfigured" | "unreachable" }> {
  const auth = await getAuth();
  if (auth.state === "signed_out") redirect(`/sign-in?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  return auth;
}

/** Only same-origin relative paths are accepted as post-auth destinations (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/farms"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
