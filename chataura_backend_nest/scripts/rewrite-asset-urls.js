#!/usr/bin/env node
/**
 * Switch every stored link from the old GCS bucket to the CDN host (same object paths, the files were copied 1:1).
 *   node scripts/rewrite-asset-urls.js            -> dry run: counts per table.column, changes nothing
 *   node scripts/rewrite-asset-urls.js --apply    -> does it in ONE transaction (all or nothing)
 *   node scripts/rewrite-asset-urls.js --revert   -> puts the old links back (for a rollback)
 * Env: DATABASE_URL, optional OLD_PREFIX / NEW_PREFIX.
 */
const { PrismaClient } = require('@prisma/client');

const OLD = process.env.OLD_PREFIX || 'https://storage.googleapis.com/chataura/';
const NEW = process.env.NEW_PREFIX || 'https://cdn.chataura.in/';
const revert = process.argv.includes('--revert');
const apply = process.argv.includes('--apply') || revert;
const [from, to] = revert ? [NEW, OLD] : [OLD, NEW];

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;

(async () => {
  const db = new PrismaClient();
  const cols = await db.$queryRawUnsafe(`
    select table_name, column_name, data_type from information_schema.columns
    where table_schema = 'public' and data_type in ('text','character varying','json','jsonb')
    order by 1, 2`);
  const hits = [];
  for (const c of cols) {
    const col = `${q(c.table_name)}.${q(c.column_name)}`;
    const expr = c.data_type === 'text' || c.data_type === 'character varying' ? q(c.column_name) : `${q(c.column_name)}::text`;
    const [{ n }] = await db.$queryRawUnsafe(`select count(*)::int n from ${q(c.table_name)} where position($1 in ${expr}) > 0`, from);
    if (n > 0) hits.push({ ...c, n });
  }
  console.log(`${revert ? 'REVERT' : 'REWRITE'} ${from}  ->  ${to}`);
  hits.forEach((h) => console.log(`  ${h.table_name}.${h.column_name} (${h.data_type}): ${h.n} rows`));
  console.log(`total: ${hits.reduce((a, h) => a + h.n, 0)} rows in ${hits.length} columns`);
  if (!apply) { console.log('dry run only. add --apply to change the data.'); await db.$disconnect(); return; }

  await db.$transaction(async (tx) => {
    for (const h of hits) {
      const set = h.data_type === 'text' || h.data_type === 'character varying'
        ? `${q(h.column_name)} = replace(${q(h.column_name)}, $1, $2)`
        : `${q(h.column_name)} = replace(${q(h.column_name)}::text, $1, $2)::${h.data_type}`;
      const r = await tx.$executeRawUnsafe(`update ${q(h.table_name)} set ${set} where position($1 in ${h.data_type === 'text' || h.data_type === 'character varying' ? q(h.column_name) : q(h.column_name) + '::text'}) > 0`, from, to);
      console.log(`  updated ${h.table_name}.${h.column_name}: ${r}`);
    }
  }, { timeout: 120000 });
  console.log('done.');
  await db.$disconnect();
})().catch((e) => { console.error('FAILED, nothing changed:', e.message); process.exit(1); });
