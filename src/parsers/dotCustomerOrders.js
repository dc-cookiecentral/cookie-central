// Explicit .js extension so this parser also resolves under Deno (matching the
// other parsers reused by Edge Functions); Vite is unaffected.
import { walmartWeekOf } from './retailLinkSupplyPlan.js';

// ─────────────────────────────────────────────────────────────────────────
// DOT "Customer Order Details" — sheet "Details". A STATUS SNAPSHOT of DOT
// orders to Walmart GDCs. Two row types, told apart by "Line Type":
//   · Item Detail — one per DOT order × item: status, dates, ordered /
//     shipped / cut cases and cut reason.
//   · Lot Detail  — one per lot picked for that line: lot code, expiry,
//     cases picked. Attached to its item line as `lots`.
// Writes `dot_customer_orders`, one row per DOT order × DOT item.
//
// The four DOT exports, four questions:
//   · Order History (card 5) — cut orders only, per order, no item. Legacy.
//   · Inventory Snapshot (card 7) — stock on hand at DOT.
//   · Consignment Sales History (card 8) — every SHIPPED line, ordered vs received.
//   · Customer Order Details (this, card 9) — every line DOT is WORKING:
//     open pipeline, status, lots/expiry picked, cut reason.
//
// ── Validation, first file (2026-11-05) ──────────────────────────────────
//   131 item lines · 127 DOT orders · 2,437 cs · statuses Open 75, Picking
//   11, Loaded 28, Delivered 17 · ordered = shipped + cut on all 131 ·
//   64 lot lines; picked cases = shipped on all 56 lines that carry lots.
//   The 15 Delivered lines whose DOT order is in Consignment Sales History
//   are the only overlap — the rest is pipeline that file does not yet hold.
//
// ⚠️ On Open / Picking lines, "Shipped Quantity" is DOT's PLANNED quantity
// (it equals ordered on every open line). Treat it as shipped only once the
// status is Loaded or Delivered.
// ─────────────────────────────────────────────────────────────────────────

// DOT item number → short code (from the Consignment Sales History and
// Inventory Snapshot files). "Manufacturer Number" is not usable on its own:
// it is the case GTIN for WC / PBG but the Walmart item number for CCF / BC.
const DOT_ITEM_TO_SKU = { '810547': 'WC', '810546': 'PBG', '820454': 'CCF', '826920': 'BC' };
const MFR_TO_SKU = {
  '10194346527783': 'WC', '10194346527790': 'PBG',
  '679640563': 'WC', '679640564': 'PBG', '683581675': 'CCF', '686669913': 'BC',
};

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const text = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};
const idText = (v) => (v == null || v === '' ? null : String(typeof v === 'number' ? Math.round(v) : v).trim() || null);

// US M/D/YYYY or MM/DD/YYYY (or a Date) → bare YYYY-MM-DD. See
// dotOrderHistory.js on why a bare date and never `new Date(value)`.
function usDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

