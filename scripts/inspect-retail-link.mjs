#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Retail Link export inspector — "suggested first move" #1 from
// docs/DEMAND_PLANNER_FORMULAS.md.
//
//   node scripts/inspect-retail-link.mjs <file.xlsx> [more.xlsx …]
//
// Runs all six parsers in src/parsers/weeklyAttachments.js against every sheet
// of a real export and reports:
//   1. which parser claims which sheet (they self-identify by header row),
//   2. what each one actually extracted,
//   3. how that maps onto the fields the demand-planner engine needs.
//
// The parsers match columns by name and are defensive — a parser that does not
// recognise a sheet returns null, so running all six against all sheets is the
// cheapest way to discover what an unfamiliar export contains.
//
// ⚠️ These parsers take `rows` as a 2D array (SheetJS `sheet_to_json(ws,
// { header: 1 })`), PER SHEET. They cannot be fed by the shared `parseFile` in
// src/utils/csvParser.js, which returns header-KEYED OBJECTS concatenated
// across every sheet: these exports carry preamble rows above the header, so
// the flattener keys them off the wrong row and loses the sheet boundaries.
// A Retail Link parser config must therefore use the `parseFile(file)` hook
// (the src/parsers/production.js pattern), not `parse(rows)`.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as XLSX from 'xlsx';
import {
  parseSalesSummary, parseMarkdown, parseItemMaster,
  parseScorecard, parseSupplyPlan, parseOtifDetail,
} from '../src/parsers/weeklyAttachments.js';

// Each parser finds its own header row, so running all six over all sheets is
// how an unfamiliar export gets identified. But three of them are NOT
// discriminating, which the first fixture run exposed:
//   • parseScorecard has no header sentinel at all — it reads row 0 as period
//     names and row 3+ as metrics, so it "succeeds" on literally any sheet.
//   • parseMarkdown's sentinel is /prime_item_number/i, which the Item Data
//     sheet also matches.
// A `sentinel` here is the extra evidence that the sheet is really that report.
// Claims without it are reported as WEAK and excluded from the coverage map,
// so a real export's output stays readable. An ingest config must key off the
// SHEET NAME or these sentinels — never off "the parser returned something".
const PARSERS = [
  {
    name: 'parseSalesSummary', fn: parseSalesSummary,
    sentinel: (rows) => cellExact(rows, 'Prime Item Nbr'),
  },
  {
    name: 'parseMarkdown', fn: parseMarkdown,
    // Item Data also carries prime_item_number; the markdown amount column is
    // what actually distinguishes the Markdown sheet.
    sentinel: (rows) => cellMatch(rows, /mumd_amount/i),
  },
  {
    name: 'parseItemMaster', fn: parseItemMaster,
    sentinel: (rows) => cellExact(rows, 'prime_item_number'),
  },
  {
    name: 'parseScorecard', fn: parseScorecard,
    sentinel: (rows) => cellMatch(rows, /vendor scorecard/i),
  },
  {
    name: 'parseSupplyPlan', fn: parseSupplyPlan,
    sentinel: (rows) => cellExact(rows, 'Grand Total'),
  },
  {
    name: 'parseOtifDetail', fn: parseOtifDetail,
    sentinel: (rows) => cellExact(rows, 'Host PO Nbr'),
  },
];

const cellExact = (rows, want) =>
  rows.some((r) => (r || []).some((c) => String(c ?? '').trim() === want));
const cellMatch = (rows, re) =>
  rows.some((r) => (r || []).some((c) => re.test(String(c ?? ''))));

// A parser "claims" a sheet when it returns something non-empty. parseItemMaster
// returns [] (not null) when it finds no header, so check length too.
const claimed = (out) => out != null && !(Array.isArray(out) && out.length === 0);

