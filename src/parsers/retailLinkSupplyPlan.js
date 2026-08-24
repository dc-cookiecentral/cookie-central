// ─────────────────────────────────────────────────────────────────────────
// Retail Link Supply Plan — "Dirty Cookie Supply Plan Wk##.xlsx".
//
// Walmart's forward ORDER plan: the POs it intends to place on us, by
// order-place date. Writes `retail_link_supply_plan`.
//
// ⚠️ This is NOT the store forecast. `retail_link_forecast` is what Walmart
// expects consumers to buy; this is what Walmart plans to order from us. They
// are different quantities at different points in the chain and their totals do
// not reconcile — treating them as the same number double-counts demand.
//
// ── Which sheet ───────────────────────────────────────────────────────────
// The workbook has three: `Supply Plan` (a MONTHLY pivot — not usable by a
// weekly engine, and the reason an earlier read of this file concluded it had
// nothing to offer), `Data` (the real records, date-grain), and `metadata`
// (Retail Link's own provenance block, which names the dataset "Order
// Forecast"). Only `Data` is parsed.
//
// A custom parseFile because the shared flattener in utils/csvParser.js
// concatenates sheets and would merge the pivot into the records; see
// retailLink.js for the full reasoning.
// ─────────────────────────────────────────────────────────────────────────

// Excel serial → 'YYYY-MM-DD'. Read as raw serials rather than with SheetJS's
// `cellDates`, which returned values like `2026-08-15T23:00:21Z` for this file —
// a fractional serial rendered in local time, which lands on the WRONG DAY west
// of Greenwich. The epoch below already absorbs the 1900 leap-year bug for every
// serial above 60, which all real dates are.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function serialToISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10);
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 60) return null;
  return new Date(EXCEL_EPOCH + Math.round(n) * 86400000).toISOString().slice(0, 10);
}

// Walmart weeks run Saturday–Friday. Anchor: week 202605 begins Sat 2026-02-28.
// Verified against all 48 weeks of the planner's own SEED.weeks table — exact.
const ANCHOR = { wk: 202605, start: Date.UTC(2026, 1, 28) };
export function walmartWeekOf(isoDate) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const n = Math.floor((Date.UTC(y, m - 1, d) - ANCHOR.start) / 604800000);
  let year = Math.floor(ANCHOR.wk / 100);
  let w = (ANCHOR.wk % 100) + n;
  // Walmart's fiscal year is 52 weeks; roll over rather than producing 202653.
  while (w > 52) { w -= 52; year++; }
  while (w < 1) { w += 52; year--; }
  return year * 100 + w;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const isItemNbr = (v) => /^\d{6,}$/.test(String(v ?? '').trim());

function colIndex(headerRow, ...names) {
  const cells = (headerRow || []).map((c) => String(c ?? '').trim().toLowerCase());
  for (const n of names) {
    const i = cells.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

async function parseFileImpl(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const key = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'data');
  if (!key) {
    return { records: [], errors: [{ row: 0, message: `No "Data" sheet — sheets present: ${wb.SheetNames.join(', ')}. Is this a Supply Plan export?` }], summary: 'nothing parsed' };
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[key], { header: 1, defval: null });

  const hIdx = rows.findIndex((r) => (r || []).some((c) => String(c ?? '').trim().toLowerCase() === 'wm_item_nbr'));
  if (hIdx === -1) {
    return { records: [], errors: [{ row: 0, message: 'Data sheet has no `wm_item_nbr` column' }], summary: 'nothing parsed' };
  }
  const h = rows[hIdx];
  const c = {
    sugg: colIndex(h, 'sugg_order_dt'),
    item: colIndex(h, 'wm_item_nbr'),
    desc: colIndex(h, 'all_links_item_desc_1', 'all_links_item_description'),
    place: colIndex(h, 'order_place_dt'),
    dc: colIndex(h, 'dc_nbr'),
    qty: colIndex(h, 'order_each_quantity'),
  };

  const errors = [];
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !isItemNbr(r[c.item])) continue;
    const placeDate = serialToISO(r[c.place]);
    if (!placeDate) {
      errors.push({ row: i + 1, message: `Unreadable order_place_dt "${r[c.place]}" — row skipped` });
      continue;
    }
    out.push({
      snapshot_date: serialToISO(r[c.sugg]),
      item_number: String(r[c.item]).trim(),
      item_desc: c.desc === -1 ? null : String(r[c.desc] ?? '').trim() || null,
      order_place_date: placeDate,
      order_place_week: walmartWeekOf(placeDate),
      // '' not null: the unique key has to work, and NULL never equals NULL.
      dc_nbr: c.dc === -1 ? '' : String(r[c.dc] ?? '').trim(),
      order_each_quantity: num(r[c.qty]),
    });
  }

  const missingSnap = out.filter((r) => !r.snapshot_date).length;
  if (missingSnap) {
    errors.push({ row: 0, message: `${missingSnap} row(s) have no sugg_order_dt — they cannot be keyed and were dropped` });
  }
  const records = out.filter((r) => r.snapshot_date);

  // Collapse duplicates within one file so the upsert never sees the same key
  // twice in a batch (Postgres rejects ON CONFLICT affecting a row twice).
  const byKey = new Map();
  for (const r of records) byKey.set(`${r.snapshot_date}|${r.item_number}|${r.order_place_date}|${r.dc_nbr}`, r);
  const deduped = [...byKey.values()].sort(
    (a, b) => a.order_place_date.localeCompare(b.order_place_date) || a.item_number.localeCompare(b.item_number)
  );
  if (deduped.length !== records.length) {
    errors.push({ row: 0, message: `Collapsed ${records.length - deduped.length} duplicate row(s) within this file` });
  }

  const weeks = deduped.map((r) => r.order_place_week).filter(Boolean);
  const eaches = deduped.reduce((a, r) => a + (r.order_each_quantity || 0), 0);
  return {
    records: deduped,
    errors,
    summary:
      `plan of ${deduped[0]?.snapshot_date ?? '?'} · ${deduped.length} rows, ` +
      `${new Set(deduped.map((r) => r.item_number)).size} items, ` +
      `weeks ${weeks.length ? Math.min(...weeks) + '–' + Math.max(...weeks) : 'none'} · ` +
      `${eaches.toLocaleString()} eaches (${Math.round(eaches / 12).toLocaleString()} cs)`,
  };
}

async function parseFile(file) {
  return parseFileImpl(file);
}

// `client` lets a server-side caller reuse this importer; the browser passes
// none and falls back to the lazy anon client (RLS gates writes to
// ops/admin/finance — the authenticated uploader).
async function importRecords(records, { uploadId, client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  if (!records.length) return { inserted: 0 };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('retail_link_supply_plan')
    .upsert(records.map((r) => ({ ...r, upload_id: uploadId ?? null, updated_at: now })),
            { onConflict: 'snapshot_date,item_number,order_place_date,dc_nbr' });
  if (error) throw error;
  return { inserted: records.length };
}

export default {
  type: 'retail_link_supply_plan',
  label: 'Retail Link Supply Plan',
  accept: '.xlsx,.xls',
  parseFile,                              // override: handles the workbook directly
  importRecords,
  previewColumns: [
    { key: 'order_place_date', label: 'Order place' },
    { key: 'order_place_week', label: 'WM week' },
    { key: 'item_number', label: 'Item' },
    { key: 'item_desc', label: 'Description' },
    { key: 'order_each_quantity', label: 'Eaches' },
    { key: 'dc_nbr', label: 'DC' },
    { key: 'snapshot_date', label: 'Plan of' },
  ],
};
