// shipstation-deliverby — stamp each sample shipment's deliver-by date onto
// ShipStation's native Deliver By field, so the co-man can sort and filter the
// Orders grid by deadline (and rule on imminent ones).
//
// Why this exists as a separate outbound sweep rather than part of the export:
// the Custom Store is a *pull*. ShipStation fetches orders on its own schedule,
// and the V2 shipment row we need to write to does not exist until after that
// import lands. So there is nothing to PUT to at submit time. This runs on a
// 15-minute cron, finds orders whose Deliver By is missing or stale, and fixes
// them. The XML export is untouched, and no automation rule is disturbed.
//
// Idempotent by comparison, not by bookkeeping: it reads the current
// deliver_by_date off ShipStation and skips anything already correct, so there
// is no local "pushed" flag to drift out of sync. Safe to run as often as you
// like; a no-op sweep costs one list call.
//
// Invoked two ways, both satisfying verify_jwt:
//   - the pg_cron job (net.http_post → service-role bearer)
//   - manually, for testing (supabase.functions.invoke → admin JWT)
//
// Deploy:  npx supabase functions deploy shipstation-deliverby

import { serviceClient } from '../_shared/supabase.ts';
import { getSecret } from '../_shared/vault.ts';
import { handleCors, json } from '../_shared/cors.ts';

const SS = 'https://api.shipstation.com';

// Orders still in the co-man's queue. Once shipped, the deadline is moot.
const OPEN_STATUSES = ['submitted', 'processing'];

type Row = { shipment_no: string; required_by: string };

/** ShipStation returns '2026-08-21T00:00:00Z'; we hold a plain date. Compare days. */
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

async function ss(key: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${SS}${path}`, {
    method,
    headers: { 'API-Key': key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error body; keep the raw text for the log
  }
  return { ok: res.ok, status: res.status, body: parsed, text };
}

/**
 * Every shipment ShipStation currently holds in `pending` — i.e. imported but
 * not yet shipped, keyed by our SMP-#### .
 *
 * That number lives in **`shipment_number`**, not `order_number` — verified
 * against the live account, where `order_number` is absent entirely and
 * `external_order_id` is null. It also appears only in this *list* response,
 * not in the single-shipment GET, which is why the mapping happens here.
 */
async function pendingByShipmentNo(key: string) {
  const map = new Map<string, { id: string; deliverBy: string | null; storeId: string | null }>();
  for (let page = 1; page <= 20; page++) {
    const r = await ss(key, 'GET', `/v2/shipments?shipment_status=pending&page=${page}&page_size=100`);
    if (!r.ok) throw new Error(`list shipments p${page}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
    const b = r.body as { shipments?: Array<Record<string, string | null>>; pages?: number };
    for (const s of b.shipments ?? []) {
      if (s.shipment_number && s.shipment_id) {
        map.set(s.shipment_number, {
          id: s.shipment_id,
          deliverBy: s.deliver_by_date ?? null,
          storeId: s.store_id ?? null,
        });
      }
    }
    if (page >= (b.pages ?? 1)) break;
  }
  return map;
}

/** GET → set the one field → PUT the whole object back. Verified to preserve
 *  items, ship_to, internal_notes, service and warehouse. */
async function setDeliverBy(key: string, shipmentId: string, date: string) {
  const cur = await ss(key, 'GET', `/v2/shipments/${shipmentId}`);
  if (!cur.ok) throw new Error(`GET ${shipmentId}: HTTP ${cur.status} ${cur.text.slice(0, 200)}`);

  const shipment: Record<string, unknown> = {
    ...(cur.body as Record<string, unknown>),
    deliver_by_date: `${date}T00:00:00.000Z`,
  };
  // Server-owned; PUTting them back is at best noise, at worst a 400.
  for (const k of ['shipment_id', 'created_at', 'modified_at', 'shipment_status']) delete shipment[k];

  const put = await ss(key, 'PUT', `/v2/shipments/${shipmentId}`, shipment);
  if (!put.ok) throw new Error(`PUT ${shipmentId}: HTTP ${put.status} ${put.text.slice(0, 300)}`);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const supabase = serviceClient();
    const key = await getSecret(supabase, 'SHIPSTATION_V2_API_KEY');
    if (!key) return json({ error: 'SHIPSTATION_V2_API_KEY missing from Vault' }, 500);

    const { data, error } = await supabase
      .from('sample_shipments')
      .select('shipment_no, required_by')
      .not('required_by', 'is', null)
      .in('status', OPEN_STATUSES);
    if (error) return json({ error: `read sample_shipments: ${error.message}` }, 500);

    const rows = (data ?? []) as Row[];
    if (!rows.length) return json({ ok: true, considered: 0, updated: 0, note: 'no open orders with a deliver-by date' });

    const pending = await pendingByShipmentNo(key);

    const updated: string[] = [];
    const failed: Array<{ shipment_no: string; error: string }> = [];
    let notYetImported = 0;
    let alreadyCorrect = 0;

    for (const row of rows) {
      const match = pending.get(row.shipment_no);
      // Not an error: ShipStation simply hasn't pulled it yet. Next sweep gets it.
      if (!match) { notYetImported++; continue; }
      if (day(match.deliverBy) === row.required_by) { alreadyCorrect++; continue; }

      try {
        await setDeliverBy(key, match.id, row.required_by);
        updated.push(row.shipment_no);
      } catch (e) {
        // One bad order must not strand the rest of the sweep.
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`shipstation-deliverby: ${row.shipment_no}: ${msg}`);
        failed.push({ shipment_no: row.shipment_no, error: msg });
      }
    }

    const byStore: Record<string, number> = {};
    for (const row of rows) {
      const m = pending.get(row.shipment_no);
      if (!m) continue;
      const k = m.storeId ?? '(none)';
      byStore[k] = (byStore[k] ?? 0) + 1;
    }

    console.log(
      `shipstation-deliverby: stores=${JSON.stringify(byStore)} considered=${rows.length} updated=${updated.length} ` +
      `already=${alreadyCorrect} not-yet-imported=${notYetImported} failed=${failed.length}`,
    );
    return json({
      ok: true,
      considered: rows.length,
      updated: updated.length,
      updated_orders: updated,
      already_correct: alreadyCorrect,
      not_yet_imported: notYetImported,
      stores: byStore,
      failed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`shipstation-deliverby: ${msg}`);
    return json({ error: msg }, 500);
  }
});
