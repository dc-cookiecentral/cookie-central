#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Builds supabase/seeds/supplies_seed.sql (docs/SUPPLIES_SPEC.md §V1.2).
//
//   node scripts/build-supplies-seed.mjs
//
// Two sources, merged:
//   1. dc-supplies catalogue rev 6 (Oct 27 2026), transcribed into the
//      gitignored scripts/supplies-data.local.mjs (see below) and checked
//      against the embedded original documents. DOCUMENTS: quotes, invoices, POs.
//   2. Marc's sheet — scripts/marc-supplies.local.xlsx (gitignored; Marc's
//      "DC - Item # by Item Supplier" tab + "Contact Info" tab, Nov 2 2026).
//      It carries the ERP item codes (116070, 120005 …) and the commodity
//      ingredients rev 6 doesn't cover. It is a RECORD, not a document: its
//      prices go in as doc_type 'reference' and its contacts as source
//      'marc_sheet', which the app shows de-emphasized so that people confirm
//      them from real quotes and POs. Where a row is the same SKU as a rev 6
//      record it lends its ERP code and, if its price adds anything, a
//      reference line on that SKU (REV6_MERGES); otherwise it becomes its own SKU.
//      Marc's sheet replaced prototype/Assembler_Ingredient_Data.csv (an older
//      copy of it); SKUs only the old sheet had are retired (LEGACY_SHEET).
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
import * as XLSX from 'xlsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, dflt) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : dflt);
// --out <file> writes elsewhere (tests, previews); default is the seed path.
const OUT = arg('--out', join(ROOT, 'supabase/seeds/supplies_seed.sql'));
const SHEET = arg('--sheet', join(ROOT, 'scripts/marc-supplies.local.xlsx'));
if (!existsSync(SHEET)) {
  console.error(`Missing ${SHEET} — Marc's item-by-supplier sheet (local only: it carries contacts and pricing). See the header of this script.`);
  process.exit(1);
}
const REF_LABEL = 'Marc’s sheet';

// ── rev 6 data (local only) ─────────────────────────────────────────────────
// VENDORS (with contacts) and REV6_ITEMS (skus → quotes → breaks) live in
// scripts/supplies-data.local.mjs, which is gitignored: this repo is public and
// those records carry contacts, account numbers and negotiated pricing. Get
// the file from the dc-supplies maintainer (or rebuild it from the catalogue).
const DATA = arg('--data', join(ROOT, 'scripts/supplies-data.local.mjs'));
if (!existsSync(DATA)) {
  console.error(`Missing ${DATA} — the local-only rev 6 vendor data. See the header of this script.`);
  process.exit(1);
}
// DOCUMENTS (optional): library-only files — renderings, drawings, spec
// sheets, and documents whose item isn't clear yet. { path, title, kind,
// vendor?, date?, notes?, items: [item names] } — items [] = unassigned.
// `local` (optional) is the file on this Mac that upload-supply-docs.mjs
// --local uploads to `path`; quotes' `doc` objects can carry `local` too.
// DOC_RETITLES (optional): [{ path, from, title, notes? }] — one-off retitle of
// a library document (e.g. a draft marked superseded), applied only while its
// title is still `from`, so a title changed in the app is never overwritten.
const { VENDORS, REV6_ITEMS, PURCHASE_ORDERS = [], RETIRED_ITEMS = [], DOCUMENTS = [], DOC_RETITLES = [] } = await import(pathToFileURL(DATA).href);

// ── Marc's sheet → items ────────────────────────────────────────────────────
const VENDOR_ALIASES = {
  "Chris's Cookie": "Chris's Cookies",
  'Great River Plastic': 'Great River Plastics',
  'Great Rivers Plastic': 'Great River Plastics',
  'Fresh Coast Bakery': 'Fresh Coast Baking',
  'See Fresh Coast Bakery': 'Fresh Coast Baking',
  Moisturlok: 'Anderson Advanced Ingredients', // MoisturLOK's maker
  McCormick: 'McCormick & Co.',
  GNT: 'GNT USA (Exberry)',
  'S. Holland Baking Supply': 'SH Bakery Supply',
  'ICI Foods / Batory': 'Batory Foods',
  Salina: 'Solina', // "Sokol (Salina)" — Solina on the Contact Info tab
  PENDING: null,
};
// Distributors on Marc's sheet with no vendor record yet are created from it,
// so they carry no documents until someone files one.
const NEW_VENDOR_NOTE = `Recorded on ${REF_LABEL} (Nov 2 ’26) — no quote, invoice or PO on file yet.`;
// Rows that are the same SKU as a rev 6 (document-backed) record: they lend
// their ERP code, and their price as a reference line — unless a document on
// that SKU already states the same price, which the line would only repeat.
const REV6_MERGES = {
  '111003': { item: 'Moisturlok', vendor: 'Anderson Advanced Ingredients' },
  '111012': { item: 'Black Currant Flavor #FG0410', vendor: 'McCormick & Co.' },
  '111013': { item: 'Exberry Purple Plum Powder (colorant)', vendor: 'GNT USA (Exberry)' },
  '112006': { item: 'Novation Prima 340 (functional starch)', vendor: 'Batory Foods' },
  '112007': { item: 'Xtra Soft #50 (dough softener)', vendor: 'SH Bakery Supply' },
  '120006': { item: 'SUP Pouch — Black Currant', vendor: 'LallyPak' },
  '120007': { item: 'Master Case — Black Currant', vendor: 'Green Bay Packaging' },
  '123002': { item: 'SRP Case — 8-CT', vendor: 'Green Bay Packaging' },
};
// Finished goods, not supplies (the old sheet's "DC Classic Frozen Dough …"
// rows are Marc's "… Finished Case" rows).
const SKIP_ITEM = /^DC Classic Frozen Dough|F(i)?nished Case$/;
// rev 6 flowwrap-film gap, attached to the matching sheet film items.
const RF_FILM_NOTE = (runout) =>
  `Flowwrap film, 9″ repeat × 15.75″ web (die-line on file). Runout ${runout}. Catalogue rev 6: NO dated LallyPak film quote on file — the sheet price below is a record, not a quote; request a per-SKU film quote (lead time back-plans the reorder PO).`;
