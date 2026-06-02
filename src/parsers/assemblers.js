// Explicit .js extension so this parser also resolves under Deno (reused by the
// Gmail agent Edge Function); Vite is unaffected.
import { toNumber, pick } from '../utils/csvParser.js';

// ─────────────────────────────────────────────────────────────────────────
// Assemblers "Inventory Snapshot Report" parser (BUILD_PLAN 2.3).
// Reconciled against the real export (Inventory Report - 2026-5-06.xlsx):
//   • .xlsx, TWO sheets with identical headers — both are read & merged
//     (Sheet1 carries 3 codes absent from the main sheet).
//   • Pallet-level rows (~384) → aggregated to ~28 items by Item code.
//
// Real columns:
//   Item code | Item description | Lot code | Expiry date | Base quantity |
//   Base unit of measure | Case quantity | Case unit of measure | Item type |
//   Inventory status | Pallet Number
//
// Category (3-way per build plan):
//   Item type FINISHED            → finished_good
//   Item type RAW + base UOM 'ea' → packaging   (Trays, Films, Master cases)
//   Item type RAW + base UOM 'lb' → raw_material
//
// Expiry: driven by the explicit `Inventory status = Expired` (authoritative);
// dates are a secondary signal for almost_expired. `Regulatory Hold` /
// `Inventory Freeze` are quality holds — surfaced in summary, not stored
// (no schema field for hold qty; see DECISIONS).
// ─────────────────────────────────────────────────────────────────────────
const COLUMNS = {
  code:     ['Item code'],
  name:     ['Item description'],
  lot:      ['Lot code'],
  expiry:   ['Expiry date'],
  quantity: ['Base quantity'],
  unit:     ['Base unit of measure'],
  itemType: ['Item type'],
  status:   ['Inventory status'],
};

const ALMOST_EXPIRED_DAYS = 60;

function categorize(itemType, baseUnit) {
  const t = (itemType || '').toLowerCase();
  if (t.includes('finish')) return 'finished_good';
  if (t.includes('wip')) return 'wip';
  // RAW: split ingredients (lb) from packaging (each).
  const u = (baseUnit || '').toLowerCase();
  if (u === 'ea' || u === 'each') return 'packaging';
  return 'raw_material';
}

function normalizeUnit(u) {
  const s = (u || '').toLowerCase();
  if (s === 'lb' || s === 'lbs') return 'lbs';
  if (s === 'ea' || s === 'each') return 'units';
  return u || 'lbs';
}

