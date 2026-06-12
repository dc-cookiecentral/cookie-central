// Cortina Walmart Orders parser — the PRIMARY source for Product Orders and
// Payments. Replaces the temporary Cortina PO PDF upload (cortinaPO.js).
//
// Cortina (NetSuite) emails this .xlsx to systems@dirtycookie.com nightly at
// 10 PM Eastern (from DMorales@CortinaFoods.com). The daily 7 AM cron polls it,
// so orders land in Cookie Central before anyone logs in.
//
// Shape: one sheet "Walmart Orders", one row per SKU going to one Walmart DC.
// Multiple rows share a Document Number (SO####) — we GROUP them into a single
// purchase_order with one po_line_item per row. The report is the FULL history
// every night, so import is an UPSERT on cortina_so_number (never duplicates).
//
// Explicit .js extensions + lazy `import('xlsx')`: this parser is reused by the
// gmail-extract Edge Function (Deno), which resolves "xlsx" via the function
// import map and requires full import paths. Mirrors production.js.

// ── date parsing ────────────────────────────────────────────────────────────
// The export mixes two formats:
//   M/D/YYYY              "3/17/2026"           (Date, Delivery Date, UDF 5, …)
//   YYYY-MM-DD HH:MM:SS   "2026-03-20 00:00:00" (Actual Delivery Date)
// Returns ISO YYYY-MM-DD, or null.
function isoDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // YYYY-MM-DD (optionally with a time component)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const [, y, mm, dd] = m;
    return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // M/D/YYYY or M-D-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    const [, mm, dd, y] = m;
    return `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return null;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function intOf(v) {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

const g = (row, key) => {
  const v = row[key];
  return v == null ? '' : String(v).trim();
};

// First non-empty value among the group (header-level fields repeat on every row
// of an SO, but defend against a blank cell on the first row).
const firstOf = (rows, key) => {
  for (const r of rows) {
    const v = g(r, key);
    if (v) return v;
  }
  return '';
};

// "Ship to" is a multi-line postal block whose first line is the DC label
// ("Regional DC 6084"). "Ship To Location" is present in the schema but empty in
// the current export, so we fall back to the Ship-to block.
function destinationDc(row) {
  const loc = g(row, 'Ship To Location');
  if (loc) return loc;
  const shipTo = g(row, 'Ship to');
  return shipTo ? shipTo.split('\n')[0].trim() : null;
}

// ── parse one workbook → grouped PO records ─────────────────────────────────
// Pure over the row array so it's testable without a file. Each returned record
// carries hidden-ish _lines (po_line_items) + _invoice (cortina_invoices, ≤1 per
// SO in the data) for the importer.
export function parseRows(rows) {
  const errors = [];
  const groups = new Map(); // Document Number → rows[]
  for (const r of rows) {
    const so = g(r, 'Document Number');
    if (!so) continue; // skip blank/footer rows
    if (!groups.has(so)) groups.set(so, []);
    groups.get(so).push(r);
  }

  const records = [];
  for (const [so, grp] of groups) {
    const lines = grp.map((r) => ({
      cortina_item_number: g(r, 'Item') || null,
      sku: g(r, 'Item Name') || null,
      upc: g(r, 'UPC Code') || null,
      quantity_cases: intOf(r['Quantity in Transaction Units']),
      walmart_unit_price: num(r['Item Rate']),
      line_total: num(r['Amount']),
      store_upc: g(r, 'Store Code') || null,
      destination_dc: destinationDc(r),
      actual_delivery_date: isoDate(r['Actual Delivery Date']),
      // Warehouse / appointment fields — captured even though mostly empty today.
      metadata: {
        invoice_number: g(r, 'Invoice Number') || null,
        warehouse_bol: g(r, 'Warehouse BOL') || null,
        warehouse_order_number: g(r, 'Warehouse Order Number') || null,
        warehouse_order_status: g(r, 'Warehouse Order Status') || null,
        warehouse_shipping_order: g(r, 'Warehouse Shipping Order') || null,
        warehouse_advice_sent_date: isoDate(r['Warehouse Shipping Order Advice Sent Date']),
        delivery_appointment_date: isoDate(r['Delivery Appointment Date']),
        appointment_number: g(r, 'Appointment Number') || null,
        actual_delivery_date: isoDate(r['Actual Delivery Date']),
      },
    }));

    // Invoices for this SO, grouped by Invoice Number. "Invoice Amount" in the
    // export is a per-line echo (equals the row Amount), so the true invoice
    // total is the sum of line Amounts sharing that Invoice Number.
    const invMap = new Map();
    for (const r of grp) {
      const invNo = g(r, 'Invoice Number');
      if (!invNo) continue;
      if (!invMap.has(invNo)) {
        invMap.set(invNo, {
          invoice_number: invNo,
          invoice_date: isoDate(r['Invoice Date']),
          invoice_terms: intOf(r['Invoice Terms']),
          invoice_amount: 0,
          payment_document: g(r, 'Payment Document Number') || null,
          payment_date: isoDate(r['Payment Date']),
        });
      }
      const inv = invMap.get(invNo);
      inv.invoice_amount += num(r['Amount']) ?? 0;
      // First non-empty payment fields win.
      if (!inv.payment_document) inv.payment_document = g(r, 'Payment Document Number') || null;
      if (!inv.payment_date) inv.payment_date = isoDate(r['Payment Date']);
    }
    const invoices = [...invMap.values()];

    // ship_status from per-line Actual Delivery Date.
    const deliveredLines = lines.filter((l) => l.actual_delivery_date).length;
    const ship_status =
      deliveredLines === 0 ? 'pending' : deliveredLines === lines.length ? 'delivered' : 'partial';

    // payment_status from invoice Payment Date.
    const paidInv = invoices.filter((i) => i.payment_date).length;
    const payment_status =
      invoices.length === 0 || paidInv === 0
        ? 'pending'
        : paidInv === invoices.length
        ? 'paid'
        : 'partial';

    const total_amount = lines.reduce((s, l) => s + (l.line_total || 0), 0);
    const total_cases = lines.reduce((s, l) => s + (l.quantity_cases || 0), 0);
    const paid_amount = invoices.filter((i) => i.payment_date).reduce((s, i) => s + (i.invoice_amount || 0), 0);
    const terms = invoices.find((i) => i.invoice_terms != null)?.invoice_terms ?? null;

    // ship_date_actual at PO level: latest actual delivery across DCs.
    const actuals = lines.map((l) => l.actual_delivery_date).filter(Boolean).sort();

    records.push({
      cortina_so_number: so,
      po_number: so, // satisfies the NOT NULL UNIQUE po_number; routes/UI key on it
      walmart_po_number: firstOf(grp, 'Customer PO') || null,
      retailer: 'Walmart',
      order_date: isoDate(firstOf(grp, 'Date')),
      ship_date_original: isoDate(firstOf(grp, 'Delivery Date')),
      ship_date_actual: actuals.length ? actuals[actuals.length - 1] : null,
      cortina_received_date: isoDate(firstOf(grp, 'UDF 5')),
      ship_status,
      payment_status,
      payment_terms: terms != null ? `Net ${terms}` : null,
      invoice_number: invoices[0]?.invoice_number ?? null,
      revenue_per_case: lines.find((l) => l.walmart_unit_price != null)?.walmart_unit_price ?? null,
      total_amount,
      total_cases,
      paid_amount,
      cortina_po: true,
      _lines: lines,
      _invoices: invoices,
    });
  }

  if (!records.length) errors.push({ row: 0, message: 'No Document Numbers found — is this the Walmart Orders export?' });
  return { records, errors };
}

// ── file → records ──────────────────────────────────────────────────────────
async function parseFile(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  // Prefer the named sheet; fall back to the first.
  const sheetName = wb.SheetNames.find((n) => /walmart\s*orders/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: false, defval: '' });

  const { records, errors } = parseRows(rows);

  const orderCount = records.length;
  const lineCount = records.reduce((s, r) => s + r._lines.length, 0);
  const invCount = records.reduce((s, r) => s + r._invoices.length, 0);
  const cases = records.reduce((s, r) => s + (r.total_cases ?? 0), 0);
  const amount = records.reduce((s, r) => s + (r.total_amount ?? 0), 0);
  const summary = orderCount
    ? `${orderCount} SO(s) · ${lineCount} line item(s) · ${invCount} invoice(s) · ` +
      `${cases.toLocaleString()} cases · $${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : 'Could not parse — check this is the Walmart Orders export.';

  return { records, errors, summary };
}