// The sheet splits these by chip count (1000ct / 4000ct = chips per lb). They
// are one ingredient each: merged, with the count carried on each SKU's order
// unit, so every vendor and size sits side by side on $/lb. Each SKU keeps the
// id it had under its sheet name (`idKey`), so its quotes, breaks and PO links
// move to the merged item in place; the emptied sheet items are then deleted.
const ITEM_MERGES = {
  'White Chocolate Chips 1000ct': { into: 'White Chocolate Chips', count: '1K ct' },
  'White Chocolate Chips 4000ct': { into: 'White Chocolate Chips', count: '4K ct' },
  'Peanut Butter Chips 1000ct': { into: 'Peanut Butter Chips', count: '1K ct' },
  'Peanut Butter Chips 4000ct': { into: 'Peanut Butter Chips', count: '4K ct' },
  // Marc's "Tray" (Five Star Packaging, ERP 120001, "Tray (OSP) - Kroger") is
  // the Walmart 4-pk dough-puck tray — Caroline, Nov 13 2026. No count: the
  // order unit stays as it is.
  'Tray': { into: 'Plastic Tray — 3.0 Dough Pucks (4-pk WMT)' },
};
// ── packaging names + tags (Caroline, Nov 13 2026) ──────────────────────────
// Display names follow  Type · Private label (if any) · Product.  The item
// keeps its ORIGINAL name as its key inside this script (ids, SKU keys, Marc's
// sheet matching, the local data file all use it) — only the `name` column
// written to the database changes, so prices, POs and documents stay attached.
// Private label goes in the name; a Dirty Cookie branded item has none.
const ITEM_RENAMES = {
  'Film - Kroger WCCB': 'Flowwrap · Kroger · WCCB',
  'Film - Walmart CCF': 'Flowwrap · Walmart · CCF',
  'Film - Walmart PBJ': 'Flowwrap · Walmart · PBJ',
  'Film - Walmart WCCB': 'Flowwrap · Walmart · WCCB',
  'SUP Pouch — Black Currant': 'Pouch · Walmart · Black Currant',
  'Master Case — Black Currant': 'Secondary Packaging - Mastercase · Walmart · Black Currant',
  'Plastic Tray — 3.0 Dough Pucks (4-pk WMT)': 'Tray · 3.0 Dough Pucks 4-pk',
  'PT206 — Cookie Pie Tray': 'Tray · Cookie Pie (PT206)',
  'SRP Case — 8-CT': 'Secondary Packaging - SRP 8 pack',
  'SRP - 12 CT': 'Secondary Packaging - SRP 12 pack',
};
// Where an item is used, for the Supplies tab's filter. A shared item carries
// every program it serves (the clear tray and the SRP cases: Walmart + Kroger).
const ITEM_TAGS = {
  'Film - Kroger WCCB': ['Kroger'],
  'Film - Walmart CCF': ['Walmart'],
  'Film - Walmart PBJ': ['Walmart'],
  'Film - Walmart WCCB': ['Walmart'],
  'SUP Pouch — Black Currant': ['Walmart'],
  'Master Case — Black Currant': ['Walmart'],
  'Plastic Tray — 3.0 Dough Pucks (4-pk WMT)': ['Walmart', 'Kroger'],
  'SRP Case — 8-CT': ['Walmart', 'Kroger'],
  'SRP - 12 CT': ['Walmart', 'Kroger'],
};
// Private-label brand, put at the front of the item's notes.
const BETTERGOODS = 'Brand: bettergoods (Walmart private label).';
const ITEM_BRAND = {
  'Film - Walmart CCF': BETTERGOODS,
  'Film - Walmart PBJ': BETTERGOODS,
  'Film - Walmart WCCB': BETTERGOODS,
  'SUP Pouch — Black Currant': BETTERGOODS,
  'Master Case — Black Currant': BETTERGOODS,
};
const displayName = (n) => ITEM_RENAMES[n] ?? n;
// Documents in the local data file may name an item by either name.
const KEY_BY_DISPLAY = Object.fromEntries(Object.entries(ITEM_RENAMES).map(([k, v]) => [v, k]));
const itemKey = (n) => KEY_BY_DISPLAY[n] ?? n;
const sqlTags = (t) => (t?.length ? `ARRAY[${t.map(q).join(', ')}]::text[]` : `'{}'::text[]`);

