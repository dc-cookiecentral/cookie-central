import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Supplies & Vendors data layer (docs/SUPPLIES_SPEC.md).
// Fetches the whole supplies model plus its views in parallel. $/lb, $/1,000,
// freight shares, landed cost and the assumed-vs-actual flag all come from the
// views — never computed or stored client-side.

const SOURCES = [
  ['vendors', 'vendors'],
  ['contacts', 'vendor_contacts'],
  ['items', 'supply_items'],
  ['skus', 'supply_skus'],
  ['quotes', 'quotes'],
  ['pricing', 'v_sku_pricing'],
  ['pos', 'supply_pos'],
  ['lineCost', 'v_po_line_cost'],
  ['itemCost', 'v_item_cost'],
];

export function useSupplies() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(SOURCES.map(([, table]) => supabase.from(table).select('*')));
    const failed = results.find((r) => r.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }
    const next = {};
    SOURCES.forEach(([key], i) => {
      next[key] = results[i].data ?? [];
    });
    setData(next);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

// The `supply-docs` bucket is private: open an original through a short-lived
// signed URL. The tab is opened synchronously (before the await) so popup
// blockers treat it as part of the click.
export async function openSupplyDoc(path) {
  const tab = window.open('', '_blank');
  const { data, error } = await supabase.storage.from('supply-docs').createSignedUrl(path, 300);
  if (error) {
    tab?.close();
    window.alert(`Couldn't open document: ${error.message}`);
    return;
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

// ── writes (edit lock: admin/ops; RLS enforces the same) ───────────────────
export async function saveAssumedCost(itemId, value) {
  const { error } = await supabase.from('supply_items').update({ assumed_cost: value }).eq('id', itemId);
  return { error };
}

// ── new PO with its lines (PoForm) ─────────────────────────────────────────
// One PO = a supply_pos row + one quotes row (doc_type 'po', status 'on_po')
// per line + one quote_breaks row (qty, line total) per line. The views then
// derive everything else: $/lb or $/1,000, last order, latest PO price and
// actual landed cost. A line can bring a new vendor SKU with it.
//
// Supabase has no client-side transaction, so the writes run in order and a
// failure undoes what already landed (PO → its quotes, breaks cascade → new
// SKUs → the uploaded file).
//
//   po:    { po_number, vendor_id, po_date, terms, lead_time, fulfillment, freight_cost, notes }
//   lines: [{ sku_id | newSku: { item_id, brand_name, order_unit, unit_weight_lbs, units_per_order_unit, units_per_thousand },
//             qty, unit_price }]
//   file:  optional File (the PO PDF) → supply-docs/<vendor-slug>/<date>_po-<number>.<ext>
export async function createPurchaseOrder({ po, lines, file, vendorName }) {
  const undo = [];
  const rollback = async () => {
    for (const fn of undo.reverse()) await fn();
  };
  const fail = async (error) => {
    await rollback();
    return { error };
  };

  const { data: dupe } = await supabase.from('supply_pos').select('id').eq('po_number', po.po_number).maybeSingle();
  if (dupe) return { error: { message: `PO ${po.po_number} already exists. Open it from the POs tab to edit it.` } };

  let docPath = null;
  if (file) {
    const slug = (s) => String(s || 'vendor').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    docPath = `${slug(vendorName)}/${po.po_date || 'undated'}_po-${slug(po.po_number)}.${ext}`;
    const { error } = await supabase.storage.from('supply-docs').upload(docPath, file, { contentType: file.type || undefined });
    if (error) return { error: { message: `Couldn't upload the PO file: ${error.message}` } };
    undo.push(() => supabase.storage.from('supply-docs').remove([docPath]));
  }

  const { data: poRow, error: poErr } = await supabase.from('supply_pos').insert({
    po_number: po.po_number,
    vendor_id: po.vendor_id,
    po_date: po.po_date,
    fulfillment: po.fulfillment,
    freight_cost: po.fulfillment ? po.freight_cost : null,
    notes: po.notes,
  }).select('id').single();
  if (poErr) return fail(poErr);
  undo.push(() => supabase.from('supply_pos').delete().eq('id', poRow.id));

  const newSkus = lines.filter((l) => l.newSku);
  let newSkuIds = [];
  if (newSkus.length) {
    const { data: rows, error } = await supabase.from('supply_skus')
      .insert(newSkus.map((l) => ({ ...l.newSku, vendor_id: po.vendor_id })))
      .select('id');
    if (error) return fail(error);
    newSkuIds = rows.map((r) => r.id);
    undo.push(() => supabase.from('supply_skus').delete().in('id', newSkuIds));
  }
  let k = 0;
  const skuIds = lines.map((l) => (l.newSku ? newSkuIds[k++] : l.sku_id));

  const { data: quoteRows, error: qErr } = await supabase.from('quotes').insert(lines.map((l, i) => ({
    sku_id: skuIds[i],
    vendor_id: po.vendor_id,
    po_id: poRow.id,
    doc_type: 'po',
    doc_ref: `PO ${po.po_number}`,
    doc_date: po.po_date,
    status: 'on_po',
    terms: po.terms,
    lead_time: po.lead_time,
    doc_path: docPath,
  }))).select('id');
  if (qErr) return fail(qErr);
  const quoteIds = quoteRows.map((r) => r.id);
  undo.push(() => supabase.from('quotes').delete().in('id', quoteIds));

  const { error: bErr } = await supabase.from('quote_breaks').insert(lines.map((l, i) => ({
    quote_id: quoteIds[i],
    qty: l.qty,
    price_per_order_qty: Math.round(l.qty * l.unit_price * 100) / 100,
  })));
  if (bErr) return fail(bErr);

  return { error: null };
}

// Delete a PO and the price lines filed under it (their breaks cascade). The
// SKUs stay — they are the vendor's catalogue, not the order. The PO file is
// removed only when no remaining quote still points at it.
export async function deletePurchaseOrder(po, quotes) {
  const lines = quotes.filter((q) => q.po_id === po.id);
  if (lines.length) {
    const { error } = await supabase.from('quotes').delete().in('id', lines.map((q) => q.id));
    if (error) return { error };
  }
  const { error } = await supabase.from('supply_pos').delete().eq('id', po.id);
  if (error) return { error };
  const paths = [...new Set(lines.map((q) => q.doc_path).filter(Boolean))]
    .filter((p) => !quotes.some((q) => q.po_id !== po.id && q.doc_path === p));
  if (paths.length) await supabase.storage.from('supply-docs').remove(paths);
  return { error: null };
}

// Upsert the PO by number, then point the quote line at it.
export async function savePo(po, quoteId) {
  const { data, error } = await supabase.from('supply_pos').upsert(po, { onConflict: 'po_number' }).select('id').single();
  if (error) return { error };
  if (!quoteId) return { error: null }; // editing a PO that has no lines yet
  const { error: linkErr } = await supabase.from('quotes').update({ po_id: data.id }).eq('id', quoteId);
  return { error: linkErr };
}
