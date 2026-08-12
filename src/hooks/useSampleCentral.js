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
      // Live addresses only. A retired one still resolves for past shipments —
      // those come through the shipment's own `address:addresses!address_id`
      // embed below, which is not filtered — and for the export, which joins at
      // pull time. This list is only "what can I pick now".
      supabase.from('addresses').select('*').eq('active', true).order('nickname'),
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

// Retire, NOT edit and NOT a hard delete (migration 20260812120000).
//
// Editing was rejected deliberately: an address is copied into ShipStation at
// import, so changing it here does not change an order the co-man already
// holds. An edit control invites someone to "fix" a shipment that has already
// gone out and believe it worked. Orders are changed by telling the Dirty
// Cookie team — the site has no path to it, by design (ADR-032).
//
// A hard delete raises a foreign-key error on any address that has been used
// (the FK is NO ACTION), and would strand an order not yet pulled: the export
// joins the address at pull time, so it would fail validation and be skipped
// silently.
//
// So the row stays and `active` goes false. Gone from the picker, still intact
// for every shipment that used it.
export async function retireAddress(id) {
  const { error } = await supabase.from('addresses').update({ active: false }).eq('id', id);
  return { error };
}

// Create a shipment header + its line items. `header` carries the derived temp
// snapshot; `items` = [{ product_code|null, custom, custom_spec, project_no, qty, description }].
// `existingShipments` is used to mint the next SMP-#### number.
export async function createShipment(header, items, existingShipments) {
  // The number is minted from the CLIENT's list, so two submits a moment apart
  // compute the same one. `shipment_no` is UNIQUE, so the loser used to get a
  // raw Postgres error and lose the cart — on an action that is unrecallable
  // and, from the user's side, indistinguishable from "did it send?".
  //
  // On a duplicate (23505) we re-derive from the DATABASE rather than the stale
  // in-memory list and try again. The proper fix is to mint server-side, but
  // SHIPMENT_NO_FLOOR and the TEST- prefix live in the frontend today, and
  // moving them changes the go-live purge procedure too. This removes the
  // failure without that surgery.
  let ship = null;
  let shipErr = null;
  let candidate = nextShipmentNo(existingShipments);

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await supabase
      .from('sample_shipments')
      .insert({ ...header, shipment_no: candidate })
      .select()
      .single();
    if (!res.error) { ship = res.data; shipErr = null; break; }
    shipErr = res.error;
    // 23505 = unique_violation. Anything else is a real failure (RLS, a bad
    // FK, no connection) and retrying would just repeat it.
    if (res.error.code !== '23505') break;
    const { data: fresh } = await supabase.from('sample_shipments').select('shipment_no');
    candidate = nextShipmentNo(fresh ?? existingShipments);
  }
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

// Record (or clear) what went wrong with a shipment. Site-owned data — see
// migration 20260812150000 for why none of this goes to ShipStation.
//
// Clearing sets issue_at back to null, which is what "no issue logged" means
// everywhere else; leaving a timestamp with no flags would make the reporting
// query count a shipment that has nothing wrong with it.
export async function saveShipmentIssue(id, { flags, note }) {
  const clean = (flags || []).filter(Boolean);
  const logged = clean.length > 0 || !!(note || '').trim();
  const { error } = await supabase
    .from('sample_shipments')
    .update({
      issue_flags: clean,
      issue_note: (note || '').trim() || null,
      issue_at: logged ? new Date().toISOString() : null,
    })
    .eq('id', id);
  return { error };
}
