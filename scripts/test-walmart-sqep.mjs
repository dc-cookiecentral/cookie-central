#!/usr/bin/env node
// Parser check for Walmart's "SQEP Total Compliance Table" CSV export.
//   node scripts/test-walmart-sqep.mjs "<file.csv>" [--totals-only]
// Without --totals-only, asserts the figures measured on the first files
// (Nov 9 2026): projected wk 202640 = 62 defects / $1,378.40; invoiced wk
// 202635 = 55 defects / $1,375.00. A later pull will differ.
import { readFileSync } from 'node:fs';
import { parseCsv, parseRows } from '../src/parsers/walmartSqep.js';

const path = process.argv[2];
if (!path) { console.error('usage: node scripts/test-walmart-sqep.mjs <file.csv> [--totals-only]'); process.exit(2); }
const res = parseRows(parseCsv(readFileSync(path, 'utf8')));
const recs = res.records;
const count = (f) => recs.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), {});
const totals = {
  status: res.status,
  defects: recs.length,
  charge: Math.round(recs.reduce((a, r) => a + (r.charge ?? 0), 0) * 100) / 100,
  weeks: count((r) => r.walmart_week),
  category: count((r) => r.defect_category),
  network: count((r) => r.network),
  textPOs: recs.every((r) => typeof r.po_number === 'string'),
};
console.log(res.summary);
console.log(totals);
res.errors.forEach((e) => console.log('  note:', e.message));
if (process.argv.includes('--totals-only') || !recs.length) process.exit(0);

const known = {
  '202640': { status: 'projected', defects: 62, charge: 1378.4, network: { GDC: 32, RDC: 30 } },
  '202635': { status: 'invoiced', defects: 55, charge: 1375, network: { GDC: 55 } },
};
const wk = Object.keys(totals.weeks)[0];
const exp = known[wk];
if (!exp || Object.keys(totals.weeks).length !== 1) { console.log('No reference figures for this file — totals only.'); process.exit(0); }
const bad = [];
for (const k of ['status', 'defects', 'charge']) if (totals[k] !== exp[k]) bad.push([k, totals[k], exp[k]]);
if (JSON.stringify(totals.network) !== JSON.stringify(exp.network)) bad.push(['network', totals.network, exp.network]);
if (!totals.textPOs) bad.push(['PO numbers not text']);
if (res.errors.length) bad.push(['parser warnings', res.errors.length]);
if (bad.length) { console.error('FAIL', bad); process.exit(1); }
console.log('PASS');
