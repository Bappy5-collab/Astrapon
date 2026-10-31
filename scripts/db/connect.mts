/**
 * Shared connection guard for database scripts. Loads .env.local, refuses placeholders, and
 * refuses to connect unless SUPABASE_DB_URL points at the same project ref as
 * NEXT_PUBLIC_SUPABASE_URL, so a stray connection string can never target another project.
 * Never prints credentials; the project ref is shown abbreviated.
 */
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

export function loadEnv(): void {
  const file = path.join(ROOT, ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

export class SetupError extends Error {}

export function projectRefFromApiUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(host);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function projectRefFromDbUrl(dbUrl: string): string | null {
  const u = new URL(dbUrl);
  // Pooler: user "postgres.<ref>" on *.pooler.supabase.com. Direct: host "db.<ref>.supabase.co".
  const fromUser = /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(u.username));
  if (fromUser) return fromUser[1];
  const fromHost = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
  return fromHost ? fromHost[1] : null;
}

export const abbreviateRef = (ref: string) => `${ref.slice(0, 4)}…${ref.slice(-2)}`;

export function connect({ max = 1 }: { max?: number } = {}): { sql: postgres.Sql; ref: string } {
  loadEnv();
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) throw new SetupError("SUPABASE_DB_URL is not set in .env.local (Supabase → Connect → Session pooler URI).");
  if (/\[?YOUR[-_ ]PASSWORD\]?/i.test(dbUrl)) throw new SetupError("SUPABASE_DB_URL still contains the [YOUR-PASSWORD] placeholder.");
  let dbRef: string | null;
  try {
    dbRef = projectRefFromDbUrl(dbUrl);
  } catch {
    throw new SetupError("SUPABASE_DB_URL is not a valid postgresql:// URL.");
  }
  const apiRef = projectRefFromApiUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!dbRef || !apiRef) throw new SetupError("Could not read a Supabase project ref from SUPABASE_DB_URL and NEXT_PUBLIC_SUPABASE_URL.");
  if (dbRef !== apiRef) {
    throw new SetupError(`Refusing to connect: SUPABASE_DB_URL targets ${abbreviateRef(dbRef)} but the app uses ${abbreviateRef(apiRef)}.`);
  }
  const sql = postgres(dbUrl, { max, prepare: false, onnotice: () => {}, connect_timeout: 20, ssl: "require" });
  return { sql, ref: dbRef };
}

export type LocalMigration = { version: string; name: string; file: string; content: string; sha256: string };

export function localMigrations(): LocalMigration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const content = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/\r\n/g, "\n");
      const [, version, name] = /^(\d{14})_(.+)\.sql$/.exec(file)!;
      return { version, name, file, content, sha256: createHash("sha256").update(content).digest("hex") };
    });
}

export async function runMain(main: () => Promise<number | void>): Promise<void> {
  try {
    process.exitCode = (await main()) ?? 0;
  } catch (error) {
    if (error instanceof SetupError) {
      console.error(`SETUP REQUIRED: ${error.message}`);
      process.exitCode = 2;
    } else {
      const e = error as { message?: string; code?: string; detail?: string };
      console.error(`FAILED: ${e.message ?? String(error)}${e.code ? ` [${e.code}]` : ""}${e.detail ? ` — ${e.detail}` : ""}`);
      process.exitCode = 1;
    }
  }
}
