#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Row-count watch for the 1,000-row cap (RUNBOOK §6.2, weekly).
//
//   node scripts/row-counts.mjs
//
// PostgREST returns at most 1,000 rows per query and says nothing when it
// truncates. Any whole-table read that is not paged through src/lib/fetchAll.js
// silently loses rows past 1,000. By Nov 5 2026 four tables had crossed
// (purchase_orders, po_line_items, po_changes, cortina_invoices) — see the
// row-cap ticket in docs/BUILD_PLAN.md.
//
// This lists every table `src/` reads with its exact row count, largest first,
// and flags any over WARN_AT. A flagged table needs every whole-table read of it
// paged (a read filtered to one PO, one week, etc. is fine). The script cannot
// tell paged reads from unpaged ones: grep the table name and look.
//
// Read-only. Uses VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local.
// ⚠️ With the anon key, a table whose read policy is internal-only (the
// Supplies tables) counts 0, not an error. purchase_orders, po_line_items and
// cortina_invoices are readable by all, so their counts are exact. For exact
// counts everywhere:
//   SUPABASE_SERVICE_ROLE_KEY=… node scripts/row-counts.mjs
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WARN_AT = 800;
const CAP = 1000;

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
  .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = serviceKey ?? process.env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env.local'); process.exit(1); }

// Every `.from('table')` in src/ (storage buckets use `.storage.from`, skipped).
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|tsx?)$/.test(f) ? [p] : [];
  });
}
const tables = new Set();
for (const f of walk('src')) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(?<!storage)\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/g)) tables.add(m[1]);
}
// useSupplies reads its tables from a list (`supabase.from(table)`), unpaged,
// which the pattern above cannot see: take them from its SOURCES pairs.
const supplies = readFileSync('src/hooks/useSupplies.js', 'utf8').match(/const SOURCES = \[([\s\S]*?)\n\];/);
for (const m of (supplies?.[1] ?? '').matchAll(/\[\s*'\w+',\s*'([a-z0-9_]+)'\s*\]/g)) tables.add(m[1]);

async function count(t) {
  const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  const total = res.ok ? Number(res.headers.get('content-range')?.split('/')[1]) : NaN;
  return Number.isFinite(total) ? total : null;
}

const rows = await Promise.all([...tables].map(async (t) => ({ t, n: await count(t) })));
rows.sort((a, b) => (b.n ?? -1) - (a.n ?? -1));
let flagged = 0;
for (const { t, n } of rows) {
  const mark = n == null ? '?' : n > CAP ? '🔴' : n > WARN_AT ? '🟠' : '  ';
  if (n != null && n > WARN_AT) flagged++;
  console.log(`${mark} ${String(n ?? '?').padStart(7)}  ${t}`);
}
console.log(`\n${tables.size} tables read by src/. ${flagged} over ${WARN_AT} rows (🔴 = past the ${CAP}-row cap: every whole-table read of it must be paged).`);
if (!serviceKey) console.log('Counted with the anon key: tables with internal-only read policies (e.g. Supplies) show 0. Set SUPABASE_SERVICE_ROLE_KEY for exact counts.');
