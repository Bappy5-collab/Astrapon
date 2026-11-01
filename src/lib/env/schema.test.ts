import { describe, expect, it } from "vitest";

import { parseServerEnv, parseSupabasePublicEnv } from "./schema";

const fakeKey = "sb_publishable_" + "x".repeat(24);
const fakeSecret = "sb_secret_" + "y".repeat(30);

describe("parseSupabasePublicEnv", () => {
  it("reports every missing variable by name when nothing is configured", () => {
    const { status, config } = parseSupabasePublicEnv({});
    expect(config).toBeUndefined();
    expect(status).toEqual({
      state: "missing",
      missing: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    });
  });

  it("treats whitespace-only values as missing", () => {
    const { status } = parseSupabasePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "   ",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fakeKey,
    });
    expect(status).toEqual({ state: "missing", missing: ["NEXT_PUBLIC_SUPABASE_URL"] });
  });

  it("rejects a non-URL project URL without echoing the value", () => {
    const badValue = "not-a-url-secretish";
    const { status } = parseSupabasePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: badValue,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fakeKey,
    });
    expect(status.state).toBe("invalid");
    expect(JSON.stringify(status)).not.toContain(badValue);
  });

  it("returns typed config when valid", () => {
    const { status, config } = parseSupabasePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fakeKey,
    });
    expect(status).toEqual({ state: "configured" });
    expect(config).toEqual({ url: "https://abcdefghijklmnop.supabase.co", publishableKey: fakeKey });
  });
});

describe("parseServerEnv", () => {
  it("reports each optional server feature independently", () => {
    const { report, secrets } = parseServerEnv({ SUPABASE_SECRET_KEY: fakeSecret });
    expect(report.supabaseAdmin).toEqual({ state: "configured" });
    expect(report.nasaEarthdata).toEqual({ state: "missing", missing: ["NASA_EARTHDATA_TOKEN"] });
    expect(report.aiExplanations).toEqual({ state: "missing", missing: ["ANTHROPIC_API_KEY"] });
    expect(secrets.supabaseSecretKey).toBe(fakeSecret);
    expect(secrets.nasaEarthdataToken).toBeUndefined();
  });

  it("reports the worker trigger token separately", () => {
    const token = "github_pat_" + "x".repeat(30);
    expect(parseServerEnv({}).report.workerDispatch).toEqual({ state: "missing", missing: ["GITHUB_DISPATCH_TOKEN"] });
    const { report, secrets } = parseServerEnv({ GITHUB_DISPATCH_TOKEN: token });
    expect(report.workerDispatch).toEqual({ state: "configured" });
    expect(secrets.githubDispatchToken).toBe(token);
    expect(JSON.stringify(report)).not.toContain(token);
  });

  it("never includes secret values in the report", () => {
    const shortSecret = "short-private";
    const { report } = parseServerEnv({ SUPABASE_SECRET_KEY: fakeSecret, ANTHROPIC_API_KEY: shortSecret });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(fakeSecret);
    expect(serialized).not.toContain(shortSecret);
    expect(report.aiExplanations.state).toBe("invalid");
  });
});
