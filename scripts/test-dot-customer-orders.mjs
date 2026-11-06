#!/usr/bin/env node
// Parser check for DOT "Customer Order Details".
//   node scripts/test-dot-customer-orders.mjs "<path to Customer Order Details.xlsx>" [--totals-only]
// Asserts the figures measured on the first real file (2026-11-05). A later
// report is a different snapshot and will differ — use --totals-only for it.
import XLSX from 'xlsx';
import { parseRows, isNotOlder } from '../src/parsers/dotCustomerOrders.js';

const path = process.argv[2];
if (!path) { console.error('usage: node scripts/test-dot-customer-orders.mjs <file.xlsx> [--totals-only]'); process.exit(2); }
const wb = XLSX.readFile(path);
const sheet = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'details') ?? wb.SheetNames[0];
const res = parseRows(XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null }), sheet);
const recs = res.records;
const count = (f) => recs.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), {});
const totals = {
  lines: recs.length,
  orders: new Set(recs.map((r) => r.dot_order_number)).size,
  ordered: recs.reduce((a, r) => a + r.ordered_cases, 0),
  cut: recs.reduce((a, r) => a + r.cut_cases, 0),
  status: count((r) => r.order_status),
  sku: count((r) => r.sku),
  linesWithLots: recs.filter((r) => r.lots.length).length,
  lotLines: recs.reduce((a, r) => a + r.lots.length, 0),
  po10Digit: recs.filter((r) => /^\d{10}$/.test(r.customer_po ?? '')).length,
  noOrderWeek: recs.filter((r) => !r.order_week).length,
};
console.log(res.summary);
console.log(totals);
res.errors.forEach((e) => console.log('  note:', e.message));
if (process.argv.includes('--totals-only')) process.exit(0);

const expect = { lines: 131, orders: 127, ordered: 2437, cut: 0, linesWithLots: 56, lotLines: 64, po10Digit: 131, noOrderWeek: 0 };
const bad = Object.entries(expect).filter(([k, v]) => totals[k] !== v);
const st = totals.status;
if (st.Open !== 75 || st.Picking !== 11 || st.Loaded !== 28 || st.Delivered !== 17) bad.push(['status counts', JSON.stringify(st)]);
if (totals.sku.null) bad.push(['unmapped SKU lines', totals.sku.null]);
if (res.errors.length) bad.push(['parser warnings', res.errors.length]);
// A known line: PBG to Cleburne TX, lot 26091AFD, expiry 2027-01-08.
const known = recs.find((r) => r.dot_order_number === '155546' && r.dot_item_number === '810546');
if (!known || known.sku !== 'PBG' || known.lots[0]?.lot !== '26091AFD' || known.earliest_expiry_picked !== '2027-01-08' || known.requested_week == null)
  bad.push(['known line 155546', JSON.stringify(known?.lots)]);
// ── Older snapshots must not move a line backwards ──
// Simulates the importer: one row per DOT order × item, and a stored line
// further along than the incoming one is kept.
const table = new Map();
const load = (rows) => rows.forEach((r) => {
  const k = `${r.dot_order_number}|${r.dot_item_number}`;
  if (isNotOlder(table.get(k), r)) table.set(k, r);
});
load(recs);
const older = recs.map((r) => ({ ...r, order_status: 'Open', reconciled_date: null }));  // the same lines, a week earlier
load(older); load(recs);                                                               // and the real file again
const delivered = [...table.values()].filter((r) => r.order_status === 'Delivered').length;
console.log('out-of-order test', { rows: table.size, deliveredAfterOlderUpload: delivered });
if (table.size !== recs.length || delivered !== 17) bad.push(['older snapshot rolled status back or duplicated', `${table.size} rows, ${delivered} delivered`]);
if (!isNotOlder({ order_status: 'Open' }, { order_status: 'Loaded' })) bad.push(['forward move refused', 'Open → Loaded']);
if (isNotOlder({ order_status: 'Delivered' }, { order_status: 'Picking' })) bad.push(['backward move allowed', 'Delivered → Picking']);

// ── Open pipeline (useDemandFeeds.shapeOpenOrders), optional 2nd arg ──
// node scripts/test-dot-customer-orders.mjs <orders.xlsx> <consignment.xlsx>
// Lines DOT lists as open but Consignment Sales History shows as shipped
// must drop out.
const csPath = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
if (csPath) {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { parseRows: parseCs } = await import('../src/parsers/dotConsignmentSales.js');
  const cwb = XLSX.readFile(csPath);
  const cs = parseCs(XLSX.utils.sheet_to_json(cwb.Sheets['Consignment Sales History'], { header: 1, defval: null })).records;
  const dir = mkdtempSync(join(process.cwd(), '.co-test-'));
  try {
    execFileSync('npx', ['esbuild', 'src/hooks/useDemandFeeds.js', '--bundle', '--format=esm', '--platform=node',
      '--external:react', '--external:@supabase/*',
      '--define:import.meta.env={"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"test"}',
      `--outfile=${join(dir, 'h.mjs')}`, '--log-level=error']);
    const { shapeOpenOrders } = await import(join(dir, 'h.mjs'));
    const open = shapeOpenOrders(recs.map((r) => ({ ...r, last_seen_at: '2026-11-05T18:00:00Z' })), cs, '2026-11-05');
    const by = open.lines.reduce((m, l) => ((m[l.sku] = (m[l.sku] || 0) + l.cases), m), {});
    const summary = { openLines: open.lines.length, shippedSince: open.shippedSince, pastDue: open.lines.filter((l) => l.pastDue).length,
      notYetPicked: open.lines.filter((l) => l.uncommitted && !l.pastDue).reduce((a, l) => a + l.cases, 0), casesBySku: by };
    console.log('open pipeline', summary);
    const expectOpen = recs.filter((r) => ['Open', 'Picking', 'Loaded'].includes(r.order_status)).length;
    if (open.lines.length + open.shippedSince !== expectOpen) bad.push(['open lines + shipped-since', open.lines.length + open.shippedSince]);
    // A line marked Open but present in consignment must be excluded:
    const anyShipped = cs.find((c) => recs.some((r) => r.dot_order_number === c.dot_order_number && r.sku === c.sku));
    if (anyShipped) {
      const fake = recs.filter((r) => r.dot_order_number === anyShipped.dot_order_number).map((r) => ({ ...r, order_status: 'Open' }));
      const o2 = shapeOpenOrders(fake, cs, '2026-11-05');
      if (o2.lines.length !== 0 || o2.shippedSince !== fake.length) bad.push(['stale Open line not dropped', o2.lines.length]);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log(bad.length ? '\n❌ ' + bad.map(([k, v]) => `${k}: got ${v}`).join(' · ') : '\n✅ matches the first real file');
process.exit(bad.length ? 1 : 0);