// ── import ──────────────────────────────────────────────────────────────────
// Upsert each PO on cortina_so_number, replace its line items + invoices, then
// back-link any parked systems@ email extractions. `client` lets the gmail agent
// (Deno, service-role) reuse this; the browser path falls back to the anon client.
async function importRecords(records, { uploadId, client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  let orders = 0;
  let lineItems = 0;
  let invoices = 0;
  let linked = 0;

  for (const rec of records) {
    const { _lines, _invoices, ...poFields } = rec;

    const { data: saved, error: poErr } = await supabase
      .from('purchase_orders')
      .upsert({ ...poFields, updated_at: new Date().toISOString() }, { onConflict: 'cortina_so_number' })
      .select('id')
      .single();
    if (poErr) throw poErr;

    // Line items: delete-then-insert keeps re-imports idempotent.
    await supabase.from('po_line_items').delete().eq('po_id', saved.id);
    if (_lines.length) {
      const rows = _lines.map((l) => ({
        po_id: saved.id,
        sku: l.sku,
        quantity_cases: l.quantity_cases,
        line_total: l.line_total,
        cortina_item_number: l.cortina_item_number,
        upc: l.upc,
        walmart_unit_price: l.walmart_unit_price,
        store_upc: l.store_upc,
        destination_dc: l.destination_dc,
        metadata: l.metadata,
      }));
      const { error } = await supabase.from('po_line_items').insert(rows);
      if (error) throw error;
      lineItems += rows.length;
    }

    // Invoices (≤1 per SO in the data, but handle N): delete-then-insert by po_id
    // — invoice_number is globally unique and each belongs to exactly one PO.
    await supabase.from('cortina_invoices').delete().eq('po_id', saved.id);
    if (_invoices.length) {
      const rows = _invoices.map((i) => ({ ...i, po_id: saved.id, source_upload_id: uploadId ?? null }));
      const { error } = await supabase.from('cortina_invoices').insert(rows);
      if (error) throw error;
      invoices += rows.length;
    }

    // Back-link parked systems@ extractions by either identifier (best-effort).
    for (const ref of [rec.walmart_po_number, rec.cortina_so_number]) {
      if (!ref) continue;
      const { data: n, error } = await supabase.rpc('link_parked_po_emails', {
        p_po_id: saved.id,
        p_po_number: ref,
      });
      if (error) console.warn(`link_parked_po_emails(${ref}):`, error.message);
      else linked += n ?? 0;
    }

    orders += 1;
  }

  return { inserted: orders, orders, lineItems, invoices, linked };
}

export default {
  type: 'walmart_orders',
  label: 'Walmart Orders (NetSuite)',
  accept: '.xlsx,.xls',
  parseFile, // custom: groups rows into POs, not a flat row import
  importRecords,
  previewColumns: [
    { key: 'cortina_so_number', label: 'SO #' },
    { key: 'walmart_po_number', label: 'WM PO #' },
    { key: 'order_date', label: 'Date' },
    { key: 'ship_date_original', label: 'Delivery' },
    { key: 'total_cases', label: 'Cases' },
    { key: 'total_amount', label: 'Total' },
    { key: 'ship_status', label: 'Ship' },
    { key: 'payment_status', label: 'Pay' },
  ],
};
