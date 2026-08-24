// Explicit .js extension so this parser also resolves under Deno (matching the
// other parsers reused by Edge Functions); Vite is unaffected.
import { walmartWeekOf } from './retailLinkSupplyPlan.js';

// ─────────────────────────────────────────────────────────────────────────
// DOT outbound Order History — "Order History (N).xlsx", sheet "Outbound
// Orders". One row per DOT order heading to a Walmart GDC. Writes
// `dot_order_history`; feeds the planner's cut-recovery panel.
//
// ⚠️ NOT the same file as src/parsers/dot.js expects. That one is a
// pallet-level ON-HAND snapshot for `dot_inventory` and is still FORMAT
// UNCONFIRMED with no sample. This is an ORDER/CUT feed. Both are "the DOT
// report" in conversation; they answer different questions.
//
// ── Validation ────────────────────────────────────────────────────────────
// Bucketing this file by Delivery Date into Walmart weeks reproduces
// SEED.dotService EXACTLY — six weeks, on ordered, cut and order count. Unlike
// POS, this export is a fixed historical slice rather than a restated one, so
// exact reproduction is the right test. If a change here stops reproducing it,
// the change is wrong.
//
// ── The quantity identity ────────────────────────────────────────────────
//   ordered = expected + cut + reconciled     (holds on all 221 sample rows)
// NOT `ordered = expected + cut`, which holds on only 148 of 221. Quantities
// are CASES, always multiples of 21 (the pallet layer).
// ─────────────────────────────────────────────────────────────────────────

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const text = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

// The export writes US M/D/YYYY strings, sometimes with a trailing time
// ('07/22/2026, 04:00 PM'). Return a bare YYYY-MM-DD: Postgres `date` columns
// are bare dates, and `new Date(value)` on one is parsed as UTC, which lands a
// day early west of Greenwich (see utils/dates.js).
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

