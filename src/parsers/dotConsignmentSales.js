// Explicit .js extension so this parser also resolves under Deno (matching the
// other parsers reused by Edge Functions); Vite is unaffected.
import { walmartWeekOf } from './retailLinkSupplyPlan.js';

// ─────────────────────────────────────────────────────────────────────────
// DOT "Consignment Sales History" — sheet "Consignment Sales History". One row
// per DOT order line: a Walmart PO × item shipped (or cut) to a Walmart GDC,
// ordered vs received cases. Writes `dot_consignment_sales`; drives the
// planner's cut-recovery panel and the Tracker's DOT shipped / cut rows.
//
// ⚠️ Three DOT exports, three questions — do not confuse them:
//   · Order History (dotOrderHistory.js): per DOT order, NO item column, and
//     EXCEPTION-FILTERED (only orders with a cut). Superseded by this file for
//     every week this file covers.
//   · Inventory Snapshot (dotInventorySnapshot.js): stock on hand at DOT.
//   · Consignment Sales History (this): every outbound line, by item.
//
// ── Validation, first file (2026-11-05) ──────────────────────────────────
//   620 lines · 566 POs · 20,512 cs ordered · 15,777 received.
//   Ordered cases bucketed by order week reproduce Retail Link OTIF's cases
//   ordered exactly for its first three weeks (609 · 1,638 · 945).
//   Every PO exists in NetSuite, whose quantity equals RECEIVED on 561 of 566.
//
// ── Re-placed orders ─────────────────────────────────────────────────────
// DOT re-enters a cut PO as a NEW DOT order (PO 0112957696: 42 → 0 on order
// 3266700, then 42 → 42 on 4355664). The key is therefore DOT order + item;
// totalling cuts per line would count that recovered 42 as lost. The feed
// hook groups by PO + item before computing a cut.
// ─────────────────────────────────────────────────────────────────────────

// Walmart prime item → short code. Mirrors ITEM_TO_SKU in useDemandFeeds; an
// unmapped item is stored with sku = null and reported, never dropped.
const ITEM_TO_SKU = { '679640563': 'WC', '679640564': 'PBG', '683581675': 'CCF', '686669913': 'BC' };

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const text = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};
// Item and order numbers can arrive as numbers; keep them as plain digit text.
const idText = (v) => (v == null || v === '' ? null : String(typeof v === 'number' ? Math.round(v) : v).trim());

// US M/D/YYYY (or a Date) → bare YYYY-MM-DD. See dotOrderHistory.js on why a
// bare date and never `new Date(value)`.
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

const REQUIRED = ['Customer Order Number', 'Customer Item Number', 'Quantity Ordered', 'Quantity Received'];

