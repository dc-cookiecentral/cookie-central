import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Open raw-material orders (awaiting landing) + the create/receive mutations.
export function useRawMaterialOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('raw_material_orders')
      .select(
        `id, raw_material_id, quantity, cost_per_unit, distributor, brand,
         order_date, expected_delivery, status,
         raw_materials ( id, name, code, unit, quantity, lot_count )`
      )
      .in('status', ['pending', 'confirmed'])
      .order('expected_delivery', { nullsFirst: false });
    if (error) setError(error.message);
    else setOrders(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { orders, loading, error, refresh };
}

// Create pending orders from reorder rows.
// Each row: { raw_material_id, supplier_id, distributor, brand, quantity,
//             cost_per_unit, lead_time_days }
export async function createRawMaterialOrders(rows) {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const payload = rows.map((r) => {
    const expected = new Date(today);
    if (r.lead_time_days) expected.setDate(expected.getDate() + r.lead_time_days);
    return {
      raw_material_id: r.raw_material_id,
      supplier_id: r.supplier_id ?? null,
      distributor: r.distributor ?? null,
      brand: r.brand ?? null,
      quantity: r.quantity,
      cost_per_unit: r.cost_per_unit ?? null,
      order_date: iso(today),
      expected_delivery: r.lead_time_days ? iso(expected) : null,
      status: 'pending',
      source: 'manual',
    };
  });
  const { error } = await supabase.from('raw_material_orders').insert(payload);
  if (error) throw error;
  return { created: payload.length };
}

// Land an order: record lots (1:many), mark delivered, bump material on-hand.
// `lots`: [{ lot_number, quantity, expiry_date }]
export async function receiveRawMaterialOrder(order, { landDate, lots }) {
  const material = order.raw_materials;
  const totalReceived = lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const baseFifo = material?.lot_count ?? 0;

  // 1. Lots (origin of the lot numbers).
  const { error: lotErr } = await supabase.from('raw_material_lots').insert(
    lots.map((l, i) => ({
      raw_material_id: order.raw_material_id,
      raw_material_order_id: order.id,
      lot_number: l.lot_number || null,
      quantity: Number(l.quantity) || 0,
      received_date: landDate,
      expiry_date: l.expiry_date || null,
      fifo_order: baseFifo + i + 1,
    }))
  );
  if (lotErr) throw lotErr;

  // 2. Close the order.
  const { error: ordErr } = await supabase
    .from('raw_material_orders')
    .update({ actual_delivery: landDate, status: 'delivered' })
    .eq('id', order.id);
  if (ordErr) throw ordErr;

  // 3. Bump material on-hand + lot count.
  const { error: matErr } = await supabase
    .from('raw_materials')
    .update({
      quantity: (Number(material?.quantity) || 0) + totalReceived,
      lot_count: baseFifo + lots.length,
      last_upload_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.raw_material_id);
  if (matErr) throw matErr;

  return { received: totalReceived, lots: lots.length };
}
