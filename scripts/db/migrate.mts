/**
 * pnpm db:migrate            → inspect remote migration history and drift (read-only)
 * pnpm db:migrate --apply    → additionally apply pending local migrations, each in its own transaction
 *
 * History lives in supabase_migrations.schema_migrations (the Supabase CLI table), so the CLI sees
 * the same state. Drift = a remote version missing locally, or an applied file whose content
 * changed. Drift aborts --apply; nothing is ever reset or dropped.
 */
import { abbreviateRef, connect, localMigrations, runMain } from "./connect.mts";

const APPLY = process.argv.includes("--apply");

runMain(async () => {
  const { sql, ref } = connect();
  try {
    const [{ version: pgVersion }] = await sql`select current_setting('server_version') as version`;
    console.log(`Target project ${abbreviateRef(ref)} · Postgres ${pgVersion}`);

    const [{ exists }] = await sql`select to_regclass('supabase_migrations.schema_migrations') is not null as exists`;
    if (!exists && APPLY) {
      await sql`create schema if not exists supabase_migrations`;
      await sql`create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text)`;
    }
    const remote: { version: string; name: string | null; statements: string[] | null }[] = exists || APPLY
      ? await sql`select version, name, statements from supabase_migrations.schema_migrations order by version`
      : [];

    const publicTables = await sql`select tablename from pg_tables where schemaname = 'public' order by 1`;
    console.log(`Remote: ${remote.length} recorded migration(s); ${publicTables.length} table(s) in public.`);

    const local = localMigrations();
    const localByVersion = new Map(local.map((m) => [m.version, m]));
    const drift: string[] = [];
    for (const r of remote) {
      const l = localByVersion.get(r.version);
      if (!l) drift.push(`${r.version} ${r.name ?? ""} is applied remotely but missing locally`);
      else if ((r.statements ?? []).join("") !== l.content) drift.push(`${l.file} changed after it was applied`);
    }
    const applied = new Set(remote.map((r) => r.version));
    const pending = local.filter((m) => !applied.has(m.version));
    const latestApplied = remote.at(-1)?.version ?? "";
    const outOfOrder = pending.filter((m) => m.version < latestApplied);
    for (const m of outOfOrder) drift.push(`${m.file} is older than the latest applied migration ${latestApplied}`);

    if (remote.length === 0 && publicTables.length > 0) {
      drift.push(`public already has tables (${publicTables.map((t) => t.tablename).join(", ")}) but no recorded migrations`);
    }

    for (const m of local) console.log(`  ${applied.has(m.version) ? "applied" : "PENDING"}  ${m.file}  sha256:${m.sha256.slice(0, 12)}`);
    if (drift.length) {
      console.log("\nDRIFT (not reconciled automatically; resolve by hand without resetting):");
      for (const d of drift) console.log(`  - ${d}`);
      return 1;
    }
    if (!APPLY) {
      console.log(pending.length ? `\n${pending.length} pending. Re-run with --apply to apply them.` : "\nUp to date.");
      return 0;
    }

    for (const m of pending) {
      process.stdout.write(`Applying ${m.file} … `);
      await sql.begin(async (tx) => {
        await tx.unsafe(m.content);
        await tx`insert into supabase_migrations.schema_migrations (version, name, statements) values (${m.version}, ${m.name}, ${[m.content]})`;
      });
      console.log("ok");
    }
    console.log(pending.length ? `Applied ${pending.length} migration(s).` : "Nothing to apply.");
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
});
