import { connection } from "next/server";

import { getSupabasePublicEnv } from "@/lib/env/public";
import { getServerEnvReport } from "@/server/env";

/** Liveness plus configuration *states* (never values). */
export async function GET() {
  await connection();
  const server = getServerEnvReport();
  return Response.json({
    app: "astrapon",
    phase: 5,
    status: "ok",
    services: {
      supabasePublic: getSupabasePublicEnv().status.state,
      supabaseAdmin: server.supabaseAdmin.state,
      nasaEarthdata: server.nasaEarthdata.state,
      openTopography: server.openTopography.state,
      aiExplanations: server.aiExplanations.state,
      workerDispatch: server.workerDispatch.state,
    },
  });
}
