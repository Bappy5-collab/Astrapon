/**
 * pnpm db:rehearse — applies every pending migration inside ONE transaction and then rolls it back.
 * Catches SQL errors before anything is committed to the remote project.
 */
import { abbreviateRef, connect, localMigrations, runMain } from "./connect.mts";

class Rollback extends Error {}

runMain(async () => {
  const { sql, ref } = connect();
  try {
    const [{ exists }] = await sql`select to_regclass('supabase_migrations.schema_migrations') is not null as exists`;
    const applied = new Set<string>(exists ? (await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version as string) : []);
    const pending = localMigrations().filter((m) => !applied.has(m.version));
    console.log(`Rehearsing ${pending.length} migration(s) on ${abbreviateRef(ref)} (rolled back afterwards)…`);
    try {
      await sql.begin(async (tx) => {
        for (const m of pending) {
          process.stdout.write(`  ${m.file} … `);
          await tx.unsafe(m.content);
          console.log("ok");
        }
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    console.log("Rehearsal passed; nothing was committed.");
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
});
