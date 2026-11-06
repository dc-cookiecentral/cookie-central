#!/usr/bin/env node
// Parser check for DOT "Customer Order Details".
//   node scripts/test-dot-customer-orders.mjs "<path to Customer Order Details.xlsx>" [--totals-only]
// Asserts the figures measured on the first real file (2026-11-05). A later
// report is a different snapshot and will differ — use --totals-only for it.
import XLSX from 'xlsx';
import { parseRows } from '../src/parsers/dotCustomerOrders.js';

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
console.log(bad.length ? '\n❌ ' + bad.map(([k, v]) => `${k}: got ${v}`).join(' · ') : '\n✅ matches the first real file');
process.exit(bad.length ? 1 : 0);
