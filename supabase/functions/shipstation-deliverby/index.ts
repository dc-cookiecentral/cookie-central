// shipstation-deliverby — the 15-minute reconciliation sweep. Two jobs, one
// pass over ShipStation's shipment list:
//
//   1. OUTBOUND — stamp each sample's deliver-by date onto ShipStation's native
//      Deliver By field, so the co-man can sort and filter the Orders grid by
//      deadline (and rule on imminent ones).
//   2. INBOUND  — bring `cancelled` / `on_hold` back to the site. ShipStation
//      owns fulfilment state; without this a cancelled order shows as awaiting
//      fulfilment forever and a salesperson chases a shipment that is gone.
//
// The two directions do not conflict: the site is authoritative for the DATE,
// ShipStation is authoritative for the STATE.
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
import { SS_ACTIVE_BUCKETS, SS_SYNCED_BUCKETS, syncedStatus } from '../_shared/shipstation.ts';

const SS = 'https://api.shipstation.com';

// Orders whose ShipStation state we still track. `cancelled`/`on_hold` are here
// so an order can be RESTORED when ShipStation releases it — without them the
// sweep would latch on the first exception and never look again.
// `shipped`/`delivered` are excluded: shipnotify owns those.
const TRACKED_STATUSES = ['submitted', 'processing', 'cancelled', 'on_hold'];

// A deadline only matters while the order is still to be fulfilled.
const OPEN_STATUSES = ['submitted', 'processing'];

type Row = { shipment_no: string; required_by: string | null; status: string };

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
type Found = { id: string; deliverBy: string | null; storeId: string | null; bucket: string };

async function shipmentsByNo(key: string) {
  const map = new Map<string, Found>();
  for (const bucket of SS_SYNCED_BUCKETS) {
    for (let page = 1; page <= 20; page++) {
      const r = await ss(key, 'GET', `/v2/shipments?shipment_status=${bucket}&page=${page}&page_size=100`);
      if (!r.ok) throw new Error(`list ${bucket} p${page}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
      const b = r.body as { shipments?: Array<Record<string, string | null>>; pages?: number };
      for (const s of b.shipments ?? []) {
        if (!s.shipment_number || !s.shipment_id) continue;
        // An order can appear in more than one bucket over its life; the LAST
        // write wins, and SS_SYNCED_BUCKETS is ordered active-first so an
        // exception bucket (on_hold / cancelled) takes precedence.
        map.set(s.shipment_number, {
          id: s.shipment_id,
          deliverBy: s.deliver_by_date ?? null,
          storeId: s.store_id ?? null,
          bucket,
        });
      }
      if (page >= (b.pages ?? 1)) break;
    }
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
      .select('shipment_no, required_by, status')
      .in('status', TRACKED_STATUSES);
    if (error) return json({ error: `read sample_shipments: ${error.message}` }, 500);

    const rows = (data ?? []) as Row[];
    if (!rows.length) return json({ ok: true, considered: 0, updated: 0, note: 'nothing to track' });

    const pending = await shipmentsByNo(key);

    const updated: string[] = [];
    const statusChanges: Array<{ shipment_no: string; from: string; to: string }> = [];
    const failed: Array<{ shipment_no: string; error: string }> = [];
    let notYetImported = 0;
    let alreadyCorrect = 0;

    for (const row of rows) {
      const match = pending.get(row.shipment_no);

      // ── 1. Status sync. ShipStation owns fulfilment state. ──
      const next = syncedStatus(match?.bucket ?? null, row.status);
      if (next) {
        const { error: upErr } = await supabase
          .from('sample_shipments')
          .update({ status: next })
          .eq('shipment_no', row.shipment_no);
        if (upErr) {
          failed.push({ shipment_no: row.shipment_no, error: `status → ${next}: ${upErr.message}` });
        } else {
          statusChanges.push({ shipment_no: row.shipment_no, from: row.status, to: next });
          row.status = next;
        }
      }

      // ── 2. Deliver By. Only for orders still awaiting fulfilment. ──
      if (!row.required_by || !OPEN_STATUSES.includes(row.status)) continue;
      // Not an error: ShipStation simply hasn't pulled it yet. Next sweep gets it.
      if (!match) { notYetImported++; continue; }
      // A cancelled or held order's deadline is moot, and it may not be writable.
      if (!SS_ACTIVE_BUCKETS.includes(match.bucket)) continue;
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
      `status-changes=${JSON.stringify(statusChanges)} ` +
      `already=${alreadyCorrect} not-yet-imported=${notYetImported} failed=${failed.length}`,
    );
    return json({
      ok: true,
      considered: rows.length,
      updated: updated.length,
      updated_orders: updated,
      already_correct: alreadyCorrect,
      not_yet_imported: notYetImported,
      status_changes: statusChanges,
      stores: byStore,
      failed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`shipstation-deliverby: ${msg}`);
    return json({ error: msg }, 500);
  }
});