async function parseFileImpl(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const key = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'outbound orders') ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[key], { header: 1, defval: null });

  const hIdx = rows.findIndex((r) => (r || []).some((c) => String(c ?? '').trim().toLowerCase() === 'dot order number'));
  if (hIdx === -1) {
    return {
      records: [], summary: 'nothing parsed',
      errors: [{ row: 0, message: `No "Dot Order Number" column on sheet "${key}" — is this the DOT Order History export? (The pallet-level on-hand export goes to the DOT Inventory card instead.)` }],
    };
  }
  const h = rows[hIdx];
  const c = {
    po: colIndex(h, 'Customer PO Number'),
    account: colIndex(h, 'Corporate Account'),
    temp: colIndex(h, 'Temperature'),
    status: colIndex(h, 'Order Status'),
    dotOrder: colIndex(h, 'Dot Order Number'),
    ordered: colIndex(h, 'Ordered Quantity'),
    expected: colIndex(h, 'Expected Quantity'),
    reconciled: colIndex(h, 'Reconciled Quantity'),
    shipped: colIndex(h, 'Shipped Quantity'),
    cut: colIndex(h, 'Cut Quantity'),
    orderDate: colIndex(h, 'Order Date'),
    delivery: colIndex(h, 'Delivery Date'),
    requested: colIndex(h, 'Requested Delivery Date'),
    appointment: colIndex(h, 'Appointment Date'),
    arrival: colIndex(h, 'Customer Arrival Date'),
    reconciledDate: colIndex(h, 'Reconciled Date'),
    origin: colIndex(h, 'Originating DC'),
    fulfilling: colIndex(h, 'Fulfilling DC'),
    destination: colIndex(h, 'Destination'),
    load: colIndex(h, 'Load Number(s)', 'Load Numbers'),
  };

  const errors = [];
  const out = [];
  let noDelivery = 0;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const dotOrder = text(r[c.dotOrder]);
    if (!dotOrder) continue;
    const delivery = usDate(r[c.delivery]);
    if (!delivery) noDelivery++;
    out.push({
      dot_order_number: dotOrder,
      customer_po: text(r[c.po]),
      corporate_account: text(r[c.account]),
      temperature: text(r[c.temp]),
      order_status: text(r[c.status]),
      ordered_cases: num(r[c.ordered]),
      expected_cases: num(r[c.expected]),
      reconciled_cases: num(r[c.reconciled]),
      shipped_cases: num(r[c.shipped]),
      cut_cases: num(r[c.cut]),
      order_date: usDate(r[c.orderDate]),
      delivery_date: delivery,
      // Delivery Date is the bucketing date — it is what reproduces
      // SEED.dotService. Do not switch this to Order Date without re-running
      // that comparison.
      delivery_week: delivery ? walmartWeekOf(delivery) : null,
      requested_delivery_date: usDate(r[c.requested]),
      appointment_at: c.appointment === -1 ? null : text(r[c.appointment]),
      customer_arrival_date: usDate(r[c.arrival]),
      reconciled_date: usDate(r[c.reconciledDate]),
      originating_dc: text(r[c.origin]),
      fulfilling_dc: text(r[c.fulfilling]),
      destination: text(r[c.destination]),
      load_numbers: text(r[c.load]),
    });
  }
  if (noDelivery) {
    errors.push({ row: 0, message: `${noDelivery} row(s) have no readable Delivery Date — stored, but they cannot be bucketed into a week and will not appear in the cut-recovery panel` });
  }

  // Collapse duplicates within one file so the upsert never sees a key twice in
  // one batch (Postgres rejects ON CONFLICT affecting a row twice).
  const byKey = new Map();
  for (const r of out) byKey.set(r.dot_order_number, r);
  const deduped = [...byKey.values()];
  if (deduped.length !== out.length) {
    errors.push({ row: 0, message: `Collapsed ${out.length - deduped.length} duplicate Dot Order Number(s) within this file` });
  }

  // Surface the identity as a warning rather than a failure — a violation means
  // the export's shape changed and the cut figures should not be trusted.
  const broken = deduped.filter((r) => {
    const o = r.ordered_cases, e = r.expected_cases ?? 0, cu = r.cut_cases ?? 0, rc = r.reconciled_cases ?? 0;
    return o != null && Math.abs(o - (e + cu + rc)) > 0.5;
  });
  if (broken.length) {
    errors.push({ row: 0, message: `⚠️ ${broken.length} row(s) break "ordered = expected + cut + reconciled" (e.g. order ${broken[0].dot_order_number}). The export's columns may have changed — check before trusting the cut totals.` });
  }

  const weeks = deduped.map((r) => r.delivery_week).filter(Boolean);
  const ordered = deduped.reduce((a, r) => a + (r.ordered_cases || 0), 0);
  const cut = deduped.reduce((a, r) => a + (r.cut_cases || 0), 0);
  return {
    records: deduped,
    errors,
    summary:
      `${deduped.length} DOT order(s) · weeks ${weeks.length ? Math.min(...weeks) + '–' + Math.max(...weeks) : 'none'} · ` +
      `${ordered.toLocaleString()} cs ordered, ${cut.toLocaleString()} cut ` +
      `(${ordered > 0 ? Math.round((cut / ordered) * 100) : 0}%)`,
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
    .from('dot_order_history')
    .upsert(records.map((r) => ({ ...r, upload_id: uploadId ?? null, updated_at: now })),
            { onConflict: 'dot_order_number' });
  if (error) throw error;
  return { inserted: records.length };
}

export default {
  type: 'dot_order_history',
  label: 'DOT Order History',
  accept: '.xlsx,.xls',
  parseFile,                              // override: handles the workbook directly
  importRecords,
  previewColumns: [
    { key: 'delivery_date', label: 'Delivery' },
    { key: 'delivery_week', label: 'WM week' },
    { key: 'customer_po', label: 'Walmart PO' },
    { key: 'dot_order_number', label: 'DOT order' },
    { key: 'order_status', label: 'Status' },
    { key: 'ordered_cases', label: 'Ordered' },
    { key: 'cut_cases', label: 'Cut' },
    { key: 'destination', label: 'Destination' },
  ],
};
