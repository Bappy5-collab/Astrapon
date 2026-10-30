import "server-only";

import { parseServerEnv, type ServerEnvReport, type ServerSecrets } from "@/lib/env/schema";

/**
 * Server-only secrets. Importing this module from a client component fails the
 * build (via `server-only`). Use `getServerEnvReport()` for anything rendered or
 * logged; it contains configuration states and variable names, never values.
 */
function read() {
  return parseServerEnv({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    NASA_EARTHDATA_TOKEN: process.env.NASA_EARTHDATA_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  });
}

export function getServerEnvReport(): ServerEnvReport {
  return read().report;
}

export function getServerSecrets(): ServerSecrets {
  return read().secrets;
}
