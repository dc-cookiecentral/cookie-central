#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Builds supabase/seeds/supplies_seed.sql (docs/SUPPLIES_SPEC.md §V1.2).
//
//   node scripts/build-supplies-seed.mjs
//
// Two sources, merged:
//   1. dc-supplies catalogue rev 6 (Oct 27 2026), transcribed into the
//      gitignored scripts/supplies-data.local.mjs (see below) and checked
//      against the embedded original documents.
//   2. prototype/Assembler_Ingredient_Data.csv, the ingredient/packaging sheet
//      that carries the ERP item codes (116070, 120005 …) and the commodity
//      ingredients (Light Brown Sugar, flour, chips …) rev 6 doesn't cover.
//      Where a sheet row is the same SKU as a rev 6 record, it only lends its
//      item code (ERP_CODE_MERGES); otherwise it becomes its own SKU.
//
// Every id is md5('<kind>:<natural key>')::uuid, so the seed is idempotent:
// re-running it upserts in place instead of duplicating.
//
// Prices are entered as the document states them (qty + total price for that
// qty). $/lb and $/1,000 are NEVER written here; v_sku_pricing derives them.
// ─────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Papa from 'papaparse';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase/seeds/supplies_seed.sql');
const CSV = join(ROOT, 'prototype/Assembler_Ingredient_Data.csv');

// ── rev 6 data (local only) ─────────────────────────────────────────────────
// VENDORS (with contacts) and REV6_ITEMS (skus → quotes → breaks) live in
// scripts/supplies-data.local.mjs, which is gitignored: this repo is public and
// those records carry contacts, account numbers and negotiated pricing. Get
// the file from the dc-supplies maintainer (or rebuild it from the catalogue).
const DATA = process.argv.includes('--data') ? process.argv[process.argv.indexOf('--data') + 1] : join(ROOT, 'scripts/supplies-data.local.mjs');
if (!existsSync(DATA)) {
  console.error(`Missing ${DATA} — the local-only rev 6 vendor data. See the header of this script.`);
  process.exit(1);
}
const { VENDORS, REV6_ITEMS, PURCHASE_ORDERS = [], RETIRED_ITEMS = [] } = await import(pathToFileURL(DATA).href);

// ── Assembler sheet → items ─────────────────────────────────────────────────
const VENDOR_ALIASES = {
  "Chris's Cookie": "Chris's Cookies",
  'Great River Plastic': 'Great River Plastics',
  'Fresh Coast Bakery': 'Fresh Coast Baking',
  PENDING: null,
};
// Sheet rows that are the same SKU as a rev 6 record: lend the ERP code only.
const ERP_CODE_MERGES = {
  '123007': { sku: 'gb-master', note: 'ERP 123007 (Assembler sheet “Black Currant Box”, distributor listed as Prime Packaging).' },
  '123002': { sku: 'gb-srp8', note: 'ERP 123002. Assembler sheet: $550.75 per pallet of 1,800 (≈30.6¢), undated.' },
  '121002': { sku: 'grp-tray', note: 'ERP 121002 from the Assembler sheet (“Tray”, Great River) — assumed to be this tray; confirm.' },
};
// Finished goods, not supplies.
const SKIP_ITEM = /^DC Classic Frozen Dough/;
// rev 6 flowwrap-film gap, attached to the matching sheet film items.
const RF_FILM_NOTE = (runout) =>
  `Flowwrap film, 9″ repeat × 15.75″ web (die-line on file). Runout ${runout}. Catalogue rev 6: NO dated LallyPak film quote on file — the sheet price below is undated; request a per-SKU film quote (lead time back-plans the reorder PO).`;
const ITEM_NOTES = {
  'Film - Walmart CCF': RF_FILM_NOTE('Dec 8 ’26'),
  'Film - Walmart WCCB': RF_FILM_NOTE('Dec 21 ’26'),
  'Film - Walmart PBJ': RF_FILM_NOTE('Oct ’27'),
};

const num = (s) => {
  const v = parseFloat(String(s ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(v) ? v : null;
};
const fmtQty = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 100) / 100));
const PKG = { bags: 'bag', bag: 'bag', box: 'box', case: 'case', pail: 'pail', bib: 'BIB', pet: 'PET jug', roll: 'roll', pallet: 'pallet' };