function colIndex(headerRow, ...names) {
  const cells = (headerRow || []).map((c) => String(c ?? '').trim().toLowerCase());
  for (const n of names) {
    const i = cells.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

const REQUIRED = ['Line Type', 'Dot Order Number', 'Dot Item Number', 'Order Quantity', 'Order Status'];

// Pure: rows = the sheet as a 2D array (SheetJS header: 1). Exported for the
// node test script.
export function parseRows(rows, sheetName = 'sheet') {
  const hIdx = rows.findIndex((r) => (r || []).some((c) => String(c ?? '').trim().toLowerCase() === 'line type'));
  if (hIdx === -1) {
    return {
      records: [], summary: 'nothing parsed',
      errors: [{ row: 0, message: `No "Line Type" column on sheet "${sheetName}" — is this DOT's Customer Order Details export? (Consignment Sales History goes on card 8, Order History on card 5.)` }],
    };
  }
  const h = rows[hIdx];
  const missing = REQUIRED.filter((n) => colIndex(h, n) === -1);
  if (missing.length) {
    return { records: [], summary: 'nothing parsed', errors: [{ row: hIdx + 1, message: `Missing column(s): ${missing.join(', ')}` }] };
  }
  const c = {
    type: colIndex(h, 'Line Type'),
    customer: colIndex(h, 'Customer Name'),
    location: colIndex(h, 'Customer Location'),
    origin: colIndex(h, 'Originating DC'),
    po: colIndex(h, 'PO Number'),
    dotOrder: colIndex(h, 'Dot Order Number'),
    load: colIndex(h, 'Load Number'),
    dotItem: colIndex(h, 'Dot Item Number'),
    mfr: colIndex(h, 'Manufacturer Number'),
    desc: colIndex(h, 'Item Description'),
    ordered: colIndex(h, 'Order Quantity'),
    shipped: colIndex(h, 'Shipped Quantity'),
    cutReason: colIndex(h, 'Cut Reason'),
    cut: colIndex(h, 'Cut Quantity'),
    lot: colIndex(h, 'Lot Code Picked'),
    expiry: colIndex(h, 'Expiration Date Picked'),
    picked: colIndex(h, 'Quantity Picked'),
    status: colIndex(h, 'Order Status'),
    orderDate: colIndex(h, 'Order Date'),
    requested: colIndex(h, 'Requested Delivery Date'),
    appointment: colIndex(h, 'Appointment Date'),
    departure: colIndex(h, 'Servicing DC Departure Date'),
    arrival: colIndex(h, 'Customer Arrival Date'),
    custDeparture: colIndex(h, 'Customer Departure Date'),
    reconciled: colIndex(h, 'Reconciled Date'),
  };
  const at = (r, i) => (i === -1 ? null : r[i]);
  const keyOf = (r) => `${idText(at(r, c.dotOrder))}|${idText(at(r, c.dotItem))}`;

  const errors = [];
  const items = new Map();
  const lotRows = [];
  const unmapped = new Set();
  let otherTypes = 0;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const type = String(at(r, c.type) ?? '').trim().toLowerCase();
    const dotOrder = idText(at(r, c.dotOrder));
    const dotItem = idText(at(r, c.dotItem));
    if (!dotOrder || !dotItem) continue;
    if (type === 'lot detail') { lotRows.push({ row: i + 1, r }); continue; }
    if (type !== 'item detail') { otherTypes++; continue; }

    const mfr = idText(at(r, c.mfr));
    const sku = DOT_ITEM_TO_SKU[dotItem] ?? MFR_TO_SKU[mfr] ?? null;
    if (!sku) unmapped.add(`${dotItem} (${mfr ?? 'no mfr'})`);
    const order = usDate(at(r, c.orderDate));
    const requested = usDate(at(r, c.requested));
    items.set(`${dotOrder}|${dotItem}`, {
      dot_order_number: dotOrder,
      dot_item_number: dotItem,
      sku,
      manufacturer_number: mfr,
      item_description: text(at(r, c.desc))?.replace(/\s+/g, ' ') ?? null,
      customer_po: text(at(r, c.po)),
      customer_name: text(at(r, c.customer)),
      customer_location: text(at(r, c.location)),
      originating_dc: text(at(r, c.origin)),
      load_number: idText(at(r, c.load)),
      order_status: text(at(r, c.status)),
      order_date: order,
      order_week: order ? walmartWeekOf(order) : null,
      requested_delivery_date: requested,
      requested_week: requested ? walmartWeekOf(requested) : null,
      appointment_date: usDate(at(r, c.appointment)),
      dc_departure_date: usDate(at(r, c.departure)),
      customer_arrival_date: usDate(at(r, c.arrival)),
      customer_departure_date: usDate(at(r, c.custDeparture)),
      reconciled_date: usDate(at(r, c.reconciled)),
      ordered_cases: num(at(r, c.ordered)) ?? 0,
      shipped_cases: num(at(r, c.shipped)) ?? 0,
      cut_cases: num(at(r, c.cut)) ?? 0,
      cut_reason: text(at(r, c.cutReason)),
      lots: [],
      earliest_expiry_picked: null,
    });
  }

  // Attach lots to their item line.
  let orphanLots = 0;
  for (const { r } of lotRows) {
    const item = items.get(keyOf(r));
    if (!item) { orphanLots++; continue; }
    const lot = { lot: text(at(r, c.lot)), expiry: usDate(at(r, c.expiry)), cases: num(at(r, c.picked)) ?? 0 };
    item.lots.push(lot);
    if (lot.expiry && (!item.earliest_expiry_picked || lot.expiry < item.earliest_expiry_picked)) item.earliest_expiry_picked = lot.expiry;
  }
  const records = [...items.values()];

  if (unmapped.size) errors.push({ row: 0, message: `⚠️ Unmapped DOT item(s) ${[...unmapped].join(', ')} — stored with no SKU` });
  if (orphanLots) errors.push({ row: 0, message: `${orphanLots} Lot Detail row(s) had no matching Item Detail line and were skipped` });
  if (otherTypes) errors.push({ row: 0, message: `${otherTypes} row(s) with an unrecognised Line Type were skipped` });
  // Identity checks: a failure means the export's shape changed.
  const broken = records.filter((r) => Math.abs(r.ordered_cases - (r.shipped_cases + r.cut_cases)) > 0.5);
  if (broken.length) errors.push({ row: 0, message: `⚠️ ${broken.length} line(s) break "ordered = shipped + cut" (e.g. DOT order ${broken[0].dot_order_number}) — check before trusting the quantities` });
  const lotMismatch = records.filter((r) => r.lots.length && Math.abs(r.lots.reduce((a, l) => a + l.cases, 0) - r.shipped_cases) > 0.5);
  if (lotMismatch.length) errors.push({ row: 0, message: `${lotMismatch.length} line(s) where cases picked across lots ≠ shipped (e.g. DOT order ${lotMismatch[0].dot_order_number})` });

  const byStatus = records.reduce((m, r) => ((m[r.order_status ?? '—'] = (m[r.order_status ?? '—'] || 0) + 1), m), {});
  const ordered = records.reduce((a, r) => a + r.ordered_cases, 0);
  const cut = records.reduce((a, r) => a + r.cut_cases, 0);
  return {
    records,
    errors,
    summary:
      `${records.length} order line(s) · ${new Set(records.map((r) => r.dot_order_number)).size} DOT order(s) · ` +
      Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(', ') +
      ` · ${ordered.toLocaleString()} cs ordered, ${cut.toLocaleString()} cut · ${lotRows.length - orphanLots} lot line(s)`,
  };
}

async function parseFile(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const key = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'details') ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[key], { header: 1, defval: null });
  return parseRows(rows, key);
}

