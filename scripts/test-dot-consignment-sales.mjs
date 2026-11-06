#!/usr/bin/env node
// Parser check for DOT "Consignment Sales History".
//   node scripts/test-dot-consignment-sales.mjs "<path to Consignment Sales History.xlsx>"
// Asserts the totals measured on the first real file (2026-11-05). A later,
// longer export will legitimately differ — pass --totals-only to print them.
import XLSX from 'xlsx';
import { parseRows } from '../src/parsers/dotConsignmentSales.js';

const path = process.argv[2];
if (!path) { console.error('usage: node scripts/test-dot-consignment-sales.mjs <file.xlsx> [--totals-only]'); process.exit(2); }
const wb = XLSX.readFile(path);
const sheet = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'consignment sales history') ?? wb.SheetNames[0];
const res = parseRows(XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null }), sheet);
const recs = res.records;
const sum = (k, f = () => true) => recs.filter(f).reduce((a, r) => a + r[k], 0);
const totals = {
  lines: recs.length,
  pos: new Set(recs.map((r) => r.customer_po)).size,
  ordered: sum('ordered_cases'),
  received: sum('received_cases'),
  bcOrdered: sum('ordered_cases', (r) => r.sku === 'BC'),
  bcReceived: sum('received_cases', (r) => r.sku === 'BC'),
  unmappedSku: recs.filter((r) => !r.sku).length,
  noShipWeek: recs.filter((r) => !r.ship_week).length,
  // Walmart POs are 10-digit text; a number-typed cell would drop leading zeros.
  po10Digit: recs.filter((r) => /^\d{10}$/.test(r.customer_po ?? '')).length,
};
console.log(res.summary);
console.log(totals);
res.errors.forEach((e) => console.log('  note:', e.message));
if (process.argv.includes('--totals-only')) process.exit(0);

const expect = { lines: 620, pos: 566, ordered: 20512, received: 15777, bcOrdered: 10181, bcReceived: 5794, unmappedSku: 0, noShipWeek: 0 };
const bad = Object.entries(expect).filter(([k, v]) => totals[k] !== v);
// The re-placed PO must survive as two lines (two DOT orders), not collapse.
const replaced = recs.filter((r) => r.customer_po === '0112957696' && r.item_number === '679640563');
if (replaced.length !== 2) bad.push(['re-placed PO lines', replaced.length]);
if (totals.po10Digit !== totals.lines) bad.push(['POs kept as 10-digit text', totals.po10Digit]);
// The hook's PO × SKU grouping, on the real rows. Loaded via esbuild because
// the hook file imports React and Supabase; only the pure function is used.
const { execFileSync } = await import('node:child_process');
const { mkdtempSync, rmSync } = await import('node:fs');
const { join } = await import('node:path');
const dir = mkdtempSync(join(process.cwd(), '.cs-test-'));
try {
  execFileSync('npx', ['esbuild', 'src/hooks/useDemandFeeds.js', '--bundle', '--format=esm', '--platform=node',
    '--external:react', '--external:@supabase/*',
    // src/lib/supabase.js reads Vite env at import time; give it inert values.
    '--define:import.meta.env={"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"test"}',
    `--outfile=${join(dir, 'h.mjs')}`, '--log-level=error']);
  const { shapeConsignment } = await import(join(dir, 'h.mjs'));
  const { consignment, consignmentWeekly } = shapeConsignment(recs);
  const by = (sku) => consignment.filter((r) => r.sku === sku);
  const cutOf = (sku) => by(sku).reduce((a, r) => a + r.cut, 0);
  const shaped = { poSku: consignment.length, replaced: consignment.filter((r) => r.replaced).length,
    cut: { WC: cutOf('WC'), PBG: cutOf('PBG'), CCF: cutOf('CCF'), BC: cutOf('BC') },
    weeklyRows: consignmentWeekly.length };
  console.log('shaped', shaped);
  // The re-placed PO: ordered 42 once, received 42 → no cut.
  const rp = consignment.find((r) => r.po === '0112957696' && r.sku === 'WC');
  if (!rp || rp.ordered !== 42 || rp.received !== 42 || rp.cut !== 0) bad.push(['re-placed PO shaped as filled', JSON.stringify(rp)]);
  if (shaped.poSku !== 619) bad.push(['PO × SKU groups', shaped.poSku]);
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log(bad.length ? '\n❌ ' + bad.map(([k, v]) => `${k}: got ${v}`).join(' · ') : '\n✅ matches the first real file');
process.exit(bad.length ? 1 : 0);
