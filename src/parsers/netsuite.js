import { toNumber, pick } from '../utils/csvParser';

// ─────────────────────────────────────────────────────────────────────────
// Cortina NetSuite PO export parser — FORMAT UNCONFIRMED (BUILD_PLAN 3.5).
// PO list of record is NetSuite (Excel export now, API later). NetSuite
// exports one row per line item with PO-level fields repeated; we group by
// PO number → purchase_orders, with per-row lines → po_line_items.
//
// DOT fulfillment dates (ship_to_dot_*, dot_receipt_date) are NOT in NetSuite
// — they come from systems@ email / DOT portal / manual entry, so they stay
// null here and are filled in elsewhere.
//
// COLUMN-MAPPING SEAM: adjust alias arrays when the real export lands.
// ─────────────────────────────────────────────────────────────────────────
const COLUMNS = {
  poNumber:     ['PO #', 'PO Number', 'Document Number', 'Number', 'Transaction Number'],
  retailer:     ['Retailer', 'Customer', 'Channel'],
  orderDate:    ['Date', 'Order Date', 'Transaction Date'],
  mabd:         ['MABD', 'Must Arrive By', 'Must Arrive By Date'],
  shipOriginal: ['Ship Date', 'Expected Ship Date', 'Scheduled Ship Date'],
  destination:  ['Destination', 'Ship To', 'DC', 'Destination DC'],
  invoice:      ['Invoice', 'Invoice #', 'Invoice Number'],
  poTotal:      ['Total', 'Amount', 'PO Total'],
  terms:        ['Terms', 'Payment Terms'],
  customerPo:   ['Customer PO', 'Customer Order', 'Customer Order Number'],
  // line-level
  sku:          ['Item', 'SKU', 'Product', 'Item Name'],
  qtyCases:     ['Quantity', 'Qty', 'Cases', 'Quantity Cases'],
  unitCost:     ['Rate', 'Unit Price', 'Unit Cost', 'Price'],
  lineTotal:    ['Line Total', 'Amount', 'Line Amount'],
};

// Infer Walmart/Kroger from any text field (destination/customer/PO memo).
function inferRetailer(...vals) {
  const hay = vals.filter(Boolean).join(' ').toLowerCase();
  if (hay.includes('kroger')) return 'Kroger';
  if (hay.includes('walmart') || hay.includes('wmt')) return 'Walmart';
  return null;
}

function toIsoDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function parse(rows) {
  const byPo = new Map();
  const errors = [];

  rows.forEach((row, i) => {
    const poNumber = pick(row, COLUMNS.poNumber);
    if (!poNumber) {
      if (Object.values(row).some((v) => v != null && String(v).trim() !== '')) {
        errors.push({ row: i + 2, message: 'Missing PO number' });
      }
      return;
    }
    const key = String(poNumber).trim();
    if (!byPo.has(key)) {
      const destination = pick(row, COLUMNS.destination);
      // Normalize to Walmart/Kroger (the filter + badges depend on exact
      // values). Infer across all text fields; default Walmart when unknown.
      const retailer =
        inferRetailer(pick(row, COLUMNS.retailer), destination, pick(row, COLUMNS.customerPo)) ||
        'Walmart';
      byPo.set(key, {
        po_number: key,
        retailer,
        order_date: toIsoDate(pick(row, COLUMNS.orderDate)),
        mabd: toIsoDate(pick(row, COLUMNS.mabd)),
        ship_date_original: toIsoDate(pick(row, COLUMNS.shipOriginal)),
        destination_dc: destination,
        invoice_number: pick(row, COLUMNS.invoice),
        payment_terms: pick(row, COLUMNS.terms),
        customer_order_number: pick(row, COLUMNS.customerPo),
        total_amount: toNumber(pick(row, COLUMNS.poTotal)),
        _lines: [],
      });
    }
    const po = byPo.get(key);
    const sku = pick(row, COLUMNS.sku);
    const qty = toNumber(pick(row, COLUMNS.qtyCases));
    if (sku || qty != null) {
      const unit = toNumber(pick(row, COLUMNS.unitCost));
      po._lines.push({
        sku: sku ? String(sku).trim() : null,
        quantity_cases: qty ?? 0,
        unit_cost: unit,
        line_total: toNumber(pick(row, COLUMNS.lineTotal)) ?? (unit != null && qty != null ? unit * qty : null),
      });
    }
  });

  const records = [...byPo.values()].map((po) => {
    const total_cases = po._lines.reduce((s, l) => s + (l.quantity_cases || 0), 0);
    return { ...po, total_cases };
  });

  const lineCount = records.reduce((s, p) => s + p._lines.length, 0);
  return {
    records,
    errors,
    summary: `${records.length} POs, ${lineCount} line items`,
  };
}

async function importRecords(records, { client } = {}) {
  const supabase = client ?? (await import('../lib/supabase')).supabase;
  let inserted = 0;
  let linked = 0;

  for (const po of records) {
    const { _lines, ...poFields } = po;
    const { data: saved, error: poErr } = await supabase
      .from('purchase_orders')
      .upsert(
        { ...poFields, updated_at: new Date().toISOString() },
        { onConflict: 'po_number' }
      )
      .select('id')
      .single();
    if (poErr) throw poErr;

    // Replace line items with the fresh export.
    await supabase.from('po_line_items').delete().eq('po_id', saved.id);
    if (_lines.length) {
      const { error: lineErr } = await supabase.from('po_line_items').insert(
        _lines.map((l) => ({ po_id: saved.id, ...l }))
      );
      if (lineErr) throw lineErr;
    }

    // Back-fill: attach any parked email extractions (po_emails + their lots)
    // that arrived from systems@ before this PO existed, matched by po_number.
    // SECURITY DEFINER RPC (migration 20260602160000) — links null→this PO
    // without a client UPDATE policy. Best-effort: a failure must not abort the
    // import (e.g. the migration not yet applied → silent no-op).
    const { data: linkedCount, error: linkErr } = await supabase.rpc('link_parked_po_emails', {
      p_po_id: saved.id,
      p_po_number: po.po_number,
    });
    if (linkErr) console.warn(`link_parked_po_emails(${po.po_number}):`, linkErr.message);
    else linked += linkedCount ?? 0;

    inserted += 1;
  }
  return { inserted, linked };
}

export default {
  type: 'netsuite',
  label: 'Cortina NetSuite POs',
  accept: '.xlsx,.xls,.csv',
  unconfirmed: true,
  previewColumns: [
    { key: 'po_number', label: 'PO #' },
    { key: 'retailer', label: 'Retailer' },
    { key: 'order_date', label: 'Order Date' },
    { key: 'mabd', label: 'MABD' },
    { key: 'destination_dc', label: 'Destination' },
    { key: 'total_cases', label: 'Cases' },
    { key: 'total_amount', label: 'Total' },
  ],
  parse,
  importRecords,
};