const MERGED_NOTE = 'Merged from the Assembler sheet’s 1000ct and 4000ct items (Nov 2 ’26). 1K / 4K is the chip count per lb, shown on each SKU’s order unit — compare on $/lb.';
const ITEM_NOTES = {
  'Film - Walmart CCF': RF_FILM_NOTE('Dec 8 ’26'),
  'Film - Walmart WCCB': RF_FILM_NOTE('Dec 21 ’26'),
  'Film - Walmart PBJ': RF_FILM_NOTE('Oct ’27'),
  'White Chocolate Chips': MERGED_NOTE,
  'Peanut Butter Chips': MERGED_NOTE,
};

const num = (s) => {
  const v = parseFloat(String(s ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(v) ? v : null;
};
const fmtQty = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 100) / 100));
const PKG = { bags: 'bag', bag: 'bag', box: 'box', case: 'case', pail: 'pail', bib: 'BIB', pet: 'PET jug', roll: 'roll', pallet: 'pallet', drum: 'drum' };
const text = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

// Read a tab as objects, mapping headers by prefix (Marc's headers carry line
// breaks: "Pckg Type Case/\nBIB/\nBags"). First matching prefix wins, so the
// longer one is listed first ("supplier number" before "supplier").
function readTab(wb, tab, cols) {
  const ws = wb.Sheets[tab];
  if (!ws) throw new Error(`${SHEET}: no "${tab}" tab`);
  const [head, ...rows] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
  const field = head.map((h) => cols.find(([p]) => text(h).toLowerCase().startsWith(p))?.[1] ?? null);
  for (const [, f] of cols) if (!field.includes(f)) throw new Error(`${SHEET} "${tab}": no column for ${f}`);
  return rows.map((r) => Object.fromEntries(field.map((f, i) => [f, r[i]]).filter(([f]) => f)));
}

const ITEM_TAB = 'DC - Item # by Item Supplier-D';
const ITEM_COLS = [
  ['dc item', 'code'], ['ingredient', 'item'], ['supplier number', 'vendorCode'], ['supplier', 'brand'], ['distributor', 'distributor'],
  ['pckg type', 'pkg'], ['qty per', 'qty'], ['unit of measure', 'unit'], ['cost per pound', 'costPerUnit'], ['cost', 'cost'],
  ['product line', 'line'], ['lead', 'lead'], ['shelf', 'shelf'], ['moq', 'moq'], ['terms', 'terms'], ['comments', 'notes'],
];
const CONTACT_TAB = 'Contact Info';
const CONTACT_COLS = [['distributor', 'distributor'], ['contact name', 'name'], ['phone', 'phone'], ['email', 'email']];

const workbook = XLSX.read(readFileSync(SHEET));

function sheetRows() {
  return readTab(workbook, ITEM_TAB, ITEM_COLS)
    .map((r) => ({
      ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, text(v)])),
      qty: num(r.qty), cost: num(r.cost), costPerUnit: num(r.costPerUnit),
    }))
    .filter((r) => r.item);
}

// $ per lb (ingredient) or per piece (packaging) a break works out to on a SKU.
const perBase = (sku, [qty, price]) => price / (qty * (sku.unit_weight_lbs ?? sku.units_per_order_unit ?? 1));

// A row that is a rev 6 SKU: lend the ERP code and, if it says something new,
// Marc's price as a reference line (its own `ref` quote key, so later rev 6
// quotes don't shift its id).
function lendToRev6(sku, r, skipped) {
  if (r.code) {
    if (sku.item_code && sku.item_code === r.vendorCode && !sku.vendor_item_code) {
      sku.vendor_item_code = sku.item_code; // rev 6 had filed the vendor's code as ours
      sku.item_code = null;
    }
    sku.item_code ??= r.code;
  }
  if (r.cost == null || !r.qty) return;
  const per = sku.unit_weight_lbs ?? sku.units_per_order_unit ?? 1;
  let qty = r.qty / per;
  if (Math.abs(qty - Math.round(qty)) <= 0.02 * Math.max(1, qty)) qty = Math.round(qty); // 55 lb vs 25 kg bag
  const brk = [qty, r.cost];
  const unit = perBase(sku, brk);
  const docs = (sku.quotes ?? []).flatMap((qt) => qt.breaks ?? []);
  if (docs.some((b) => Math.abs(perBase(sku, b) - unit) <= 0.005 * unit)) {
    skipped.push(`${r.item} price (same as the document on file)`);
    return;
  }
  sku.quotes = [...(sku.quotes ?? []), {
    keySuffix: 'ref', doc_type: 'reference', doc_ref: REF_LABEL, status: null,
    moq: r.moq || null, lead_time: r.lead || null, terms: r.terms || null, notes: r.notes || null, breaks: [brk],
  }];
}

