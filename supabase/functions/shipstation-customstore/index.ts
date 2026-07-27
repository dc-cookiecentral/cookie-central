// shipstation-customstore — ShipStation Custom Store endpoint (ADR-028).
//
// One endpoint, two actions dispatched by the `action` query param, both
// Basic-Auth protected against Vault creds:
//
//   GET  ?action=export&start_date=&end_date=&page=N
//        → emit Custom Store Orders XML for sample_shipments in the window.
//   POST ?action=shipnotify
//        → parse the ShipNotice, write tracking/carrier/service back and set
//          status = 'shipped'.
//
// Public to ShipStation (verify_jwt = false in config.toml) — it authenticates
// with HTTP Basic Auth, not a Supabase JWT. The service-role client (injected
// key) reads the Basic-Auth creds from Vault and bypasses RLS for the writeback.
//
// Deploy:  npx supabase functions deploy shipstation-customstore --no-verify-jwt

import { serviceClient } from '../_shared/supabase.ts';
import { getSecret } from '../_shared/vault.ts';
import {
  buildOrderXml,
  checkBasicAuth,
  ordersDocument,
  parseSSDate,
  tagValue,
  validState,
  validZip,
  type Shipment,
} from '../_shared/shipstation.ts';

const PAGE_SIZE = 100;
const SELECT =
  '*, salesperson:salesperson_user_id ( email, full_name ), address:address_id ( * ), sample_shipment_items ( * )';

function xml(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const supabase = serviceClient();

  try {
    // ── Basic Auth against Vault ──────────────────────────────────────────
    const [user, pass] = await Promise.all([
      getSecret(supabase, 'SHIPSTATION_CUSTOMSTORE_USER'),
      getSecret(supabase, 'SHIPSTATION_CUSTOMSTORE_PASS'),
    ]);
    if (!user || !pass) {
      return xml('<Error>Custom Store credentials not configured in Vault.</Error>', 500);
    }
    if (!checkBasicAuth(req, user, pass)) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="shipstation-customstore"' },
      });
    }

    // ── Export ────────────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'export') {
      const startISO = parseSSDate(url.searchParams.get('start_date'));
      const endISO = parseSSDate(url.searchParams.get('end_date'));
      const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
      const from = (page - 1) * PAGE_SIZE;

      // Window on updated_at (== LastModified): covers both new orders and
      // re-imports of modified ones. ShipStation pages via `page`/`pages`.
      let q = supabase
        .from('sample_shipments')
        .select(SELECT, { count: 'exact' })
        .order('updated_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (startISO) q = q.gte('updated_at', startISO);
      if (endISO) q = q.lte('updated_at', endISO);

      const { data, count, error } = await q;
      if (error) return xml(`<Error>${error.message}</Error>`, 500);

      const orders: string[] = [];
      for (const s of (data ?? []) as Shipment[]) {
        const addr = s.address ?? {};
        // ShipStation silently rejects a malformed State/PostalCode and the pull
        // model surfaces no per-order error — so validate here, skip+log a bad
        // row rather than poisoning the batch.
        if (!validState(addr.state) || !validZip(addr.zip)) {
          console.error(
            `shipstation export: skipping ${s.shipment_no} — invalid ship-to State/zip (state=${addr.state ?? ''}, zip=${addr.zip ?? ''})`,
          );
          continue;
        }
        orders.push(buildOrderXml(s));
      }

      const pages = Math.max(1, Math.ceil((count ?? orders.length) / PAGE_SIZE));
      return xml(ordersDocument(orders, pages));
    }

    // ── ShipNotify writeback ──────────────────────────────────────────────
    if (req.method === 'POST' && action === 'shipnotify') {
      const body = await req.text();
      // Prefer the ShipNotice body; fall back to query params ShipStation may
      // also pass. OrderNumber == sample_shipments.shipment_no.
      const orderNumber =
        tagValue(body, 'OrderNumber') ?? url.searchParams.get('order_number');
      const tracking =
        tagValue(body, 'TrackingNumber') ?? url.searchParams.get('tracking_number');
      const carrier = tagValue(body, 'Carrier') ?? url.searchParams.get('carrier');
      const service = tagValue(body, 'Service');
      const shipDate = parseSSDate(tagValue(body, 'ShipDate'));

      if (!orderNumber) {
        console.error('shipstation shipnotify: no OrderNumber in body or query.');
        return xml('<Response>warning: no OrderNumber</Response>', 200);
      }

      const { data: match, error: findErr } = await supabase
        .from('sample_shipments')
        .select('id, shipment_no')
        .eq('shipment_no', orderNumber)
        .maybeSingle();
      if (findErr) return xml(`<Error>${findErr.message}</Error>`, 500);

      // Unmatched OrderNumber → log + 200-with-warning, never silently drop the
      // tracking update (ADR-028 limitation #5).
      if (!match) {
        console.error(`shipstation shipnotify: no shipment matches OrderNumber '${orderNumber}'.`);
        return xml(`<Response>warning: no shipment '${orderNumber}'</Response>`, 200);
      }

      const { error: updErr } = await supabase
        .from('sample_shipments')
        .update({
          tracking_number: tracking ?? null,
          carrier: carrier ?? null,
          service: service ?? null,
          shipped_at: shipDate ?? new Date().toISOString(),
          status: 'shipped',
        })
        .eq('id', match.id);
      if (updErr) return xml(`<Error>${updErr.message}</Error>`, 500);

      return xml('<Response>success</Response>', 200);
    }

    return xml('<Error>Unknown action — expected export (GET) or shipnotify (POST).</Error>', 400);
  } catch (e) {
    console.error('shipstation-customstore:', (e as Error)?.message ?? e);
    return xml(`<Error>${String((e as Error)?.message ?? e)}</Error>`, 500);
  }
});
