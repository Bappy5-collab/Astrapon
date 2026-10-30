import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/server/auth/session";
import { getSupabaseServerClient } from "@/server/database/supabase-server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Lands email links (sign-up confirmation, password recovery). Supports both the token-hash
 * template (`?token_hash=…&type=…`) and the default PKCE redirect (`?code=…`).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const fail = (reason: string) => NextResponse.redirect(new URL(`/auth/error?reason=${encodeURIComponent(reason)}`, url.origin));

  const supabase = await getSupabaseServerClient();
  if (!supabase) return fail("unconfigured");

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return fail(error.code ?? "verify_failed");
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return fail(error.code ?? "exchange_failed");
  }
  return fail(url.searchParams.get("error_code") ?? "missing_token");
}