function mergeSheet(items, vendors, skipped) {
  const byName = new Map(items.map((i) => [i.name, i]));
  const vendorNames = new Set(vendors.map((v) => v.name));
  for (const r of sheetRows()) {
    const sheetItem = r.item;
    const merged = ITEM_MERGES[sheetItem];
    if (merged) r.item = merged.into;
    const vendor = r.distributor in VENDOR_ALIASES ? VENDOR_ALIASES[r.distributor] : (r.distributor || null);

    if (SKIP_ITEM.test(r.item)) { skipped.push(`${r.item} (finished good)`); continue; }
    if (!r.brand && !vendor) { skipped.push(`${r.item} (blank row)`); continue; }

    const packaging = r.unit.toLowerCase() === 'each' || /^(Tray|Film|SRP|Pouch)/.test(r.item);
    const rev6 = REV6_MERGES[r.code];
    if (rev6) {
      const sku = byName.get(rev6.item)?.skus.find((s) => s.vendor === rev6.vendor);
      if (!sku) throw new Error(`REV6_MERGES ${r.code}: no rev 6 SKU ${rev6.item} / ${rev6.vendor}`);
      lendToRev6(sku, r, skipped);
      continue;
    }
    if (vendor && !vendorNames.has(vendor)) {
      vendors.push({ name: vendor, category: packaging ? 'packaging' : 'raw', notes: NEW_VENDOR_NOTE, contacts: [] });
      vendorNames.add(vendor);
    }

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
      // only a $/lb figure on the sheet
      sku.order_unit = 'lb';
      sku.unit_weight_lbs = 1;
      breaks = [[1, r.costPerUnit]];
    } else {
      sku.order_unit = pkg ? `${pkg} (weight not on sheet)` : 'not on sheet';
      if (r.cost != null) breaks = [[1, r.cost]];
    }
    if (merged) {
      sku.idKey = `${sheetItem}|${vendor ?? ''}|${sku.brand ?? ''}|${sku.order_unit}`;
      if (merged.count) sku.order_unit = `${sku.order_unit} · ${merged.count}`;
    }

    const facts = [
      r.line && `Product line: ${r.line}`,
      r.shelf && `Shelf life ${r.shelf}`,
    ].filter(Boolean);
    if (vendor && breaks.length) {
      sku.quotes = [{
        doc_type: 'reference', doc_ref: REF_LABEL, status: null,
        moq: r.moq || null, lead_time: r.lead || null, terms: r.terms || null, notes: r.notes || null, breaks,
      }];
    } else {
      // No price, or no distributor to hang a price on: keep the facts on the SKU.
      if (!vendor && breaks.length) facts.push(`${REF_LABEL} price $${breaks[0][1]} — distributor not on the sheet`);
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

// Marc's Contact Info tab → contacts, source 'marc_sheet'. Skipped where the
// vendor already has that person from a document (same surname or email).
// Primary only if the vendor has no contact at all.
function mergeContacts(vendors, skipped) {
  const byName = new Map(vendors.map((v) => [v.name, v]));
  const surname = (n) => text(n).split(' ').pop().toLowerCase().replace(/[^a-z]/g, '');
  for (const raw of readTab(workbook, CONTACT_TAB, CONTACT_COLS)) {
    const c = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, text(v)]));
    if (!c.name || !c.distributor) continue;
    const vname = c.distributor in VENDOR_ALIASES ? VENDOR_ALIASES[c.distributor] : c.distributor;
    let v = byName.get(vname);
    if (!v) {
      v = { name: vname, category: 'raw', notes: NEW_VENDOR_NOTE, contacts: [] };
      vendors.push(v);
      byName.set(vname, v);
    }
    v.contacts ??= [];
    const dup = v.contacts.find((x) => surname(x.name) === surname(c.name) || (x.email && c.email && x.email.toLowerCase() === c.email.toLowerCase()));
    if (dup) { skipped.push(`contact ${c.name} (${vname} — already on file as ${dup.name})`); continue; }
    v.contacts.push({ name: c.name, phone_office: c.phone || null, email: c.email || null, is_primary: v.contacts.length === 0, source: 'marc_sheet' });
  }
}

