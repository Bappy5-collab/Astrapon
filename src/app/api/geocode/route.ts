import type { NextRequest } from "next/server";

import { searchPlaces } from "@/server/geocode/nominatim";

/** GET /api/geocode?q=…&lang=en|bn — submit-only place search (see src/server/geocode/nominatim.ts). */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const lang = request.nextUrl.searchParams.get("lang") === "bn" ? "bn,en" : "en";
  const outcome = await searchPlaces(q, lang);
  const status = outcome.ok ? 200 : outcome.reason === "invalid" ? 400 : outcome.reason === "busy" ? 429 : outcome.reason === "disabled" ? 503 : 502;
  return Response.json(outcome, { status, headers: { "Cache-Control": "private, max-age=300" } });
}
