/**
 * pnpm db:verify [--write-types]
 *
 * Read-only checks of the live development schema against the repository:
 *  - every local migration is recorded remotely with identical content, and nothing extra is recorded;
 *  - every public table has RLS on; user tables give anon nothing and authenticated only owner policies;
 *  - reference tables are read-only for clients; no SECURITY DEFINER function is exposed in public;
 *  - generated types match the live catalog (--write-types regenerates them).
 * Writes data/verification/supabase-schema.json (no secrets; project ref abbreviated).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { abbreviateRef, connect, localMigrations, ROOT, runMain } from "./connect.mts";
import { generateTypes } from "./types.mts";

const TYPES_FILE = path.join(ROOT, "src", "server", "database", "database.types.ts");
const ARTIFACT = path.join(ROOT, "data", "verification", "supabase-schema.json");

export const USER_TABLES = [
  "profiles", "farms", "fields", "field_scene_settings", "planting_zones", "crop_history", "soil_observations",
  "field_constraints", "farmer_priorities", "market_preferences", "evidence_retrievals", "evidence_aggregates",
  "scenarios", "simulation_input_snapshots", "snapshot_reference_datasets", "simulation_runs", "simulation_results",
];
export const REFERENCE_TABLES = ["reference_citations", "reference_datasets", "reference_items", "reference_item_citations"];

type Check = { name: string; ok: boolean; detail: string };

runMain(async () => {
  const { sql, ref } = connect();
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  try {
    const local = localMigrations();
    const remote = await sql<{ version: string; statements: string[] }[]>`
      select version, statements from supabase_migrations.schema_migrations order by version`;
    const remoteMap = new Map(remote.map((r) => [r.version, r.statements.join("")]));
    const missing = local.filter((m) => !remoteMap.has(m.version)).map((m) => m.file);
    const changed = local.filter((m) => remoteMap.has(m.version) && remoteMap.get(m.version) !== m.content).map((m) => m.file);
    const extra = remote.filter((r) => !local.some((m) => m.version === r.version)).map((r) => r.version);
    check("migrations: local == remote history", !missing.length && !changed.length && !extra.length,
      `${remote.length} recorded; missing ${JSON.stringify(missing)}; changed ${JSON.stringify(changed)}; extra ${JSON.stringify(extra)}`);

    const tables = await sql<{ name: string; rls: boolean; forced: boolean }[]>`
      select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 1`;
    const tableNames = tables.map((t) => t.name);
    const expected = [...USER_TABLES, ...REFERENCE_TABLES].sort();
    check("tables: exactly the expected set", JSON.stringify(tableNames) === JSON.stringify(expected),
      `found ${tableNames.length}: unexpected ${JSON.stringify(tableNames.filter((t) => !expected.includes(t)))}, missing ${JSON.stringify(expected.filter((t) => !tableNames.includes(t)))}`);
    const noRls = tables.filter((t) => !t.rls).map((t) => t.name);
    check("RLS enabled on every public table", noRls.length === 0, noRls.length ? `without RLS: ${noRls.join(", ")}` : `${tables.length} tables`);

    const privs = await sql<{ table: string; role: string; priv: string }[]>`
      select table_name as table, grantee as role, privilege_type as priv
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')`;
    const colPrivs = await sql<{ table: string; role: string; priv: string; column: string }[]>`
      select table_name as table, grantee as role, privilege_type as priv, column_name as column
      from information_schema.column_privileges
      where table_schema = 'public' and grantee in ('anon', 'authenticated')`;
    const anonOnUser = privs.filter((p) => p.role === "anon" && USER_TABLES.includes(p.table));
    check("anon has no privileges on user tables", anonOnUser.length === 0, anonOnUser.map((p) => `${p.table}:${p.priv}`).join(", ") || "none");
    const clientWritesOnReference = [...privs, ...colPrivs].filter((p) => REFERENCE_TABLES.includes(p.table) && p.priv !== "SELECT");
    check("reference tables are read-only for clients", clientWritesOnReference.length === 0,
      clientWritesOnReference.map((p) => `${p.role} ${p.priv} ${p.table}`).join(", ") || "SELECT only");
    const userWritesOnServerOnly = [...privs, ...colPrivs].filter((p) =>
      ["simulation_results", "evidence_aggregates"].includes(p.table) && p.role === "authenticated" && p.priv !== "SELECT");
    check("results and evidence aggregates are server-written only", userWritesOnServerOnly.length === 0,
      userWritesOnServerOnly.map((p) => `${p.priv} ${p.table}`).join(", ") || "SELECT only for users");
    const derivedWritable = colPrivs.filter((p) => p.role === "authenticated" && p.priv !== "SELECT" &&
      ((p.table === "fields" && ["area_ha", "centroid"].includes(p.column)) || (p.table === "planting_zones" && p.column === "area_ha")));
    check("derived geometry columns are not client-writable", derivedWritable.length === 0,
      derivedWritable.map((p) => `${p.table}.${p.column}:${p.priv}`).join(", ") || "trigger-maintained only");

    const policies = await sql<{ table: string; name: string; cmd: string; roles: string[]; qual: string | null; with_check: string | null }[]>`
      select tablename as table, policyname as name, cmd, roles::text[] as roles, qual, with_check
      from pg_policies where schemaname = 'public' order by tablename, policyname`;
    const badUserPolicies = policies.filter((p) => USER_TABLES.includes(p.table) && (
      !p.roles.every((r) => r === "authenticated") ||
      ![p.qual, p.with_check].filter(Boolean).every((e) => /(owner_id|id) = \( SELECT auth\.uid\(\)/.test(e!))
    ));
    check("user-table policies are authenticated + owner-scoped", badUserPolicies.length === 0,
      badUserPolicies.map((p) => `${p.table}/${p.name}`).join(", ") || `${policies.filter((p) => USER_TABLES.includes(p.table)).length} policies`);
    const refWritePolicies = policies.filter((p) => REFERENCE_TABLES.includes(p.table) && p.cmd !== "SELECT");
    check("no write policies on reference tables", refWritePolicies.length === 0, refWritePolicies.map((p) => p.name).join(", ") || "none");

    const definers = await sql<{ name: string }[]>`
      select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`;
    check("no SECURITY DEFINER functions in public", definers.length === 0, definers.map((d) => d.name).join(", ") || "none");
    const anonExec = await sql<{ name: string }[]>`
      select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`;
    check("anon cannot execute FieldShift RPCs", anonExec.length === 0, anonExec.map((d) => d.name).join(", ") || "none");

    const [postgis] = await sql`select extversion from pg_extension where extname = 'postgis'`;
    check("PostGIS installed", Boolean(postgis), postgis ? `postgis ${postgis.extversion}` : "missing");

    const refs = await sql<{ kind: string; name: string; version: number; status: string; sha: string; items: number }[]>`
      select d.kind, d.name, d.version, d.status, d.content_sha256 as sha, count(i.id)::int as items
      from public.reference_datasets d left join public.reference_items i on i.dataset_id = d.id
      group by d.id order by d.kind, d.name, d.version`;
    check("reference datasets imported and published", refs.some((r) => r.status === "published"),
      refs.map((r) => `${r.name} v${r.version} ${r.status} (${r.items} items, ${r.sha?.slice(0, 12)})`).join("; ") || "none");

    const latest = local.at(-1)?.version ?? "none";
    const generated = await generateTypes(sql, latest);
    if (process.argv.includes("--write-types")) writeFileSync(TYPES_FILE, generated);
    let current = "";
    try {
      current = readFileSync(TYPES_FILE, "utf8").replace(/\r\n/g, "\n");
    } catch {}
    check("generated types match live schema", current === generated, current === generated ? path.relative(ROOT, TYPES_FILE) : "stale: run pnpm db:types");

    const passed = checks.every((c) => c.ok);
    writeFileSync(ARTIFACT, JSON.stringify({
      _artifact: "Live schema verification of the FieldShift development Supabase project. Produced by scripts/db/verify.mts.",
      project: abbreviateRef(ref),
      verifiedAt: new Date().toISOString(),
      outcome: passed ? "verified" : "failed",
      migrations: local.map((m) => ({ file: m.file, sha256: m.sha256 })),
      referenceDatasets: refs,
      checks,
    }, null, 2) + "\n");
    for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
    console.log(passed ? "\nSchema verified." : "\nSchema verification FAILED.");
    return passed ? 0 : 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
});