// ── SQL emit ────────────────────────────────────────────────────────────────
const q = (v) => (v == null || v === '' ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const id = (kind, key) => `md5(${q(`${kind}:${key}`)})::uuid`;
// keep: columns the app edits — a re-run fills them only where still empty.
// insertOnly: rows the app owns after first load — a re-run never touches them.
// guarded: the table has app_edited_at (20261113130000) — a row edited in the
//   app is never updated by the seed, so app edits can't be silently reverted.
const GUARDED = new Set(['vendors', 'vendor_contacts', 'supply_items', 'supply_skus', 'quotes']);
const upsert = (table, cols, rows, { keep = [], insertOnly = false } = {}) =>
  rows.length === 0 ? '' :
  `INSERT INTO ${table} (${cols.join(', ')}) VALUES\n` +
  rows.map((r) => `  (${r.join(', ')})`).join(',\n') +
  (insertOnly ? '\nON CONFLICT (id) DO NOTHING;\n' :
    '\nON CONFLICT (id) DO UPDATE SET\n  ' +
    cols.filter((c) => c !== 'id')
      .map((c) => (keep.includes(c) ? `${c} = COALESCE(${table}.${c}, EXCLUDED.${c})` : `${c} = EXCLUDED.${c}`)).join(', ') +
    (GUARDED.has(table) ? `\n  WHERE ${table}.app_edited_at IS NULL` : '') + ';\n');

// Breaks belong to their quote: a quote edited in the app keeps the breaks the
// app gave it — the seed neither adds, updates nor deletes them.
const breaksSql = (rows) =>
  rows.length === 0 ? '' :
  'INSERT INTO quote_breaks (id, quote_id, qty, price_per_order_qty)\nSELECT v.id, v.quote_id, v.qty, v.price FROM (VALUES\n' +
  rows.map((r) => `  (${r[0]}, ${r[1]}, ${r[2]}::numeric, ${r[3]}::numeric)`).join(',\n') +
  '\n) AS v(id, quote_id, qty, price)\nWHERE NOT EXISTS (SELECT 1 FROM quotes q WHERE q.id = v.quote_id AND q.app_edited_at IS NOT NULL)\n' +
  'ON CONFLICT (id) DO UPDATE SET quote_id = EXCLUDED.quote_id, qty = EXCLUDED.qty, price_per_order_qty = EXCLUDED.price_per_order_qty;\n';

// ITEM_MERGES: the SKU upsert has already re-pointed every SKU to the merged
// item, so the old sheet items are empty. Carry an assumed cost typed on one of
// them over (only if the merged item has none; 1000ct before 4000ct), then
// delete them. A no-op on re-runs.
function mergedItemsSql() {
  const byTarget = new Map();
  for (const [from, { into }] of Object.entries(ITEM_MERGES)) byTarget.set(into, [...(byTarget.get(into) ?? []), from]);
  let sql = '\n-- Merged items (ITEM_MERGES)\n';
  for (const [into, froms] of byTarget) {
    const olds = froms.map((n) => id('item', n)).join(', ');
    sql += `UPDATE supply_items SET assumed_cost = (SELECT o.assumed_cost FROM supply_items o WHERE o.id IN (${olds}) AND o.assumed_cost IS NOT NULL ORDER BY o.name LIMIT 1)\n` +
      `  WHERE id = ${id('item', into)} AND assumed_cost IS NULL;\n` +
      `DELETE FROM supply_items WHERE id IN (${olds}) AND NOT EXISTS (SELECT 1 FROM supply_skus s WHERE s.item_id = supply_items.id);\n`;
  }
  return sql;
}

// Assembler-sheet rows that Marc's sheet (which replaced it, Nov 2 '26) no
// longer has, or has under a different key (pack size, distributor). Natural
// keys as the old seed built them; legacySheetSql() deletes these ids unless a
// PO is linked or an assumed cost was typed. Frozen: never add to this list.
const LEGACY_SHEET = {
  item: [
    "Hazelnut",
    "Homemade Cookie Butter"
  ],
  sku: [
    "Butter, Unsalted|St Charles Trading Co|Brand ?  80%|50 lb box",
    "Citric Acid|Chris's Cookies|Chris's Cookie|lb",
    "Film - Walmart CCF|LallyPak|LallyPak|roll (3,500)",
    "Film - Walmart PBJ|LallyPak|LallyPak|roll (3,500)",
    "Film - Walmart WCCB|LallyPak|LallyPak|roll (3,500)",
    "Flour|St Charles Trading Co|General Mills All-purpose - H & R|50 lb bag",
    "Fudge Filling|IRCA||not on sheet",
    "Fudge Filling|Solina|Sokol (Solina)|50 lb pail",
    "Fudge Filling|St Charles Trading Co|I. Rice & Co. - Premium|60 lb case",
    "Fudge Filling|St Charles Trading Co|I. Rice & Co. - Sundae Supreme|47.63 lb case",
    "GMO Free Canola Oil|Chris's Cookies|Chris's Cookie|lb",
    "GMO Free Palm Shortening|Chris's Cookies|Chris's Cookie|lb",
    "Grape Jelly|Smucker's|Smucker's|42 lb case",
    "Grape Jelly|St Charles Trading Co|Smucker's|42 lb case",
    "Hazelnut|IRCA|IRCA|22.05 lb pail",
    "Homemade Cookie Butter|Assemblers LLC|Assemblers LLC|50 lb bag",
    "Homemade Cookie Butter|Chris's Cookies|Chris's Cookie|45 lb pail",
    "Margarine Trans Free|Badger Murphy|Bunge - 500|50 lb box",
    "Marshmellow Fluff - RTU|IRCA|Sweet Solutions|30 lb pail",
    "Marshmellow Fluff|IRCA|Sweet Solutions|30 lb pail",
    "Moisturlok|St Charles Trading Co|Moisturlok|55 lb pail",
    "Moisturlok||Moisturlok|55 lb pail",
    "Semi-Sweet Chocolate Chips 1000ct|Barchemy|Bachemy - SSC1|25 lb box",
    "Sunflower Lecithin|Chris's Cookies|Chris's Cookie|lb",
    "White Chocolate Chips 4000ct|Barchemy|Bachemy - WCC4|25 lb box",
    "White Chocolate Chips 4000ct|National Cortina|Cacao - WCC4|50 lb box"
  ],
  quote: [
    "Butter, Unsalted|St Charles Trading Co|Brand ?  80%|50 lb box|0",
    "Citric Acid|Chris's Cookies|Chris's Cookie|lb|0",
    "Film - Walmart CCF|LallyPak|LallyPak|roll (3,500)|0",
    "Film - Walmart PBJ|LallyPak|LallyPak|roll (3,500)|0",
    "Film - Walmart WCCB|LallyPak|LallyPak|roll (3,500)|0",
    "Flour|St Charles Trading Co|Ardent Mills - RTE Cake Flour|50 lb bag|0",
    "Flour|St Charles Trading Co|General Mills All-purpose - H & R|50 lb bag|0",
    "Fudge Filling|Solina|Sokol (Solina)|50 lb pail|0",
    "Fudge Filling|St Charles Trading Co|I. Rice & Co. - Premium|60 lb case|0",
    "Fudge Filling|St Charles Trading Co|I. Rice & Co. - Sundae Supreme|47.63 lb case|0",
    "GMO Free Canola Oil|Chris's Cookies|Chris's Cookie|lb|0",
    "GMO Free Palm Shortening|Chris's Cookies|Chris's Cookie|lb|0",
    "Granulated Sugar|Dawn Foods|Western Sugar|bag (weight not on sheet)|0",
    "Grape Jelly|Smucker's|Smucker's|42 lb case|0",
    "Grape Jelly|St Charles Trading Co|Smucker's|42 lb case|0",
    "Hazelnut|IRCA|IRCA|22.05 lb pail|0",
    "Homemade Cookie Butter|Chris's Cookies|Chris's Cookie|45 lb pail|0",
    "Margarine Trans Free|Badger Murphy|Bunge - 500|50 lb box|0",
    "Margarine Trans Free|St Charles Trading Co|Bunge - 578 - SC|50 lb box|0",
    "Marshmellow Fluff - RTU|IRCA|Sweet Solutions|30 lb pail|0",
    "Marshmellow Fluff|IRCA|Sweet Solutions|30 lb pail|0",
    "Moisturlok|St Charles Trading Co|Moisturlok|55 lb pail|0",
    "Semi-Sweet Chocolate Chips 1000ct|Barchemy|Bachemy - SSC1|25 lb box|0",
    "Sunflower Lecithin|Chris's Cookies|Chris's Cookie|lb|0",
    "White Chocolate Chips 4000ct|National Cortina|Cacao - WCC4|50 lb box|0",
    "Whole Milk, Powdered|St Charles Trading Co|Carlyn Dairy Products Inc|50 lb bag|0"
  ]
};

// Quotes go unless a PO is linked; SKUs unless one of their quotes is; items
// only once empty and with no assumed cost typed. Ids the seed still emits are
// never touched. A no-op on re-runs.
function legacySheetSql(emitted) {
  const ids = (kind, keys) => keys.map((k) => id(kind, k)).filter((x) => !emitted.has(x));
  const list = (xs) => xs.join(',\n  ');
  const [items, skus, quotes] = [ids('item', LEGACY_SHEET.item), ids('sku', LEGACY_SHEET.sku), ids('quote', LEGACY_SHEET.quote)];
  return '\n-- Assembler-sheet rows Marc’s sheet replaced (LEGACY_SHEET)\n' +
    (quotes.length ? `DELETE FROM quotes WHERE po_id IS NULL AND id IN (\n  ${list(quotes)});\n` : '') +
    (skus.length ? `DELETE FROM supply_skus s WHERE NOT EXISTS (SELECT 1 FROM quotes q WHERE q.sku_id = s.id AND q.po_id IS NOT NULL) AND id IN (\n  ${list(skus)});\n` : '') +
    (items.length ? `DELETE FROM supply_items i WHERE assumed_cost IS NULL AND NOT EXISTS (SELECT 1 FROM supply_skus s WHERE s.item_id = i.id) AND id IN (\n  ${list(items)});\n` : '');
}

// A corrected quantity gets a new break id (ids include the qty), so the old
// break would linger and double the line total. Delete breaks on SEEDED quotes
// that the seed no longer emits. App-created quotes are never touched.
function staleBreaksSql(qrows, brows) {
  if (!qrows.length) return '';
  return '\n-- Breaks on seeded quotes that the seed no longer emits (corrected quantities)\n' +
    `DELETE FROM quote_breaks WHERE quote_id IN (\n  ${qrows.map((r) => r[0]).join(',\n  ')})\n` +
    `  AND id NOT IN (\n  ${brows.map((r) => r[0]).join(',\n  ')})\n` +
    '  AND quote_id NOT IN (SELECT id FROM quotes WHERE app_edited_at IS NOT NULL);\n';
}

// Library rows are INSERT-ONLY, keyed by file path: once a document exists,
// its title, type and item assignments belong to the app (someone may have
// reassigned it), so a re-run never changes them. Item links are created only
// together with a newly inserted document.
function librarySql(lib) {
  if (!lib.size) return '';
  let sql = '\n-- Document library (supply_documents) — insert-only; links only for new rows\n';
  for (const [path, d] of lib) {
    const links = d.items.map((n) => `(${id('item', n)})`).join(', ');
    sql += `WITH ins AS (\n  INSERT INTO supply_documents (doc_path, title, doc_kind, vendor_id, doc_date, notes)\n` +
      `  VALUES (${q(path)}, ${q(d.title)}, ${q(d.kind)}, ${d.vendor ? id('vendor', d.vendor) : 'NULL'}, ${q(d.date)}, ${q(d.notes)})\n` +
      `  ON CONFLICT (doc_path) DO NOTHING RETURNING id)\n` +
      (links
        ? `INSERT INTO supply_document_items (document_id, item_id) SELECT ins.id, x.item_id FROM ins, (VALUES ${links}) AS x(item_id) ON CONFLICT (document_id, item_id) DO NOTHING;\n`
        : 'SELECT count(*) FROM ins;\n');
  }
  return sql;
}

function retitlesSql() {
  if (!DOC_RETITLES.length) return '';
  return '\n-- Library retitles (only while the title is unchanged)\n' + DOC_RETITLES.map((r) =>
    `UPDATE supply_documents SET title = ${q(r.title)}${r.notes ? `, notes = ${q(r.notes)}` : ''} WHERE doc_path = ${q(r.path)} AND title = ${q(r.from)};\n`).join('');
}

function build() {
  const items = structuredClone(REV6_ITEMS);
  const vendors = structuredClone(VENDORS);
  const skipped = [];
  mergeSheet(items, vendors, skipped);
  mergeContacts(vendors, skipped);

  const vendorNames = new Set(vendors.map((v) => v.name));
  const vrows = []; const crows = []; const irows = []; const srows = []; const qrows = []; const brows = [];
  const poNumbers = new Set(PURCHASE_ORDERS.map((p) => p.po_number));
  const porows = PURCHASE_ORDERS.map((p) => {
    if (!vendorNames.has(p.vendor)) throw new Error(`unknown PO vendor ${p.vendor}`);
    return [id('po', p.po_number), q(p.po_number), id('vendor', p.vendor), q(p.po_date), q(p.fulfillment), q(p.packing_slip_ref), q(p.ship_date), q(p.freight_cost ?? null), q(p.notes)];
  });
  for (const v of vendors) {
    vrows.push([id('vendor', v.name), q(v.name), q(v.category), q(v.status ?? 'active'), q(v.address), q(v.website), q(v.phone_main),
      q(v.account_number), q(v.fob), q(v.default_terms), q(v.freight_notes), q(v.billing_entity), q(v.notes)]);
    for (const c of v.contacts ?? []) {
      crows.push([id('contact', `${v.name}|${c.name}`), id('vendor', v.name), q(c.name), q(c.role), q(c.phone_office), q(c.phone_cell), q(c.email), q(!!c.is_primary), q(c.source ?? null)]);
    }
  }
  // Library documents (supply_documents), keyed by file path. A file several
  // price lines open is one document assigned to each of their items.
  const lib = new Map();
  const libDoc = (path, d) => {
    const cur = lib.get(path);
    if (cur) {
      d.items.forEach((n) => { if (!cur.items.includes(n)) cur.items.push(n); });
      if (d.date && (!cur.date || d.date < cur.date)) Object.assign(cur, { date: d.date, title: d.title, kind: d.kind });
      return;
    }
    lib.set(path, { ...d, items: [...d.items] });
  };
  const skuKeys = new Set();
  for (const i of items) {
    if (i.primary && !vendorNames.has(i.primary)) throw new Error(`unknown primary vendor ${i.primary}`);
    const notes = ITEM_BRAND[i.name] ? [ITEM_BRAND[i.name], i.notes].filter(Boolean).join(' ') : i.notes;
    irows.push([id('item', i.name), q(displayName(i.name)), q(i.kind), i.primary ? id('vendor', i.primary) : 'NULL', q(notes), sqlTags(ITEM_TAGS[i.name])]);
    for (const s of i.skus) {
      if (s.vendor && !vendorNames.has(s.vendor)) throw new Error(`unknown vendor ${s.vendor}`);
      let skey = s.idKey ?? `${i.name}|${s.vendor ?? ''}|${s.brand ?? ''}|${s.order_unit}`;
      if (skuKeys.has(skey)) skey += `|${s.item_code ?? s.vendor_item_code}`;
      if (skuKeys.has(skey)) throw new Error(`duplicate sku key ${skey}`);
      skuKeys.add(skey);
      srows.push([id('sku', skey), id('item', i.name), s.vendor ? id('vendor', s.vendor) : 'NULL', q(s.brand), q(s.item_code), q(s.vendor_item_code),
        q(s.order_unit), q(s.unit_weight_lbs ?? null), q(s.units_per_order_unit ?? null), q(!!s.units_per_thousand), q(s.spec_note)]);
      (s.quotes ?? []).forEach((qt, n) => {
        const qkey = `${skey}|${qt.keySuffix ?? n}`;
        if (qt.po && !poNumbers.has(qt.po)) throw new Error(`unknown PO ${qt.po} on ${skey}`);
        qrows.push([id('quote', qkey), id('sku', skey), id('vendor', s.vendor), q(qt.doc_type), q(qt.doc_ref), q(qt.doc_date), q(qt.valid_until),
          q(qt.moq), q(qt.lead_time), q(qt.terms), q(qt.one_time_costs), q('status' in qt ? qt.status : 'active'), q(qt.notes), q(qt.doc?.path),
          qt.po ? id('po', qt.po) : 'NULL']);
        for (const [qty, price] of qt.breaks ?? []) {
          brows.push([id('break', `${qkey}|${qty}`), id('quote', qkey), q(qty), q(price)]);
        }
        if (qt.doc?.path) {
          libDoc(qt.doc.path, {
            title: qt.doc.title ?? qt.doc_ref ?? qt.doc_type,
            kind: qt.doc.kind ?? (/_ps-/.test(qt.doc.path) ? 'packing_slip' : { po: 'po', invoice: 'invoice', quote: 'quote', verbal: 'quote' }[qt.doc_type] ?? 'other'),
            vendor: s.vendor, date: qt.doc_date, items: [i.name],
          });
        }
      });
    }
  }

  const itemNames = new Set(items.map((i) => i.name));
  for (const d of DOCUMENTS) {
    if (d.vendor && !vendorNames.has(d.vendor)) throw new Error(`unknown vendor ${d.vendor} on document ${d.path}`);
    d.items = (d.items ?? []).map(itemKey);
    for (const n of d.items) if (!itemNames.has(n)) throw new Error(`unknown item ${n} on document ${d.path}`);
    if (!['rendering', 'spec', 'quote', 'po', 'invoice', 'packing_slip', 'coa', 'other'].includes(d.kind)) throw new Error(`bad kind ${d.kind} on ${d.path}`);
    libDoc(d.path, { title: d.title, kind: d.kind, vendor: d.vendor, date: d.date, notes: d.notes, items: d.items ?? [] });
  }
  const unassignedDocs = [...lib.values()].filter((d) => !d.items.length).length;

  const header = `-- Cookie Central — Supplies seed (catalogue rev 6 + Marc’s sheet)
--
-- GENERATED by scripts/build-supplies-seed.mjs — edit the script, not this file.
-- docs/SUPPLIES_SPEC.md §V1.2. Applied manually via the SQL editor AFTER the
-- supplies migrations through 20261113130000_supplies_app_edited.sql (seeds live
-- in supabase/seeds/, per ADR-019). One transaction: any error rolls it all back.
-- Rows edited in the app (app_edited_at set) are never updated, nor the breaks
-- of an app-edited quote; documents and POs are insert-only.
-- Then upload the original documents: node scripts/upload-supply-docs.mjs
--
-- Idempotent: ids are md5('<kind>:<natural key>')::uuid and every INSERT is
-- ON CONFLICT (id) DO UPDATE, so re-running refreshes in place.
--
-- Counts: ${vrows.length} vendors, ${crows.length} contacts, ${irows.length} items (${items.filter((i) => i.kind === 'ingredient').length} ingredient / ${items.filter((i) => i.kind === 'packaging').length} packaging), ${srows.length} SKUs, ${qrows.length} price points, ${brows.length} breaks, ${lib.size} library documents (${unassignedDocs} unassigned).
-- Not imported / skipped: ${skipped.join('; ')}.

BEGIN;

`;
  const sql = header +
    upsert('vendors', ['id', 'name', 'category', 'status', 'address', 'website', 'phone_main', 'account_number', 'fob', 'default_terms', 'freight_notes', 'billing_entity', 'notes'], vrows) + '\n' +
    upsert('vendor_contacts', ['id', 'vendor_id', 'name', 'role', 'phone_office', 'phone_cell', 'email', 'is_primary', 'source'], crows) + '\n' +
    upsert('supply_items', ['id', 'name', 'kind', 'primary_vendor_id', 'notes', 'tags'], irows) + '\n' +
    upsert('supply_skus', ['id', 'item_id', 'vendor_id', 'brand_name', 'item_code', 'vendor_item_code', 'order_unit', 'unit_weight_lbs', 'units_per_order_unit', 'units_per_thousand', 'spec_note'], srows) + '\n' +
    upsert('supply_pos', ['id', 'po_number', 'vendor_id', 'po_date', 'fulfillment', 'packing_slip_ref', 'ship_date', 'freight_cost', 'notes'], porows, { insertOnly: true }) + '\n' +
    upsert('quotes', ['id', 'sku_id', 'vendor_id', 'doc_type', 'doc_ref', 'doc_date', 'valid_until', 'moq', 'lead_time', 'terms', 'one_time_costs', 'status', 'notes', 'doc_path', 'po_id'], qrows, { keep: ['po_id'] }) + '\n' +
    breaksSql(brows) +
    staleBreaksSql(qrows, brows) +
    librarySql(lib) +
    retitlesSql() +
    mergedItemsSql() +
    legacySheetSql(new Set([...qrows, ...srows, ...irows].map((r) => r[0]))) +
    // Items the seed used to create under another name (their SKUs and quotes cascade).
    (RETIRED_ITEMS.length ? `\nDELETE FROM supply_items WHERE id IN (${RETIRED_ITEMS.map((n) => id('item', n)).join(', ')});\n` : '') +
    '\nCOMMIT;\n';
  writeFileSync(OUT, sql);
  console.log(header.split('\n').filter((l) => l.startsWith('-- Counts') || l.startsWith('-- Not imported')).join('\n'));
}

build();
