#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Tests for src/parsers/dotInventorySnapshot.js.
//
//   node scripts/test-dot-inventory-snapshot.mjs                 # synthetic only
//   node scripts/test-dot-inventory-snapshot.mjs "<path>.xlsx"   # + the real file
//
// The synthetic workbooks are built in memory, so nothing from DOT is committed.
// With a path to the first real export (received 2026-10-27), it also asserts
// the reading recorded in BUILD_PLAN: good WC 1,531 / PBG 743 / CCF 1,544 /
// BC 1,257, expired 1,086, committed 1,005, as of Oct 27 → W39. If a change
// stops reproducing those, the change is wrong.
// ─────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import parser from '../src/parsers/dotInventorySnapshot.js';

const SUMMARY_H = ['Dot Item Number', 'Manufacturer Number', 'GTIN/UPC', 'Item Description', 'UOM',
  'Cases per Pallet', 'Lot Code', 'Expiration Date', 'Product Status', 'Total Inventory',
  'Warehouse Inventory', 'Loaded', 'Picked', 'Other'];
const WH_H = ['Dot Item Number', 'Manufacturer Number', 'GTIN/UPC', 'Item Description', 'UOM',
  'Cases per Pallet', 'Location', 'Lot Code', 'Expiration Date', 'Product Status', 'Total Warehouse Inventory'];
const AGG_H = ['Dot Item Number', 'Manufacturer Number', 'GTIN/UPC', 'Item Description', 'PO Number',
  'Dot Order Number', 'Lot Code', 'Expiration Date', 'Product Status', 'Order Status Description',
  'Total In Transit Quantity'];
const G = { WC: '10194346527783', PBG: '10194346527790', CCF: '10194346565594', BC: '10194346715944' };
const RG = 'REGULAR GOOD PRODUCT (RG)', EX = 'EXPIRED PRODUCT (EX)';

// lot: [sku|gtin, exp, status, total, wh, loaded, picked, other?]
const lot = (sku, exp, status, total, wh, loaded = 0, picked = 0, other = 0) => {
  const gtin = G[sku] ?? sku;
  return [810547, gtin, gtin, `Item ${sku}`, 'CA', sku === 'BC' ? 96 : 189, `L-${exp}`, exp, status,
    total, wh, loaded, picked, other];
};

const BASE_LOTS = [
  lot('WC', '01/08/2027', RG, 455, 455),
  lot('WC', '12/10/2026', RG, 185, 76, 54, 55),        // committed 109; expires within 60 days
  lot('WC', '09/24/2026', EX, 42, 42),
  lot('PBG', '01/18/2027', RG, 300, 279, 21, 0),
  lot('PBG', '07/11/2026', EX, 157, 157),
  lot('CCF', '02/01/2027', RG, 400, 400),
  lot('BC', '03/01/2027', RG, 200, 175, 0, 25),
];

function makeFile(lots, { created = new Date('2026-10-27T18:40:11Z'), lastModified, wh = true, agg = true,
  header = SUMMARY_H, sheetName = 'Inventory Summary' } = {}) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...lots]), sheetName);
  if (wh) {
    const rows = lots.map((l) => [l[0], l[1], l[2], l[3], l[4], l[5], 'Mt. Sterling, Illinois', l[6], l[7], l[8], l[10]]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([WH_H, ...rows]), 'WH Summary');
  }
  if (agg) {
    const rows = [];
    for (const l of lots) {
      if (l[11]) rows.push([l[0], l[1], l[2], l[3], 'PO1', 1, l[6], l[7], l[8], 'Loaded', l[11]]);
      if (l[12]) rows.push([l[0], l[1], l[2], l[3], 'PO2', 2, l[6], l[7], l[8], 'Picked', l[12]]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([AGG_H, ...rows]), 'Aggregated Orders');
  }
  if (created) wb.Props = { CreatedDate: created };
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { name: 'Inventory Snapshot.xlsx', lastModified, arrayBuffer: async () => buf };
}
const bySku = (out) => Object.fromEntries(out.records.map((r) => [r.sku, r]));
const msgs = (out) => out.errors.map((e) => e.message).join('\n');

