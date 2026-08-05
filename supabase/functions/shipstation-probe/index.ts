// shipstation-probe — READ-ONLY inspector for a single ShipStation shipment.
//
// Exists because the ShipStation V2 key lives in Vault (service-role only), so
// there is no way to inspect the account from a laptop. Without this, verifying
// anything ShipStation-side means asking a human to read the dashboard — which
// is exactly the kind of assumption that has bitten this project repeatedly.
//
// Makes NO writes. Ever. If you need to change something, use the sweep or add a
// deliberate, separately-named function.
//
//   POST { "shipment_no": "SMP-TEST-1051" }        → key fields
//   POST { "shipment_no": "...", "raw": true }     → the whole shipment object
//
// A shipment is looked up across every status bucket, not just `pending` — the
// whole point of some probes is to detect that an order MOVED bucket.
//
// Deploy:  npx supabase functions deploy shipstation-probe

import { serviceClient } from '../_shared/supabase.ts';
import { getSecret } from '../_shared/vault.ts';
import { handleCors, json } from '../_shared/cors.ts';

const SS = 'https://api.shipstation.com';

// Valid values for ?shipment_status=. `shipped` and `delivered` are NOT among
// them — V2's enum is label-lifecycle, not delivery (ADR-034).
const BUCKETS = ['pending', 'processing', 'label_purchased', 'on_hold', 'cancelled'];

async function ss(key: string, path: string) {
  const res = await fetch(`${SS}${path}`, { headers: { 'API-Key': key } });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, body: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, body: null as unknown, text };
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { shipment_no: shipmentNo, raw, export_hours: exportHours } = await req.json().catch(() => ({}));

    const supabase = serviceClient();

    // export_hours: call OUR OWN export exactly as ShipStation does, over a
    // window of the last N hours, and report which orders it would hand over.
    // This distinguishes "ShipStation never fetched it" from "ShipStation
    // fetched it and ignored the change" — indistinguishable from the outside.
    if (exportHours) {
      const user = await getSecret(supabase, 'SHIPSTATION_CUSTOMSTORE_USER');
      const pass = await getSecret(supabase, 'SHIPSTATION_CUSTOMSTORE_PASS');
      if (!user || !pass) return json({ error: 'custom store creds missing from Vault' }, 500);

      const pad = (n: number) => String(n).padStart(2, '0');
      const fmt = (d: Date) =>
        `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
      const end = new Date();
      const start = new Date(end.getTime() - Number(exportHours) * 3600_000);

      const base = Deno.env.get('SUPABASE_URL');
      const url = `${base}/functions/v1/shipstation-customstore?action=export` +
        `&start_date=${encodeURIComponent(fmt(start))}&end_date=${encodeURIComponent(fmt(end))}&page=1`;
      const res = await fetch(url, { headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` } });
      const xml = await res.text();
      const numbers = [...xml.matchAll(/<OrderNumber>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/OrderNumber>/g)].map((m) => m[1]);
      const statuses = [...xml.matchAll(/<OrderStatus>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/OrderStatus>/g)].map((m) => m[1]);
      return json({
        export_window: { start: fmt(start), end: fmt(end) },
        http_status: res.status,
        order_count: numbers.length,
        orders: numbers.map((n, i) => ({ order: n, status: statuses[i] ?? null })),
      });
    }

    if (!shipmentNo) return json({ error: 'pass { "shipment_no": "SMP-…" } or { "export_hours": 6 }' }, 400);
    const key = await getSecret(supabase, 'SHIPSTATION_V2_API_KEY');
    if (!key) return json({ error: 'SHIPSTATION_V2_API_KEY missing from Vault' }, 500);


    for (const bucket of BUCKETS) {
      for (let page = 1; page <= 10; page++) {
        const r = await ss(key, `/v2/shipments?shipment_status=${bucket}&page=${page}&page_size=100`);
        if (!r.ok) break;
        const b = r.body as { shipments?: Array<Record<string, unknown>>; pages?: number };
        const hit = (b.shipments ?? []).find((s) => s.shipment_number === shipmentNo);
        if (hit) {
          if (raw) return json({ found_in: bucket, shipment: hit });
          return json({
            found_in: bucket,
            shipment_id: hit.shipment_id,
            shipment_number: hit.shipment_number,
            shipment_status: hit.shipment_status,
            store_id: hit.store_id,
            deliver_by_date: hit.deliver_by_date,
            ship_by_date: hit.ship_by_date,
            internal_notes: hit.internal_notes,
            notes_from_buyer: hit.notes_from_buyer,
            tags: hit.tags,
            service_code: hit.service_code,
            items: (hit.items as Array<Record<string, unknown>> ?? []).map((i) => ({
              sku: i.sku, name: i.name, quantity: i.quantity,
            })),
            modified_at: hit.modified_at,
          });
        }
        if (page >= (b.pages ?? 1)) break;
      }
    }
    return json({ found_in: null, note: `no shipment numbered ${shipmentNo} in: ${BUCKETS.join(', ')}` }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