function sheetRows() {
  const { data } = Papa.parse(readFileSync(CSV, 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  return data.map((r) => ({
    item: (r['Ingredient (Normalized)'] || '').trim(),
    brand: (r['Brand/Supplier'] || '').trim(),
    code: (r['DC Item #'] || '').trim(),
    vendorCode: (r['Supplier #'] || '').trim(),
    distributor: (r['Distributor'] || '').trim(),
    pkg: (r['Pkg Type'] || '').trim(),
    qty: num(r['Qty/Pkg']),
    unit: (r['Unit'] || '').trim(),
    cost: num(r['Cost']),
    costPerUnit: num(r['Cost/Unit']),
    priority: (r['Priority'] || '').trim(),
    line: (r['Product Line'] || '').trim(),
    lead: (r['Lead Time'] || '').trim(),
    shelf: (r['Shelf Life'] || '').trim(),
    moq: (r['MOQ'] || '').trim(),
    terms: (r['Terms'] || '').trim(),
    notes: (r['Notes'] || '').trim(),
  }));
}

function mergeSheet(items, skuByKey, skipped) {
  const byName = new Map(items.map((i) => [i.name, i]));
  for (const r of sheetRows()) {
    if (r.item === '1' && r.brand === 'Moisturlok') r.item = 'Moisturlok'; // sheet typo
    const vendor = r.distributor in VENDOR_ALIASES ? VENDOR_ALIASES[r.distributor] : (r.distributor || null);

    if (SKIP_ITEM.test(r.item)) { skipped.push(`${r.item} (finished good)`); continue; }
    if (!r.brand && !vendor) { skipped.push(`${r.item} (blank row)`); continue; }
    if (r.item === 'Film - Kroger' && !r.code && r.cost == null) { skipped.push(`${r.item} (placeholder, no code or price)`); continue; }

    const merge = ERP_CODE_MERGES[r.code];
    if (merge) {
      const sku = skuByKey.get(merge.sku);
      sku.item_code = r.code;
      sku.spec_note = [sku.spec_note, merge.note].filter(Boolean).join(' ');
      continue;
    }

    const packaging = r.unit === 'Each' || /^(Tray|Film|SRP)/.test(r.item);
    let item = byName.get(r.item);
    if (!item) {
      item = { name: r.item, kind: packaging ? 'packaging' : 'ingredient', notes: ITEM_NOTES[r.item] ?? null, skus: [], fromSheet: true };
      items.push(item);
      byName.set(r.item, item);
    }

    const pkg = PKG[r.pkg.toLowerCase()] ?? (r.pkg ? r.pkg.toLowerCase() : null);
    const sku = { vendor, brand: r.brand || null, item_code: r.code || null, vendor_item_code: r.vendorCode || null };
    let breaks = [];
    if (packaging) {
      sku.order_unit = r.qty ? `${pkg ?? 'unit'} (${fmtQty(r.qty)})` : (pkg ?? 'each');
      sku.units_per_order_unit = r.qty ?? null;
      sku.units_per_thousand = true;
      if (r.cost != null) breaks = [[1, r.cost]];
    } else if (r.qty) {
      sku.order_unit = `${fmtQty(r.qty)} lb ${pkg ?? 'unit'}`;
      sku.unit_weight_lbs = r.qty;
      if (r.cost != null) breaks = [[1, r.cost]];
    } else if (r.cost == null && r.costPerUnit != null) {
      // Chris's Cookie rows: only a $/lb figure on the sheet
      sku.order_unit = 'lb';
      sku.unit_weight_lbs = 1;
      breaks = [[1, r.costPerUnit]];
    } else {
      sku.order_unit = pkg ? `${pkg} (weight not on sheet)` : 'not on sheet';
      if (r.cost != null) breaks = [[1, r.cost]];
    }

    const facts = [
      r.line && `Product line: ${r.line}`,
      r.priority && `Priority: ${r.priority}`,
      r.shelf && `Shelf life ${r.shelf}`,
    ].filter(Boolean);
    if (vendor && breaks.length) {
      sku.quotes = [{
        doc_type: 'quote', doc_ref: 'Assembler ingredient sheet (undated)', status: 'active',
        moq: r.moq || null, lead_time: r.lead || null, terms: r.terms || null, notes: r.notes || null, breaks,
      }];
    } else {
      // No price, or no distributor to hang a quote on: keep the facts on the SKU.
      if (!vendor && breaks.length) facts.push(`Sheet price $${breaks[0][1]} — distributor PENDING`);
      if (r.lead) facts.push(`Lead ${r.lead}`);
      if (r.moq) facts.push(`MOQ ${r.moq}`);
      if (r.terms) facts.push(`Terms ${r.terms}`);
      if (r.notes) facts.push(r.notes);
      sku.quotes = [];
    }
    sku.spec_note = facts.join(' · ') || null;
    item.skus.push(sku);
  }
  // Single-vendor sheet items get that vendor as primary; multi-vendor ones
  // are left unstarred (the sheet doesn't pick one).
  for (const item of items) {
    if (!item.fromSheet) continue;
    const vs = [...new Set(item.skus.map((s) => s.vendor).filter(Boolean))];
    item.primary = vs.length === 1 ? vs[0] : null;
  }
}

// ── SQL emit ────────────────────────────────────────────────────────────────
const q = (v) => (v == null || v === '' ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const id = (kind, key) => `md5(${q(`${kind}:${key}`)})::uuid`;
// keep: columns the app edits — a re-run fills them only where still empty.
// insertOnly: rows the app owns after first load — a re-run never touches them.
const upsert = (table, cols, rows, { keep = [], insertOnly = false } = {}) =>
  rows.length === 0 ? '' :
  `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n` +
  rows.map((r) => `  (${r.join(', ')})`).join(',\n') +
  (insertOnly ? '\nON CONFLICT (id) DO NOTHING;\n' :
    '\nON CONFLICT (id) DO UPDATE SET\n  ' +
    cols.filter((c) => c !== 'id')
      .map((c) => (keep.includes(c) ? `${c} = COALESCE(${table}.${c}, EXCLUDED.${c})` : `${c} = EXCLUDED.${c}`)).join(', ') + ';\n');

function build() {
  const items = structuredClone(REV6_ITEMS);
  const skuByKey = new Map();
  items.forEach((i) => i.skus.forEach((s) => s.key && skuByKey.set(s.key, s)));
  const skipped = [];
  mergeSheet(items, skuByKey, skipped);

  const vendorNames = new Set(VENDORS.map((v) => v.name));
  const vrows = []; const crows = []; const irows = []; const srows = []; const qrows = []; const brows = [];
  const poNumbers = new Set(PURCHASE_ORDERS.map((p) => p.po_number));
  const porows = PURCHASE_ORDERS.map((p) => {
    if (!vendorNames.has(p.vendor)) throw new Error(`unknown PO vendor ${p.vendor}`);
    return [id('po', p.po_number), q(p.po_number), id('vendor', p.vendor), q(p.po_date), q(p.fulfillment), q(p.packing_slip_ref), q(p.ship_date), q(p.notes)];
  });
  for (const v of VENDORS) {
    vrows.push([id('vendor', v.name), q(v.name), q(v.category), q(v.status ?? 'active'), q(v.address), q(v.website), q(v.phone_main),
      q(v.account_number), q(v.fob), q(v.default_terms), q(v.freight_notes), q(v.billing_entity), q(v.notes)]);
    for (const c of v.contacts ?? []) {
      crows.push([id('contact', `${v.name}|${c.name}`), id('vendor', v.name), q(c.name), q(c.role), q(c.phone_office), q(c.phone_cell), q(c.email), q(!!c.is_primary)]);
    }
  }
  const skuKeys = new Set();
  for (const i of items) {
    if (i.primary && !vendorNames.has(i.primary)) throw new Error(`unknown primary vendor ${i.primary}`);
    irows.push([id('item', i.name), q(i.name), q(i.kind), i.primary ? id('vendor', i.primary) : 'NULL', q(i.notes)]);
    for (const s of i.skus) {
      if (s.vendor && !vendorNames.has(s.vendor)) throw new Error(`unknown vendor ${s.vendor}`);
      let skey = `${i.name}|${s.vendor ?? ''}|${s.brand ?? ''}|${s.order_unit}`;
      if (skuKeys.has(skey)) skey += `|${s.item_code ?? s.vendor_item_code}`;
      if (skuKeys.has(skey)) throw new Error(`duplicate sku key ${skey}`);
      skuKeys.add(skey);
      srows.push([id('sku', skey), id('item', i.name), s.vendor ? id('vendor', s.vendor) : 'NULL', q(s.brand), q(s.item_code), q(s.vendor_item_code),
        q(s.order_unit), q(s.unit_weight_lbs ?? null), q(s.units_per_order_unit ?? null), q(!!s.units_per_thousand), q(s.spec_note)]);
      (s.quotes ?? []).forEach((qt, n) => {
        const qkey = `${skey}|${n}`;
        if (qt.po && !poNumbers.has(qt.po)) throw new Error(`unknown PO ${qt.po} on ${skey}`);
        qrows.push([id('quote', qkey), id('sku', skey), id('vendor', s.vendor), q(qt.doc_type), q(qt.doc_ref), q(qt.doc_date), q(qt.valid_until),
          q(qt.moq), q(qt.lead_time), q(qt.terms), q(qt.one_time_costs), q(qt.status ?? 'active'), q(qt.notes), q(qt.doc?.path),
          qt.po ? id('po', qt.po) : 'NULL']);
        for (const [qty, price] of qt.breaks ?? []) {
          brows.push([id('break', `${qkey}|${qty}`), id('quote', qkey), q(qty), q(price)]);
        }
      });
    }
  }

  const header = `-- Cookie Central — Supplies seed (catalogue rev 6 + Assembler sheet)
--
-- GENERATED by scripts/build-supplies-seed.mjs — edit the script, not this file.
-- docs/SUPPLIES_SPEC.md §V1.2. Applied manually via the SQL editor AFTER
-- 20261028120000_supplies.sql (seeds live in supabase/seeds/, per ADR-019).
-- Then upload the original documents: node scripts/upload-supply-docs.mjs
--
-- Idempotent: ids are md5('<kind>:<natural key>')::uuid and every INSERT is
-- ON CONFLICT (id) DO UPDATE, so re-running refreshes in place.
--
-- Counts: ${vrows.length} vendors, ${crows.length} contacts, ${irows.length} items (${items.filter((i) => i.kind === 'ingredient').length} ingredient / ${items.filter((i) => i.kind === 'packaging').length} packaging), ${srows.length} SKUs, ${qrows.length} price points, ${brows.length} breaks.
-- Sheet rows not imported: ${skipped.join('; ')}.

BEGIN;

`;
  const sql = header +
    upsert('vendors', ['id', 'name', 'category', 'status', 'address', 'website', 'phone_main', 'account_number', 'fob', 'default_terms', 'freight_notes', 'billing_entity', 'notes'], vrows) + '\n' +
    upsert('vendor_contacts', ['id', 'vendor_id', 'name', 'role', 'phone_office', 'phone_cell', 'email', 'is_primary'], crows) + '\n' +
    upsert('supply_items', ['id', 'name', 'kind', 'primary_vendor_id', 'notes'], irows) + '\n' +
    upsert('supply_skus', ['id', 'item_id', 'vendor_id', 'brand_name', 'item_code', 'vendor_item_code', 'order_unit', 'unit_weight_lbs', 'units_per_order_unit', 'units_per_thousand', 'spec_note'], srows) + '\n' +
    upsert('supply_pos', ['id', 'po_number', 'vendor_id', 'po_date', 'fulfillment', 'packing_slip_ref', 'ship_date', 'notes'], porows, { insertOnly: true }) + '\n' +
    upsert('quotes', ['id', 'sku_id', 'vendor_id', 'doc_type', 'doc_ref', 'doc_date', 'valid_until', 'moq', 'lead_time', 'terms', 'one_time_costs', 'status', 'notes', 'doc_path', 'po_id'], qrows, { keep: ['po_id'] }) + '\n' +
    upsert('quote_breaks', ['id', 'quote_id', 'qty', 'price_per_order_qty'], brows) +
    // Items the seed used to create under another name (their SKUs and quotes cascade).
    (RETIRED_ITEMS.length ? `\nDELETE FROM supply_items WHERE id IN (${RETIRED_ITEMS.map((n) => id('item', n)).join(', ')});\n` : '') +
    '\nCOMMIT;\n';
  writeFileSync(OUT, sql);
  console.log(header.split('\n').filter((l) => l.startsWith('-- Counts') || l.startsWith('-- Sheet')).join('\n'));
}

build();