test('aggregates lots per SKU: good includes committed, expired kept apart', async () => {
  const out = await parser.parseFile(makeFile(BASE_LOTS));
  const r = bySku(out);
  assert.deepEqual(out.records.map((x) => x.sku), ['WC', 'PBG', 'CCF', 'BC']);
  assert.equal(r.WC.good_cases, 640);
  assert.equal(r.WC.committed_cases, 109);
  assert.equal(r.WC.expired_cases, 42);
  assert.equal(r.WC.expiring_60d_cases, 185);           // Dec 10 is 44 days after Oct 27
  assert.equal(r.WC.earliest_good_expiry, '2026-12-10');
  assert.equal(r.WC.lot_count, 3);
  assert.equal(r.PBG.good_cases, 300);
  assert.equal(r.PBG.expired_cases, 157);
  assert.equal(r.BC.committed_cases, 25);
  assert.equal(r.BC.cases_per_pallet, 96);
  assert.equal(r.WC.gtin, G.WC);
  assert.equal(out.errors.length, 0, msgs(out));
  assert.ok(!('wh_loaded_picked' in r.WC), 'cross-check scratch field must not reach the table');
});

test('as-of = workbook CreatedDate in Central time → Walmart week, as closing', async () => {
  const out = await parser.parseFile(makeFile(BASE_LOTS));
  assert.equal(out.records[0].snapshot_date, '2026-10-27');
  assert.equal(out.records[0].wm_week, 202639);
  assert.match(out.summary, /as of Oct 27 \(workbook created date\) → W39 closing/);
  // 03:00 UTC on the 28th is still the evening of the 27th in Illinois.
  const late = await parser.parseFile(makeFile(BASE_LOTS, { created: new Date('2026-10-28T03:00:00Z') }));
  assert.equal(late.records[0].snapshot_date, '2026-10-27');
  // Saturday Oct 31 starts W40.
  const sat = await parser.parseFile(makeFile(BASE_LOTS, { created: new Date('2026-10-31T15:00:00Z') }));
  assert.equal(sat.records[0].wm_week, 202640);
});

test('no CreatedDate → falls back to the file modified time, with a warning', async () => {
  const out = await parser.parseFile(makeFile(BASE_LOTS, { created: null, lastModified: Date.parse('2026-10-29T16:00:00Z') }));
  // (SheetJS writes no CreatedDate of its own, so this really exercises the fallback.)
  assert.match(out.summary, /file modified date/);
  assert.equal(out.records[0].snapshot_date, '2026-10-29');
  assert.match(msgs(out), /no created date/);
});

test('no date at all → nothing parsed, rather than a guessed week', async () => {
  const out = await parser.parseFile(makeFile(BASE_LOTS, { created: null }));
  assert.equal(out.records.length, 0);
  assert.match(msgs(out), /Cannot tell what date this snapshot is from/);
});

test('unknown GTIN is reported and not imported', async () => {
  const out = await parser.parseFile(makeFile([...BASE_LOTS, lot('99999999999999', '01/01/2027', RG, 50, 50)]));
  assert.equal(out.records.length, 4);
  assert.match(msgs(out), /Unknown GTIN 99999999999999 .*50 cases.*NOT imported/);
});

test('a SKU with no lots is warned about and not written as zero', async () => {
  const out = await parser.parseFile(makeFile(BASE_LOTS.filter((l) => l[1] !== G.BC)));
  assert.deepEqual(out.records.map((x) => x.sku), ['WC', 'PBG', 'CCF']);
  assert.match(msgs(out), /No lots for BC/);
});