// Pure: rows = the sheet as a 2D array (SheetJS header: 1). Exported for the
// node test script.
export function parseRows(rows, sheetName = 'sheet') {
  const hIdx = rows.findIndex((r) => (r || []).some((c) => String(c ?? '').trim().toLowerCase() === 'quantity received'));
  if (hIdx === -1) {
    return {
      records: [], summary: 'nothing parsed',
      errors: [{ row: 0, message: `No "Quantity Received" column on sheet "${sheetName}" — is this DOT's Consignment Sales History export? (Order History goes on card 5, the Inventory Snapshot on card 7.)` }],
    };
  }
  const h = rows[hIdx];
  const missing = REQUIRED.filter((n) => colIndex(h, n) === -1);
  if (missing.length) {
    return { records: [], summary: 'nothing parsed', errors: [{ row: hIdx + 1, message: `Missing column(s): ${missing.join(', ')}` }] };
  }
  const c = {
    establish: colIndex(h, 'Detail Establish Date'),
    orderDate: colIndex(h, 'Order Date'),
    productLine: colIndex(h, 'Product Line Number'),
    dotItem: colIndex(h, 'Dot Item Number'),
    gtin: colIndex(h, 'GTIN/UPC'),
    desc: colIndex(h, 'Item Description'),
    destNo: colIndex(h, 'Destination Customer Number'),
    destName: colIndex(h, 'Destination Customer Name'),
    destCity: colIndex(h, 'Destination Customer City'),
    destState: colIndex(h, 'Destination Customer State'),
    dotOrder: colIndex(h, 'Customer Order Number'),
    seq: colIndex(h, 'Customer Sequence Number'),
    load: colIndex(h, 'Customer Load Number'),
    stop: colIndex(h, 'Customer Stop Number'),
    po: colIndex(h, 'Customer PO Number'),
    item: colIndex(h, 'Customer Item Number'),
    charge: colIndex(h, 'Customer Unit Charge'),
    ordered: colIndex(h, 'Quantity Ordered'),
    received: colIndex(h, 'Quantity Received'),
    gross: colIndex(h, 'Gross Weight'),
    net: colIndex(h, 'Net Weight'),
  };
  const at = (r, i) => (i === -1 ? null : r[i]);

  const errors = [];
  const out = [];
  let noShipDate = 0;
  const unmapped = new Map();
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const dotOrder = idText(at(r, c.dotOrder));
    const item = idText(at(r, c.item));
    if (!dotOrder || !item) continue;
    const ship = usDate(at(r, c.establish));
    const order = usDate(at(r, c.orderDate));
    if (!ship) noShipDate++;
    const sku = ITEM_TO_SKU[item] ?? null;
    if (!sku) unmapped.set(item, (unmapped.get(item) || 0) + (num(at(r, c.ordered)) || 0));
    out.push({
      dot_order_number: dotOrder,
      item_number: item,
      sequence_number: num(at(r, c.seq)),
      sku,
      // Keep the PO as TEXT with its leading zeros — NetSuite stores
      // walmart_po_number as "0108082660".
      customer_po: text(at(r, c.po)),
      order_date: order,
      ship_date: ship,
      ship_week: ship ? walmartWeekOf(ship) : null,
      order_week: order ? walmartWeekOf(order) : null,
      ordered_cases: num(at(r, c.ordered)) ?? 0,
      received_cases: num(at(r, c.received)) ?? 0,
      gross_weight_lb: num(at(r, c.gross)),
      net_weight_lb: num(at(r, c.net)),
      unit_charge: num(at(r, c.charge)),
      dot_item_number: idText(at(r, c.dotItem)),
      gtin: idText(at(r, c.gtin)),
      product_line: idText(at(r, c.productLine)),
      item_description: text(at(r, c.desc)),
      dest_customer_number: text(at(r, c.destNo)),
      dest_name: text(at(r, c.destName)),
      dest_city: text(at(r, c.destCity)),
      dest_state: text(at(r, c.destState)),
      load_number: idText(at(r, c.load)),
      stop_number: num(at(r, c.stop)),
    });
  }

  if (noShipDate) errors.push({ row: 0, message: `${noShipDate} line(s) have no readable Detail Establish Date — stored, but not bucketed into a week` });
  if (unmapped.size) {
    errors.push({ row: 0, message: `⚠️ Unmapped Walmart item(s) ${[...unmapped.keys()].join(', ')} (${[...unmapped.values()].reduce((a, b) => a + b, 0).toLocaleString()} cs ordered) — stored with no SKU and left out of the planner until ITEM_TO_SKU learns them` });
  }
  const over = out.filter((r) => r.received_cases > r.ordered_cases);
  if (over.length) errors.push({ row: 0, message: `${over.length} line(s) received more than ordered (e.g. DOT order ${over[0].dot_order_number}) — check the export` });

  // Collapse duplicates within one file (the upsert cannot touch a key twice).
  const byKey = new Map();
  for (const r of out) byKey.set(`${r.dot_order_number}|${r.item_number}`, r);
  const deduped = [...byKey.values()];
  if (deduped.length !== out.length) errors.push({ row: 0, message: `Collapsed ${out.length - deduped.length} duplicate DOT order × item line(s) within this file` });

  const ordered = deduped.reduce((a, r) => a + r.ordered_cases, 0);
  const received = deduped.reduce((a, r) => a + r.received_cases, 0);
  const ships = deduped.map((r) => r.ship_date).filter(Boolean).sort();
  const pos = new Set(deduped.map((r) => r.customer_po)).size;
  return {
    records: deduped,
    errors,
    summary:
      `${deduped.length} line(s) · ${pos} PO(s) · shipped ${ships.length ? ships[0] + ' – ' + ships.at(-1) : 'no dates'} · ` +
      `${ordered.toLocaleString()} cs ordered, ${received.toLocaleString()} received ` +
      `(${ordered > 0 ? Math.round((received / ordered) * 1000) / 10 : 0}% filled)`,
  };
}

async function parseFile(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const key = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'consignment sales history') ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[key], { header: 1, defval: null });
  return parseRows(rows, key);
}

// `client` lets a server-side caller reuse this importer; the browser passes
// none and falls back to the lazy anon client (RLS gates writes to
// ops/admin/finance — the authenticated uploader). The export is a rolling
// history, so every upload UPSERTS: re-uploading overlapping weeks updates a
// line whose received quantity has since settled.
async function importRecords(records, { uploadId, client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  if (!records.length) return { inserted: 0 };
  const now = new Date().toISOString();
  const rows = records.map((r) => ({ ...r, upload_id: uploadId ?? null, updated_at: now }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('dot_consignment_sales')
      .upsert(rows.slice(i, i + 500), { onConflict: 'dot_order_number,item_number' });
    if (error) throw error;
  }
  return { inserted: records.length };
}

export default {
  type: 'dot_consignment_sales',
  label: 'DOT Consignment Sales History',
  accept: '.xlsx,.xls',
  parseFile,                              // override: handles the workbook directly
  importRecords,
  previewColumns: [
    { key: 'ship_date', label: 'Shipped' },
    { key: 'customer_po', label: 'Walmart PO' },
    { key: 'sku', label: 'SKU' },
    { key: 'dest_name', label: 'Destination' },
    { key: 'ordered_cases', label: 'Ordered' },
    { key: 'received_cases', label: 'Received' },
  ],
};
