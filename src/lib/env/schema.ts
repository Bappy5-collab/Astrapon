import { z } from "zod";

/**
 * Environment validation is split into a public half (safe to inline into the
 * browser bundle via NEXT_PUBLIC_*) and a server half (secrets). Parsers here
 * are pure so they can be unit tested; they never echo variable *values*, only
 * variable names, so validation output is safe to log.
 */

export type FeatureStatus =
  | { state: "configured" }
  | { state: "missing"; missing: string[] }
  | { state: "invalid"; problems: string[] };

type RawEnv = Record<string, string | undefined>;

const nonEmpty = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : v.trim());

function evaluate<T extends z.ZodRawShape>(
  shape: T,
  raw: RawEnv,
): { status: FeatureStatus; data?: z.infer<z.ZodObject<T>> } {
  const keys = Object.keys(shape);
  const picked: RawEnv = {};
  for (const key of keys) picked[key] = nonEmpty(raw[key]);

  const missing = keys.filter((k) => picked[k] === undefined);
  if (missing.length > 0) return { status: { state: "missing", missing } };

  const result = z.object(shape).safeParse(picked);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    return { status: { state: "invalid", problems } };
  }
  return { status: { state: "configured" }, data: result.data };
}

// ---------------------------------------------------------------- public ---

const supabasePublicShape = {
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, "looks too short to be a Supabase publishable key"),
};

export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function parseSupabasePublicEnv(raw: RawEnv): { status: FeatureStatus; config?: SupabasePublicConfig } {
  const { status, data } = evaluate(supabasePublicShape, raw);
  if (!data) return { status };
  return {
    status,
    config: { url: data.NEXT_PUBLIC_SUPABASE_URL, publishableKey: data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  };
}

// ---------------------------------------------------------------- server ---

const supabaseSecretShape = {
  SUPABASE_SECRET_KEY: z.string().min(20, "looks too short to be a Supabase secret key"),
};

const nasaEarthdataShape = {
  NASA_EARTHDATA_TOKEN: z.string().min(20, "looks too short to be an Earthdata Login token"),
};

const openTopographyShape = {
  OPENTOPOGRAPHY_API_KEY: z.string().min(16, "looks too short to be an OpenTopography API key"),
};

const aiShape = {
  ANTHROPIC_API_KEY: z.string().min(20, "looks too short to be an API key"),
};

export type ServerFeature = "supabaseAdmin" | "nasaEarthdata" | "openTopography" | "aiExplanations";

export const SERVER_FEATURE_LABELS: Record<ServerFeature, string> = {
  supabaseAdmin: "Supabase server access (migrations, jobs, reference data)",
  nasaEarthdata: "NASA Earthdata Login (authenticated NASA archives)",
  openTopography: "OpenTopography Global DEM API (NASADEM elevation)",
  aiExplanations: "AI-assisted explanation drafting",
};

export type ServerEnvReport = Record<ServerFeature, FeatureStatus>;

export type ServerSecrets = {
  supabaseSecretKey?: string;
  nasaEarthdataToken?: string;
  openTopographyApiKey?: string;
  anthropicApiKey?: string;
};

export function parseServerEnv(raw: RawEnv): { report: ServerEnvReport; secrets: ServerSecrets } {
  const admin = evaluate(supabaseSecretShape, raw);
  const nasa = evaluate(nasaEarthdataShape, raw);
  const topo = evaluate(openTopographyShape, raw);
  const ai = evaluate(aiShape, raw);
  return {
    report: { supabaseAdmin: admin.status, nasaEarthdata: nasa.status, openTopography: topo.status, aiExplanations: ai.status },
    secrets: {
      supabaseSecretKey: admin.data?.SUPABASE_SECRET_KEY,
      nasaEarthdataToken: nasa.data?.NASA_EARTHDATA_TOKEN,
      openTopographyApiKey: topo.data?.OPENTOPOGRAPHY_API_KEY,
      anthropicApiKey: ai.data?.ANTHROPIC_API_KEY,
    },
  };
}