test('row identity break, Other cases and expired-but-committed are flagged', async () => {
  const out = await parser.parseFile(makeFile([
    ...BASE_LOTS,
    lot('CCF', '02/02/2027', RG, 100, 90),               // 100 ≠ 90 + 0 + 0 + 0
    lot('CCF', '02/03/2027', RG, 10, 0, 0, 0, 10),       // Other
    lot('PBG', '08/01/2026', EX, 21, 0, 21, 0),          // expired, loaded
  ], { agg: false, wh: false }));
  const m = msgs(out);
  assert.match(m, /1 lot\(s\) break "Total = Warehouse/);
  assert.match(m, /10 case\(s\) sit in the "Other" column/);
  assert.match(m, /21 expired case\(s\) are Loaded or Picked/);
  assert.equal(bySku(out).PBG.committed_cases, 21);      // the EX lot's 21 is not committed
  assert.equal(bySku(out).PBG.expired_cases, 178);
});

test('cross-tab mismatch is flagged', async () => {
  const f = makeFile(BASE_LOTS);
  const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
  const agg = XLSX.utils.sheet_to_json(wb.Sheets['Aggregated Orders'], { header: 1 });
  agg[1][10] += 5;                                       // one Loaded line now disagrees
  wb.Sheets['Aggregated Orders'] = XLSX.utils.aoa_to_sheet(agg);
  wb.Props = { CreatedDate: new Date('2026-10-27T18:40:11Z') };
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const out = await parser.parseFile({ arrayBuffer: async () => buf });
  assert.match(msgs(out), /Aggregated Orders shows/);
});

test('the Assemblers "Inventory Snapshot Report" is refused with a pointer to its card', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Item code', 'Item description', 'Lot code', 'Expiry date', 'Base quantity'],
    ['110013', 'Eggs', '134-6', '06-04-2026', 120],
  ]), 'Inventory Snapshot Report');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const out = await parser.parseFile({ arrayBuffer: async () => buf });
  assert.equal(out.records.length, 0);
  assert.match(msgs(out), /Assemblers .*Upload it on the Assemblers card/);
});

test('finds the Summary by its header even if the tab is renamed, and never mistakes WH Summary for it', async () => {
  const out = await parser.parseFile(makeFile(BASE_LOTS, { sheetName: 'Sheet1' }));
  assert.equal(bySku(out).WC.committed_cases, 109);     // WH Summary has no Loaded/Picked
});

// ── importRecords, against a fake Supabase client ─────────────────────────
function fakeClient(existing) {
  const calls = { upserts: [] };
  const client = {
    from: () => ({
      select: () => ({ in: async () => ({ data: existing, error: null }) }),
      upsert: async (rows, opts) => { calls.upserts.push({ rows, opts }); return { error: null }; },
    }),
  };
  return { client, calls };
}

test('import upserts on (sku, wm_week) and never overwrites a newer reading', async () => {
  const out = await parser.parseFile(makeFile(BASE_LOTS));
  const { client, calls } = fakeClient([
    { sku: 'WC', wm_week: 202639, snapshot_date: '2026-10-29' },   // newer: keep it
    { sku: 'PBG', wm_week: 202639, snapshot_date: '2026-10-25' },  // older: replace
  ]);
  const res = await parser.importRecords(out.records, { uploadId: 'u1', client });
  assert.deepEqual(res, { inserted: 3, skipped: 1 });
  assert.equal(calls.upserts[0].opts.onConflict, 'sku,wm_week');
  assert.deepEqual(calls.upserts[0].rows.map((r) => r.sku), ['PBG', 'CCF', 'BC']);
  assert.equal(calls.upserts[0].rows[0].upload_id, 'u1');
});

test('import refuses outright when every row would go backwards', async () => {
  const out = await parser.parseFile(makeFile(BASE_LOTS));
  const { client } = fakeClient(out.records.map((r) => ({ sku: r.sku, wm_week: r.wm_week, snapshot_date: '2026-10-30' })));
  await assert.rejects(parser.importRecords(out.records, { client }), /already holds a newer DOT snapshot/);
});

// ── The real first export, when a path is given ───────────────────────────
const realPath = process.argv[2];
test('real file reproduces the Oct 27 reading', { skip: !realPath && 'no file path given' }, async () => {
  const buf = readFileSync(realPath);
  const out = await parser.parseFile({ arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  const r = bySku(out);
  assert.equal(r.WC.good_cases, 1531);
  assert.equal(r.PBG.good_cases, 743);
  assert.equal(r.CCF.good_cases, 1544);
  assert.equal(r.BC.good_cases, 1257);
  assert.equal(out.records.reduce((a, x) => a + x.expired_cases, 0), 1086);
  assert.equal(out.records.reduce((a, x) => a + x.committed_cases, 0), 1005);
  assert.equal(r.PBG.expired_cases, 458);
  assert.equal(r.BC.cases_per_pallet, 96);
  assert.equal(out.records[0].snapshot_date, '2026-10-27');
  assert.equal(out.records[0].wm_week, 202639);
  assert.equal(out.errors.length, 0, msgs(out));
  console.log('    real file:', out.summary);
});
