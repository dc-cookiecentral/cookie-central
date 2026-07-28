import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// One raw material + everything that hangs off it for Reference > Raw Materials
// detail (BUILD_PLAN 6.4): suppliers (distributor/brand/cost/MOQ/lead),
// orders (full history, not just open), FIFO lots, and BoM usage (which
// products it goes into).
export function useRawMaterialDetail(code) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!code) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: m, error: mErr } = await supabase
      .from('raw_materials')
      .select(
        `id, code, name, quantity, unit, lot_count, expiry_status, expired_quantity,
         default_lead_days, category, last_upload_at,
         raw_material_suppliers ( id, distributor, brand, cost_per_unit, moq, lead_time_days, is_active ),
         raw_material_lots ( id, lot_number, quantity, received_date, expiry_date, fifo_order ),
         bill_of_materials ( id, quantity_per_batch, unit )`
        // NOTE: the nested products(...) embed was dropped when the legacy
        // finished-goods `products` table was replaced by the Cookulator spine
        // (ADR-024). bill_of_materials.product_id pointed at the old table and no
        // consumer rendered the product name. BoM→cookie linking will be
        // re-established against the new products spine when BoM data is populated.
      )
      .eq('code', code)
      .maybeSingle();
    if (mErr) {
      setError(mErr.message);
      setLoading(false);
      return;
    }
    if (!m) {
      setData(null);
      setLoading(false);
      return;
    }

    const { data: orders } = await supabase
      .from('raw_material_orders')
      .select('id, quantity, cost_per_unit, distributor, brand, order_date, expected_delivery, actual_delivery, status, source, bol_reference')
      .eq('raw_material_id', m.id)
      .order('order_date', { ascending: false });

    setData({ ...m, orders: orders ?? [] });
    setError(null);
    setLoading(false);
  }, [code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

// + Add Distributor — inserts a raw_material_suppliers row. RLS already allows
// finance/admin/ops to insert (per initial schema). audit_log is left to the
// trigger on the table (none today; can be added later if pricing changes need
// finer-grained audit).
export async function addDistributor(materialId, fields) {
  const { error } = await supabase.from('raw_material_suppliers').insert({
    raw_material_id: materialId,
    distributor: fields.distributor,
    brand: fields.brand,
    cost_per_unit: fields.cost_per_unit ?? 0,
    moq: fields.moq ?? 0,
    lead_time_days: fields.lead_time_days ?? 14,
    is_active: true,
  });
  return { error };
}

// + Add Order — manual entry for orders that didn't flow through email
// (parsers auto-create the rest). Mirrors raw_material_orders schema.
export async function addManualOrder(materialId, fields) {
  const { error } = await supabase.from('raw_material_orders').insert({
    raw_material_id: materialId,
    supplier_id: fields.supplier_id ?? null,
    distributor: fields.distributor ?? null,
    brand: fields.brand ?? null,
    quantity: fields.quantity,
    cost_per_unit: fields.cost_per_unit ?? null,
    order_date: fields.order_date,
    expected_delivery: fields.expected_delivery || null,
    bol_reference: fields.bol_reference || null,
    status: 'pending',
    source: 'manual',
  });
  return { error };
}
