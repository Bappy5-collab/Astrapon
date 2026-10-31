import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/env/public";
import { timeoutFetch } from "@/lib/supabase/timeout-fetch";

/** Routes that need a signed-in user. Pages re-check with getClaims(); this is the first gate. */
const PROTECTED_PREFIXES = ["/farms", "/fields", "/scenarios", "/account", "/runs"];

const isProtected = (pathname: string) => PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Refreshes the Supabase auth session cookie on navigation and sends signed-out
 * visitors of protected routes to sign in. When Supabase is not configured this
 * is a pass-through; protected pages then render an honest setup state.
 */
export async function proxy(request: NextRequest) {
  const { config } = getSupabasePublicEnv();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    // Bounded so a stalled Supabase connection cannot hang every page; pages re-check auth themselves.
    global: { fetch: timeoutFetch(5_000) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Do not run code between client creation and getClaims(); it validates and refreshes the session.
  const { data, error } = await supabase.auth.getClaims();
  // Unreachable is not the same as signed out: let the page render its own "unreachable" state.
  if (error && (error.status === 0 || error.name === "AuthRetryableFetchError")) return response;

  if (!data?.claims?.sub && isProtected(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed/cleared auth cookies on the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|gltf|hdr)$).*)"],
};
