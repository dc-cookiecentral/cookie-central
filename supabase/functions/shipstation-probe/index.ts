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
    const {
      shipment_no: shipmentNo, raw, export_hours: exportHours,
      capabilities, tracking_number: trackingNumber, carrier_code: carrierCode,
    } = await req.json().catch(() => ({}));

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

    // capabilities: which V2 surfaces does this account's plan actually expose?
    // ADR-034 recorded /v2/tracking as 401 "gated behind a billing-plan upgrade",
    // which is the sole reason `delivered` was written off as unreachable. That
    // was one observation on one day and it has never been re-tested — and 401 is
    // an AUTH code, not an entitlement one (403), so the original reading may
    // simply have been wrong. Everything here is a GET; nothing is created.
    if (capabilities) {
      const key = await getSecret(supabase, 'SHIPSTATION_V2_API_KEY');
      if (!key) return json({ error: 'SHIPSTATION_V2_API_KEY missing from Vault' }, 500);

      // Probe against a REAL tracking number — a synthetic one can 404 for
      // reasons that have nothing to do with entitlement, which would muddy
      // exactly the question being asked.
      let tn = trackingNumber ?? null;
      let cc = carrierCode ?? null;
      if (!tn) {
        const { data } = await supabase
          .from('sample_shipments')
          .select('tracking_number, carrier')
          .not('tracking_number', 'is', null)
          .order('shipped_at', { ascending: false })
          .limit(1);
        if (data?.length) {
          tn = data[0].tracking_number as string;
          // ShipNotice sends a display name ("UPS"); tracking wants a code.
          const c = String(data[0].carrier ?? '').toLowerCase();
          cc = /usps|stamps|endicia/.test(c) ? 'stamps_com'
            : /fedex/.test(c) ? 'fedex'
            : /dhl/.test(c) ? 'dhl_express'
            : /ups/.test(c) ? 'ups'
            : null;
        }
      }

      const probes: Array<{ what: string; path: string }> = [
        { what: 'baseline (key works at all)', path: '/v2/carriers' },
        { what: 'webhook subscriptions', path: '/v2/environment/webhooks' },
        { what: 'webhook subscriptions (alt path)', path: '/v2/webhooks' },
      ];
      if (tn && cc) {
        probes.push({
          what: 'tracking — the delivered question',
          path: `/v2/tracking?carrier_code=${encodeURIComponent(cc)}&tracking_number=${encodeURIComponent(tn)}`,
        });
      }

      const results = [];
      for (const p of probes) {
        const r = await ss(key, p.path);
        results.push({
          what: p.what,
          path: p.path.replace(/tracking_number=[^&]*/, 'tracking_number=…'),
          http_status: r.status,
          ok: r.ok,
          // The body is where an entitlement message actually explains itself;
          // the status code alone is what caused the original misreading.
          body: r.ok
            ? (Array.isArray((r.body as Record<string, unknown>)?.carriers)
                ? `ok — ${((r.body as Record<string, unknown>).carriers as unknown[]).length} carriers`
                : r.body)
            : ((r.body ?? (r as { text?: string }).text ?? null)),
        });
      }
      // The per-LABEL tracking endpoint. This is a DIFFERENT surface from the
      // /v2/tracking GET above, and it is the one that matters: the V2 release
      // notes list only `POST /v2/tracking/stop` under /v2/tracking, so that
      // GET is ShipEngine's, not part of ShipStation V2 at all. The recurring
      // 401 therefore says "not offered here", not "upgrade your plan" — which
      // is what ADR-034 and every note since have assumed.
      //
      // Two hops, because we store a tracking number and the endpoint wants a
      // label id: /v2/labels?tracking_number= → label_id → /v2/labels/{id}/track.
      // Both GETs. `status_code: 'DE'` is the delivered signal.
      if (tn) {
        const list = await ss(key, `/v2/labels?tracking_number=${encodeURIComponent(tn)}`);
        const labels = (list.body as { labels?: Array<Record<string, unknown>> })?.labels ?? [];
        const labelId = labels.length ? String(labels[0].label_id ?? '') : null;
        results.push({
          what: 'labels by tracking number (finds label_id)',
          path: '/v2/labels?tracking_number=…',
          http_status: list.status,
          ok: list.ok,
          body: list.ok
            ? {
                label_count: labels.length,
                label_id: labelId,
                tracking_status: labels[0]?.tracking_status ?? null,
              }
            : (list.body ?? (list as { text?: string }).text ?? null),
        });

        if (labelId) {
          const trk = await ss(key, `/v2/labels/${encodeURIComponent(labelId)}/track`);
          const b = trk.body as Record<string, unknown> | null;
          results.push({
            what: 'label track — THE delivered source',
            path: `/v2/labels/${labelId}/track`,
            http_status: trk.status,
            ok: trk.ok,
            body: trk.ok
              ? {
                  status_code: b?.status_code ?? null,               // DE = delivered
                  status_description: b?.status_description ?? null,
                  status_detail_code: b?.status_detail_code ?? null,
                  carrier_status_description: b?.carrier_status_description ?? null,
                  estimated_delivery_date: b?.estimated_delivery_date ?? null,
                  actual_delivery_date: b?.actual_delivery_date ?? null,
                  event_count: Array.isArray(b?.events) ? (b.events as unknown[]).length : null,
                }
              : (b ?? (trk as { text?: string }).text ?? null),
          });
        }
      }

      return json({ probed_with: { tracking_number: tn ? `${tn.slice(0, 6)}…` : null, carrier_code: cc }, results });
    }

    if (!shipmentNo) return json({ error: 'pass { "shipment_no": "SMP-…" }, { "export_hours": 6 } or { "capabilities": true }' }, 400);
    const key = await getSecret(supabase, 'SHIPSTATION_V2_API_KEY');
    if (!key) return json({ error: 'SHIPSTATION_V2_API_KEY missing from Vault' }, 500);


    for (const bucket of BUCKETS) {
      // Buckets like `cancelled` run to thousands; stopping early would report a
      // false "not found" that reads as authoritative.
      for (let page = 1; page <= 30; page++) {
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
