// Explicit .js extension so this parser also resolves under Deno (matching the
// other parsers reused by the Gmail agent Edge Function); Vite is unaffected.
import { toNumber, pick } from '../utils/csvParser.js';

// ─────────────────────────────────────────────────────────────────────────
// Ingredient Master bulk import (Reference Data).
//
// Source: Assembler_Ingredient_Data.csv — one row per ingredient × distributor
// × brand sourcing option. Normalizes into two DEDICATED catalog tables (kept
// separate from the live Assemblers inventory in raw_materials):
//
//   ingredient_catalog   — one row per normalized ingredient name (47).
//   ingredient_suppliers — one row per source row (91), linked via ingredient_id.
//
// Source columns:
//   Ingredient (Normalized) | Brand/Supplier | DC Item # | Supplier # |
//   Distributor | Pkg Type | Qty/Pkg | Unit | Cost | Cost/Unit | Priority |
//   Product Line | Lead Time | Shelf Life | MOQ | Terms | Notes
//
// Grouping is by the verbatim (trimmed) normalized name — no fuzzy merging — so
// the catalog count is deterministic (47). Several source columns are free-form
// text (MOQ "Pallet"/"FTL", lead/shelf life "2 wks") and are stored verbatim.
// ─────────────────────────────────────────────────────────────────────────
const COLUMNS = {
  name:        ['Ingredient (Normalized)', 'Ingredient'],
  brand:       ['Brand/Supplier', 'Brand'],
  dcItem:      ['DC Item #', 'DC Item#', 'DC Item'],
  supplierNum: ['Supplier #', 'Supplier#', 'Supplier'],
  distributor: ['Distributor'],
  pkgType:     ['Pkg Type', 'Package Type'],
  qtyPkg:      ['Qty/Pkg', 'Qty per Pkg'],
  unit:        ['Unit'],
  cost:        ['Cost'],
  costPerUnit: ['Cost/Unit', 'Cost per Unit'],
  priority:    ['Priority'],
  productLine: ['Product Line'],
  leadTime:    ['Lead Time'],
  shelfLife:   ['Shelf Life'],
  moq:         ['MOQ'],
  terms:       ['Terms'],
  notes:       ['Notes'],
};

// Trim to a non-empty string, else null.
function text(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Light category inference for the catalog row (purely informational).
function categorize(name, unit) {
  const n = (name || '').toLowerCase();
  if (n.includes('frozen dough')) return 'finished_good';
  if (/^(tray|film|srp)\b/.test(n) || n.includes('box') || (unit || '').toLowerCase() === 'each') {
    return 'packaging';
  }
  return 'raw_material';
}

function parse(rows) {
  const errors = [];
  const records = [];
  const names = new Set();

  rows.forEach((row, i) => {
    const name = text(pick(row, COLUMNS.name));
    if (!name) {
      // Skip blank lines silently; flag rows that have data but no name.
      if (Object.values(row).some((v) => v != null && String(v).trim() !== '')) {
        errors.push({ row: i + 2, message: 'Missing ingredient name' });
      }
      return;
    }
    names.add(name);
    records.push({
      ingredient_name: name,
      brand: text(pick(row, COLUMNS.brand)),
      dc_item_number: text(pick(row, COLUMNS.dcItem)),
      supplier_number: text(pick(row, COLUMNS.supplierNum)),
      distributor: text(pick(row, COLUMNS.distributor)),
      pkg_type: text(pick(row, COLUMNS.pkgType)),
      qty_per_package: toNumber(pick(row, COLUMNS.qtyPkg)),
      unit: text(pick(row, COLUMNS.unit)),
      cost: toNumber(pick(row, COLUMNS.cost)),
      cost_per_unit: toNumber(pick(row, COLUMNS.costPerUnit)),
      priority: text(pick(row, COLUMNS.priority)),
      product_line: text(pick(row, COLUMNS.productLine)),
      lead_time_text: text(pick(row, COLUMNS.leadTime)),
      shelf_life_text: text(pick(row, COLUMNS.shelfLife)),
      moq: text(pick(row, COLUMNS.moq)),
      terms: text(pick(row, COLUMNS.terms)),
      notes: text(pick(row, COLUMNS.notes)),
    });
  });

  const distributors = new Set(records.map((r) => r.distributor).filter(Boolean));
  return {
    records,
    errors,
    summary: `${names.size} ingredients, ${records.length} supplier rows across ${distributors.size} distributors`,
  };
}

// Derive the distinct ingredient catalog from the (already-parsed) supplier
// rows so importRecords needs only the records array UploadPipeline passes it.
function buildCatalog(records, now) {
  const byName = new Map();
  for (const r of records) {
    if (!byName.has(r.ingredient_name)) byName.set(r.ingredient_name, []);
    if (r.unit) byName.get(r.ingredient_name).push(r.unit);
  }
  return [...byName.entries()].map(([name, units]) => ({
    name,
    unit: units[0] || 'lbs',
    category: categorize(name, units[0]),
    updated_at: now,
  }));
}

// `client` lets a server-side caller reuse this importer; the browser passes
// none and falls back to the lazy anon client (RLS gates writes to ops/admin/
// finance — the authenticated uploader).
async function importRecords(records, { client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  const now = new Date().toISOString();

  // 1. Upsert the distinct ingredients (idempotent on re-upload, keyed by name).
  const ingredients = buildCatalog(records, now);
  const { data: catRows, error: catErr } = await supabase
    .from('ingredient_catalog')
    .upsert(ingredients, { onConflict: 'name' })
    .select('id, name');
  if (catErr) throw catErr;
  const idByName = new Map(catRows.map((r) => [r.name, r.id]));

  // 2. Full refresh of supplier rows — this table is exclusively the catalog's,
  //    so a delete-all + re-insert keeps re-uploads at exactly the source count.
  const { error: delErr } = await supabase
    .from('ingredient_suppliers')
    .delete()
    .not('id', 'is', null);
  if (delErr) throw delErr;

  const supplierRows = records.map(({ ingredient_name, ...rest }) => ({
    ingredient_id: idByName.get(ingredient_name) ?? null,
    ...rest,
  }));
  const { error: insErr } = await supabase.from('ingredient_suppliers').insert(supplierRows);
  if (insErr) throw insErr;

  return { inserted: supplierRows.length, ingredients: ingredients.length };
}

export default {
  type: 'ingredient_master',
  label: 'Ingredient Master',
  accept: '.csv,.xlsx,.xls',
  previewColumns: [
    { key: 'ingredient_name', label: 'Ingredient' },
    { key: 'brand', label: 'Brand' },
    { key: 'distributor', label: 'Distributor' },
    { key: 'dc_item_number', label: 'DC Item #' },
    { key: 'pkg_type', label: 'Pkg' },
    { key: 'qty_per_package', label: 'Qty/Pkg' },
    { key: 'unit', label: 'Unit' },
    { key: 'cost_per_unit', label: 'Cost/Unit' },
  ],
  parse,
  importRecords,
};
