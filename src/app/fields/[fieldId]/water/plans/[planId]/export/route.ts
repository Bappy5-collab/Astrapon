import { type NextRequest } from "next/server";

import { getAuth } from "@/server/auth/session";

/** Downloads one saved water & energy version exactly as stored (inputs, evidence, result, hashes). RLS limits it to the owner. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/fields/[fieldId]/water/plans/[planId]/export">) {
  const { fieldId, planId } = await ctx.params;
  const json = (body: unknown, status: number, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
  if (!/^[0-9a-f-]{36}$/i.test(planId) || !/^[0-9a-f-]{36}$/i.test(fieldId)) return json({ error: "Not found." }, 404);
  const auth = await getAuth();
  if (auth.state === "unreachable") return json({ error: "The account service did not respond. Try again." }, 503);
  if (auth.state !== "signed_in") return json({ error: "Sign in to export." }, 401);
  const { data, error } = await auth.supabase
    .from("water_energy_plans")
    .select("id, field_id, run_id, version, name, model_version, inputs, evidence, result, inputs_sha256, result_sha256, created_at")
    .eq("id", planId)
    .eq("field_id", fieldId)
    .maybeSingle();
  if (error) return json({ error: "Could not load the version." }, 500);
  if (!data) return json({ error: "Not found." }, 404);
  return json(
    {
      format: "astrapon-water-energy-export",
      formatVersion: 1,
      note: "Stored record exported as saved; nothing was recalculated. Evidence classes are labelled in inputs.*.basis (farmer_report, ground_measurement_proxy, hypothetical_input, simulation_output, mapped_feature, default_assumption) and in evidence (OpenStreetMap mapped features, provider station records with original units, NASA POWER modelled solar).",
      plan: data,
    },
    200,
    { "Content-Disposition": `attachment; filename="astrapon-water-energy-v${data.version}.json"` },
  );
}