// What the engine in src/pages/DemandPlanner.jsx consumes, per SEED series.
// `null` in the `from` column = nothing in these exports supplies it yet.
const ENGINE_NEEDS = {
  pos: {
    wk:            'NOT IN FILE — Sales Summary is a single "last week" column; week must come from the filename (Dirty Cookie WK##.xlsx) or be chosen at upload',
    sku:           'parseSalesSummary.items[].item (Prime Item Nbr)',
    units:         'parseSalesSummary.items[].posQtyLW (LW POS Qty)',
    dollars:       'parseSalesSummary.items[].posSalesLW (LW POS Sales)',
    instock:       'parseSalesSummary.items[].instock (Curr Repl Instock %)',
    oh:            'parseSalesSummary.items[].strOnHand (Curr Str On Hand)',
    traited:       'parseItemMaster[].traitedStores — the ITEM DATA sheet, not Sales Summary',
    storesSelling: 'DERIVED — posQtyLW / usw (LW U/S/W); not a column of its own',
  },
  forecasts: {
    snap:   'NOT IN FILE — stamp the upload week (see the doc: MAPE needs snapshot x target)',
    target: 'parseSupplyPlan.months — ⚠️ MONTHLY, not weekly; cannot feed a weekly snapshot x target engine as-is',
    units:  'parseSupplyPlan.items[].byMonth',
  },
  dotService: {
    wk:      'parseOtifDetail.pos[].week (Walmart Week) — the ONE parser with a real week column',
    ordered: 'parseOtifDetail.pos[].ordered (Cases Ordered)',
    cut:     'DERIVED — unfilled, or ordered - onTime - late - early',
    pos:     'DERIVED — count of distinct hostPo per week',
  },
  production: { wk: 'not in these exports — production_runs table', sku: '', cases: '' },
  dot:        { wk: 'not in these exports — dot_inventory table (empty)', sku: '', cases: '' },
  orders:     { wk: 'not in these exports — purchase_orders + po_line_items (the one series with a real source)', sku: '', req: '', dlv: '' },
};

function preview(label, value, depth = 0) {
  const pad = '  '.repeat(depth + 2);
  if (Array.isArray(value)) {
    console.log(`${pad}${label}: array[${value.length}]`);
    value.slice(0, 3).forEach((v, i) =>
      console.log(`${pad}  [${i}] ${JSON.stringify(v)}`));
    if (value.length > 3) console.log(`${pad}  … ${value.length - 3} more`);
  } else if (value && typeof value === 'object') {
    console.log(`${pad}${label}: ${JSON.stringify(value).slice(0, 400)}`);
  } else {
    console.log(`${pad}${label}: ${JSON.stringify(value)}`);
  }
}

function inspectFile(path) {
  console.log('\n' + '='.repeat(78));
  console.log(`FILE  ${basename(path)}`);
  console.log('='.repeat(78));

  const wb = XLSX.read(readFileSync(path), { type: 'buffer' });
  console.log(`sheets: ${wb.SheetNames.join(' | ')}\n`);

  const hits = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
    const width = Math.max(0, ...rows.map((r) => r.length));
    console.log(`── sheet "${name}"  ${rows.length} rows x ${width} cols`);

    // Show the first few raw rows: this is where preamble-above-header shows up.
    rows.slice(0, 3).forEach((r, i) =>
      console.log(`     raw[${i}] ${JSON.stringify(r).slice(0, 160)}`));

    let confident = 0;
    const weak = [];
    for (const { name: pname, fn, sentinel } of PARSERS) {
      let out;
      try {
        out = fn(rows);
      } catch (err) {
        console.log(`   ✗ ${pname} THREW: ${err.message}`);
        continue;
      }
      if (!claimed(out)) continue;
      if (!sentinel(rows)) { weak.push(pname); continue; }
      confident++;
      hits.push({ sheet: name, parser: pname, out });
      console.log(`   ✓ ${pname} claimed this sheet (sentinel matched)`);
      if (Array.isArray(out)) preview('records', out);
      else for (const k of Object.keys(out)) preview(k, out[k]);
    }
    if (weak.length) {
      console.log(`   ~ returned data but NO sentinel (ignored): ${weak.join(', ')}`);
    }
    if (!confident) console.log('   — no parser confidently recognised this sheet');
    console.log('');
  }
  return hits;
}

function coverageReport(allHits) {
  console.log('\n' + '='.repeat(78));
  console.log('ENGINE COVERAGE — what the demand planner needs vs what these files supply');
  console.log('='.repeat(78));
  const seen = new Set(allHits.map((h) => h.parser));
  for (const [series, fields] of Object.entries(ENGINE_NEEDS)) {
    console.log(`\nSEED.${series}`);
    for (const [field, from] of Object.entries(fields)) {
      const ok = [...seen].some((p) => from.includes(p));
      const mark = ok ? '✓' : from.startsWith('NOT IN FILE') || from.includes('⚠️') ? '✗' : '·';
      console.log(`  ${mark} ${field.padEnd(14)} ${from}`);
    }
  }
  console.log('\nParsers that claimed at least one sheet:', [...seen].join(', ') || '(none)');
  const missed = PARSERS.map((p) => p.name).filter((n) => !seen.has(n));
  if (missed.length) console.log('Parsers that matched nothing:', missed.join(', '));
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/inspect-retail-link.mjs <file.xlsx> [more…]');
  process.exit(1);
}
const all = files.flatMap(inspectFile);
coverageReport(all);
