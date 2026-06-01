import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { daysUntil } from '../utils/dates';

const PO_FIELDS = `
  id, po_number, retailer, order_date, mabd,
  ship_date_original, ship_date_actual, delivery_date,
  ship_to_dot_date, ship_to_dot_actual, dot_receipt_date,
  destination_dc, ship_status, payment_status, payment_terms,
  carrier, freight_handler, bol_received, customer_order_number,
  invoice_number, total_cases, total_amount, paid_amount,
  nova_changes, revenue_per_case, bol_number
`;

// Urgency: pending POs first, soonest ship-to-DOT (then retailer ship) first.
function urgencyRank(po) {
  if (po.ship_status === 'delivered') return 2;
  if (po.ship_status === 'shipped') return 1;
  return 0;
}
function sortByUrgency(a, b) {
  const r = urgencyRank(a) - urgencyRank(b);
  if (r !== 0) return r;
  const da = daysUntil(a.ship_to_dot_date ?? a.ship_date_original);
  const db = daysUntil(b.ship_to_dot_date ?? b.ship_date_original);
  if (da == null) return 1;
  if (db == null) return -1;
  return da - db;
}

// List of POs with line items, sorted by urgency.
export function usePurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`${PO_FIELDS}, po_line_items ( id, sku, quantity_cases, unit_cost, line_total )`);
    if (error) setError(error.message);
    else setOrders((data ?? []).slice().sort(sortByUrgency));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { orders, loading, error, refresh };
}

// Single PO by po_number, with line items + email thread.
export function usePurchaseOrder(poNumber) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from('purchase_orders')
      .select(
        `${PO_FIELDS},
         po_line_items ( id, sku, quantity_cases, unit_cost, line_total ),
         po_emails ( id, timestamp:email_timestamp, sender_name, sender_org, summary, extracted_data )`
      )
      .eq('po_number', poNumber)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setOrder(data);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [poNumber]);

  return { order, loading, error };
}

// Change history for one PO (po_changes), oldest first, with the editor's name.
// Runs only once the PO's id is known. Returns [] until then.
export function usePoChanges(poId) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!poId) {
      setChanges([]);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .from('po_changes')
      .select(
        `id, field_name, original_value, new_value, change_source, change_reason, created_at,
         changed_by_profile:user_profiles ( full_name )`
      )
      .eq('po_id', poId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (!error) setChanges(data ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [poId]);

  return { changes, loading };
}

// Lot numbers + BOL refs captured on one PO (po_lot_numbers).
export function usePoLots(poId) {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!poId) {
      setLots([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('po_lot_numbers')
      .select('id, lot_number, sku, quantity_cases, bol_reference, received_date, source, created_at')
      .eq('po_id', poId)
      .order('created_at', { ascending: true });
    if (!error) setLots(data ?? []);
    setLoading(false);
  }, [poId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { lots, loading, refresh };
}

// Manual "+ Add Lot" entry. Returns { error } on failure.
export async function addPoLot(poId, fields) {
  const { error } = await supabase.from('po_lot_numbers').insert({
    po_id: poId,
    lot_number: fields.lot_number,
    sku: fields.sku || null,
    quantity_cases: fields.quantity_cases ?? null,
    received_date: fields.received_date || null,
    source: 'manual',
  });
  return { error };
}

// Inline-editable BOL number on the PO.
export async function updatePoBol(poId, bolNumber) {
  const { error } = await supabase
    .from('purchase_orders')
    .update({ bol_number: bolNumber || null })
    .eq('id', poId);
  return { error };
}