// ── Overlapping and out-of-order uploads (Caroline, Nov 5 2026) ──────────
// DOT exports at most 90 days per pull, so history arrives as overlapping
// files, possibly older ones AFTER newer ones. Two guarantees:
//   1. No duplicates — one row per DOT order × item (the primary key), so a
//      line that appears in two files is one row.
//   2. No going backwards — the file carries no report date, so a line's
//      STATUS orders the readings: an older file must not move a Delivered
//      line back to Open. A stored line further along than the incoming one
//      is left untouched. Same rank → the incoming line wins (it may fill in
//      dates). Statuses not in the table are always written.
const STATUS_RANK = { open: 1, released: 1, picking: 2, picked: 2, loaded: 3, shipped: 3, 'in transit': 3, delivered: 4, reconciled: 5 };
const rankOf = (r) => {
  const base = STATUS_RANK[String(r?.order_status ?? '').trim().toLowerCase()];
  if (base == null) return null;
  return r.reconciled_date ? Math.max(base, STATUS_RANK.reconciled) : base;
};
// Pure, exported for the test script: should `incoming` overwrite `stored`?
export function isNotOlder(stored, incoming) {
  if (!stored) return true;
  const a = rankOf(stored), b = rankOf(incoming);
  if (a == null || b == null) return true;
  return b >= a;
}

// Upsert on DOT order × item. `first_seen_at` is left to its default on insert
// and never sent, so it keeps the first sighting; `last_seen_at` is stamped on
// every line written.
async function importRecords(records, { uploadId, client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  if (!records.length) return { inserted: 0 };

  // Read what is stored for these orders, to apply guarantee 2.
  const stored = new Map();
  const orderNos = [...new Set(records.map((r) => r.dot_order_number))];
  for (let i = 0; i < orderNos.length; i += 200) {
    const { data, error } = await supabase
      .from('dot_customer_orders')
      .select('dot_order_number, dot_item_number, order_status, reconciled_date')
      .in('dot_order_number', orderNos.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) stored.set(`${r.dot_order_number}|${r.dot_item_number}`, r);
  }
  const fresh = records.filter((r) => isNotOlder(stored.get(`${r.dot_order_number}|${r.dot_item_number}`), r));
  const skipped = records.length - fresh.length;

  const now = new Date().toISOString();
  const rows = fresh.map((r) => ({ ...r, upload_id: uploadId ?? null, last_seen_at: now }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('dot_customer_orders')
      .upsert(rows.slice(i, i + 500), { onConflict: 'dot_order_number,dot_item_number' });
    if (error) throw error;
  }
  return { inserted: rows.length, skipped };
}

export default {
  type: 'dot_customer_orders',
  label: 'DOT Customer Order Details',
  accept: '.xlsx,.xls',
  parseFile,                              // override: handles the workbook directly
  importRecords,
  previewColumns: [
    { key: 'order_status', label: 'Status' },
    { key: 'requested_delivery_date', label: 'Requested' },
    { key: 'customer_po', label: 'Walmart PO' },
    { key: 'sku', label: 'SKU' },
    { key: 'customer_name', label: 'Destination' },
    { key: 'ordered_cases', label: 'Ordered' },
    { key: 'cut_cases', label: 'Cut' },
    { key: 'earliest_expiry_picked', label: 'Expiry picked' },
  ],
};
