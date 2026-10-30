/**
 * pnpm db:import-reference [--dry-run]
 *
 * Idempotent import of sourced reference datasets. For each dataset the canonical content hash is
 * compared with the newest published version: unchanged → skipped; changed or new → a new version is
 * inserted as draft, filled, then published, and the previous version is retired (still readable, so
 * snapshots that pinned it keep resolving). Published versions are never edited.
 */
import { createHash } from "node:crypto";

import { canonicalJson } from "../../src/domain/reference/canonical.ts";
import { buildReferenceDatasets, type CitationRecord } from "../../src/domain/reference/datasets.ts";
import { connect, runMain } from "./connect.mts";

const DRY = process.argv.includes("--dry-run");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const citationHash = (c: CitationRecord) => sha(canonicalJson(c));

runMain(async () => {
  const { citations, datasets } = buildReferenceDatasets();
  const citationHashByKey = new Map(citations.map((c) => [c.citationKey, citationHash(c)]));

  const plans = datasets.map((d) => {
    const items = [...d.items].sort((a, b) => a.itemKey.localeCompare(b.itemKey));
    const content = items.map((i) => ({
      itemKey: i.itemKey,
      payload: i.payload,
      citations: i.citationKeys.map((k) => {
        const h = citationHashByKey.get(k);
        if (!h) throw new Error(`Item ${d.name}/${i.itemKey} cites unknown citation ${k}`);
        return h;
      }).sort(),
    }));
    return { ...d, items, contentSha256: sha(canonicalJson({ kind: d.kind, name: d.name, description: d.description, items: content })) };
  });

  if (DRY) {
    for (const p of plans) console.log(`${p.kind}/${p.name}: ${p.items.length} items, sha256 ${p.contentSha256.slice(0, 12)}`);
    console.log(`${citations.length} citations. Dry run; nothing written.`);
    return 0;
  }

  const { sql } = connect();
  try {
    await sql.begin(async (tx) => {
      let newCitations = 0;
      for (const c of citations) {
        const res = await tx`
          insert into public.reference_citations (citation_key, citation, url, doi, verification, content_sha256)
          values (${c.citationKey}, ${c.citation}, ${c.url}, ${c.doi}, ${c.verification}, ${citationHashByKey.get(c.citationKey)!})
          on conflict (citation_key, content_sha256) do nothing`;
        newCitations += res.count;
      }
      console.log(`Citations: ${newCitations} new, ${citations.length - newCitations} unchanged.`);

      for (const p of plans) {
        const [latest] = await tx`
          select id, version, status, content_sha256 from public.reference_datasets
          where kind = ${p.kind} and name = ${p.name} order by version desc limit 1`;
        if (latest?.status === "published" && latest.content_sha256 === p.contentSha256) {
          console.log(`${p.kind}/${p.name}: v${latest.version} unchanged (sha256 ${p.contentSha256.slice(0, 12)}).`);
          continue;
        }
        if (latest?.status === "draft") throw new Error(`${p.name} v${latest.version} is a leftover draft; inspect it before importing.`);
        const version = (latest?.version ?? 0) + 1;
        const [ds] = await tx`
          insert into public.reference_datasets (kind, name, version, description)
          values (${p.kind}, ${p.name}, ${version}, ${p.description}) returning id`;
        for (const item of p.items) {
          const [row] = await tx`
            insert into public.reference_items (dataset_id, item_key, payload)
            values (${ds.id}, ${item.itemKey}, ${tx.json(JSON.parse(canonicalJson(item.payload)))}) returning id`;
          for (const key of item.citationKeys) {
            await tx`
              insert into public.reference_item_citations (item_id, citation_id)
              select ${row.id}, id from public.reference_citations
              where citation_key = ${key} and content_sha256 = ${citationHashByKey.get(key)!}`;
          }
        }
        await tx`
          update public.reference_datasets set status = 'published', published_at = now(), content_sha256 = ${p.contentSha256}
          where id = ${ds.id}`;
        if (latest?.status === "published") {
          await tx`update public.reference_datasets set status = 'retired' where id = ${latest.id}`;
        }
        console.log(`${p.kind}/${p.name}: published v${version} with ${p.items.length} items (sha256 ${p.contentSha256.slice(0, 12)}).`);
      }
    });
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
});