// Defensive date parsing. Real data is mostly MM-DD-YYYY but also includes
// null, "02-05-2026 TRIAL", "MAR 29 26". Returns a Date or null — never throws.
function parseExpiry(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // MM-DD-YYYY (optionally with trailing text like " TRIAL")
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) {
    const [, mm, dd, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return isNaN(d) ? null : d;
  }
  // Fallback: let the engine try (handles some "Mar 29 26" forms); null if not.
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function isExpiredStatus(status) {
  return (status || '').toLowerCase() === 'expired';
}

function isHoldStatus(status) {
  const s = (status || '').toLowerCase();
  return s.includes('hold') || s.includes('freeze');
}

function parse(rows) {
  const byCode = new Map();
  const errors = [];
  const now = new Date();
  let heldQty = 0;

  rows.forEach((row, i) => {
    const code = pick(row, COLUMNS.code);
    if (!code) {
      // Stray/blank rows (e.g. from an unrelated sheet) — skip silently unless
      // the row otherwise has data.
      if (Object.values(row).some((v) => v != null && String(v).trim() !== '')) {
        errors.push({ row: i + 2, message: 'Missing Item code' });
      }
      return;
    }
    const qty = toNumber(pick(row, COLUMNS.quantity)) ?? 0;
    const status = pick(row, COLUMNS.status);
    const expiry = parseExpiry(pick(row, COLUMNS.expiry));
    const baseUnit = pick(row, COLUMNS.unit);

    if (!byCode.has(code)) {
      byCode.set(code, {
        code: String(code).trim(),
        name: pick(row, COLUMNS.name) || String(code),
        unit: normalizeUnit(baseUnit),
        category: categorize(pick(row, COLUMNS.itemType), baseUnit),
        quantity: 0,
        expired_quantity: 0,
        _hasAlmost: false,
        _lots: new Map(), // keyed by lot code → { quantity, expiry }
      });
    }
    const item = byCode.get(code);
    item.quantity += qty;

    if (isExpiredStatus(status)) item.expired_quantity += qty;
    if (isHoldStatus(status)) heldQty += qty;

    const expired = isExpiredStatus(status) || (expiry && expiry < now);
    if (!expired && expiry && (expiry - now) / 86400000 <= ALMOST_EXPIRED_DAYS) {
      item._hasAlmost = true;
    }

    // Aggregate lots by lot code (a lot can span multiple pallets).
    const lotKey = pick(row, COLUMNS.lot) || `(no-lot)-${item._lots.size}`;
    if (!item._lots.has(lotKey)) {
      item._lots.set(lotKey, {
        lot_number: pick(row, COLUMNS.lot),
        quantity: 0,
        expiry_date: expiry ? expiry.toISOString().slice(0, 10) : null,
      });
    }
    item._lots.get(lotKey).quantity += qty;
  });

  const records = [...byCode.values()].map((item) => {
    const lots = [...item._lots.values()];
    const expiry_status =
      item.expired_quantity > 0 ? 'partial_expired' : item._hasAlmost ? 'almost_expired' : 'good';
    return {
      code: item.code,
      name: item.name,
      unit: item.unit,
      category: item.category,
      quantity: Math.round(item.quantity * 1000) / 1000,
      lot_count: lots.length,
      expired_quantity: Math.round(item.expired_quantity * 1000) / 1000,
      expiry_status,
      _lots: lots,
    };
  });

  const counts = records.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});
  const expiredItems = records.filter((r) => r.expired_quantity > 0).length;
  let summary =
    `${records.length} items from ${rows.length} rows — ` +
    Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
  if (expiredItems) summary += ` · ${expiredItems} with expired lots`;
  if (heldQty) summary += ` · ${Math.round(heldQty).toLocaleString()} on quality hold`;

  return { records, errors, summary };
}

// `client` lets a server-side caller (the Gmail agent Edge Function, running in
// Deno with a service-role client) reuse this importer. The browser passes none,
// so it falls back to the lazy anon client — unchanged behavior.
async function importRecords(records, { client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  const last_upload_at = new Date().toISOString();
  let inserted = 0;

  for (const item of records) {
    const lots = [...item._lots].sort((a, b) =>
      (a.expiry_date || '9999') < (b.expiry_date || '9999') ? -1 : 1
    );

    const { data: rm, error: rmErr } = await supabase
      .from('raw_materials')
      .upsert(
        {
          code: item.code,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          lot_count: item.lot_count,
          expiry_status: item.expiry_status,
          expired_quantity: item.expired_quantity,
          category: item.category,
          last_upload_at,
          updated_at: last_upload_at,
        },
        { onConflict: 'code' }
      )
      .select('id')
      .single();
    if (rmErr) throw rmErr;
    inserted += 1;

    await supabase.from('raw_material_lots').delete().eq('raw_material_id', rm.id);
    if (lots.length) {
      const { error: lotErr } = await supabase.from('raw_material_lots').insert(
        lots.map((l, idx) => ({
          raw_material_id: rm.id,
          lot_number: l.lot_number,
          quantity: l.quantity,
          expiry_date: l.expiry_date,
          fifo_order: idx + 1,
        }))
      );
      if (lotErr) throw lotErr;
    }
  }
  return { inserted };
}

export default {
  type: 'assemblers',
  label: 'Assemblers Report',
  accept: '.xlsx,.xls,.csv',
  previewColumns: [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unit', label: 'Unit' },
    { key: 'lot_count', label: 'Lots' },
    { key: 'expired_quantity', label: 'Expired' },
    { key: 'expiry_status', label: 'Status' },
  ],
  parse,
  importRecords,
};
