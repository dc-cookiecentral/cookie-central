import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { nextShipmentNo } from '../utils/sampleCentral';

// Sample Central data layer. Catalog = sample-eligible cookies from the Phase-1
// product spine; plus addresses, shipments (+items), templates, and the
// salesperson dropdown (active users). Writes are RLS-gated to staff/cortina.

export function useSampleCentral() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [catalog, addresses, shipments, templates, salespeople] = await Promise.all([
      supabase
        .from('products')
        .select('code, description, flavor, outer_cookie, stuffing, tier, form, dough_oz, prep, allergens, ingredients, nutrition')
        .eq('sample_eligible', true),
      supabase.from('addresses').select('*').order('nickname'),
      supabase
        .from('sample_shipments')
        // `address:addresses!address_id` must use the explicit table!fk form —
        // the embed was missing entirely, so every card rendered Ship To as
        // "—" and ", ,". The Edge Function's export query (which has always
        // carried it) is the reference for this shape; see ADR-029 #4, where
        // the FK-column short form silently returned null and dropped every
        // order from the export.
        // Reps are a plain list, not user accounts (migrations 20260807000500 /
        // 20260807001500). One relation, no precedence to reason about.
        .select('*, sales_rep:sales_reps!sales_rep_id ( id, full_name, email ), address:addresses!address_id ( * ), sample_shipment_items ( * )')
        .order('created_at', { ascending: false }),
      supabase.from('sample_templates').select('*').order('name'),
      // The Salesperson dropdown. Reads sales_reps, NOT user_profiles — a rep is
      // a name and an email to notify, not a login. Binding this to auth was
      // what forced an account per person (migration 20260807000500).
      supabase
        .from('sales_reps')
        .select('id, full_name, email, company')
        .eq('active', true)
        .order('full_name'),
    ]);
    const failed = [catalog, addresses, shipments, templates, salespeople].find((r) => r.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }
    setData({
      catalog: catalog.data ?? [],
      addresses: addresses.data ?? [],
      shipments: shipments.data ?? [],
      templates: templates.data ?? [],
      salespeople: salespeople.data ?? [],
    });
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

// ── Mutations ───────────────────────────────────────────────────────────────

export async function addAddress(fields) {
  const { data, error } = await supabase.from('addresses').insert(fields).select().single();
  return { data, error };
}

// Create a shipment header + its line items. `header` carries the derived temp
// snapshot; `items` = [{ product_code|null, custom, custom_spec, project_no, qty, description }].
// `existingShipments` is used to mint the next SMP-#### number.
export async function createShipment(header, items, existingShipments) {
  const shipment_no = nextShipmentNo(existingShipments);
  const { data: ship, error: shipErr } = await supabase
    .from('sample_shipments')
    .insert({ ...header, shipment_no })
    .select()
    .single();
  if (shipErr) return { error: shipErr };
  if (items.length) {
    const rows = items.map((it) => ({ ...it, shipment_id: ship.id }));
    const { error: itemErr } = await supabase.from('sample_shipment_items').insert(rows);
    if (itemErr) return { error: itemErr, shipment: ship };
  }
  return { shipment: ship };
}

// (updateShipmentStatus removed — status is owned by ShipStation. It is set to
// 'submitted' at creation and advanced to 'shipped' by the shipnotify writeback;
// nothing in the app writes it, so there is no path for the two systems to
// disagree. Re-adding a setter would reintroduce exactly that.)

export async function saveTemplate(fields) {
  const { error } = await supabase.from('sample_templates').insert(fields);
  return { error };
}

export async function deleteTemplate(id) {
  const { error } = await supabase.from('sample_templates').delete().eq('id', id);
  return { error };
}
