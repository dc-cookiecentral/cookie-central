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
import { SS_ACTIVE_BUCKETS, SS_SCAN_BUCKETS, syncedStatus } from '../_shared/shipstation.ts';

const SS = 'https://api.shipstation.com';

// Orders whose ShipStation state we still track. `cancelled`/`on_hold` are here
// so an order can be RESTORED when ShipStation releases it — without them the
// sweep would latch on the first exception and never look again.
// `shipped`/`delivered` are excluded: shipnotify owns those.
const TRACKED_STATUSES = ['submitted', 'processing', 'cancelled', 'on_hold'];

// A deadline only matters while the order is still to be fulfilled.
const OPEN_STATUSES = ['submitted', 'processing'];

type Row = {
  shipment_no: string;
  required_by: string | null;
  status: string;
  // The V2 shipment_id, cached on first sight. Its whole purpose is to let a
  // steady-state sweep skip the bucket scan entirely — see shipmentsByNo.
  shipstation_order_id: string | null;
};

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

// The cancelled bucket grows without bound (1,675 and counting), so this is a
// real ceiling, not a formality — breaching it is reported, never swallowed.
const MAX_PAGES = 30;

/**
 * Fetch one shipment by its cached id. This is the cheap path and the reason
 * `shipstation_order_id` is stored: the single-shipment GET carries both
 * `shipment_status` (the bucket) and `deliver_by_date`, which is everything the
 * sweep needs. One call per tracked order, no paging, no unbounded history.
 */
async function shipmentById(key: string, id: string): Promise<Found | null> {
  const r = await ss(key, 'GET', `/v2/shipments/${id}`);
  // A 404 means the record is gone (ShipStation destroys shipment records when
  // an order leaves Awaiting Shipment — ADR-039). Fall back to the scan rather
  // than treating it as "absent from ShipStation", which would be a silent lie.
  if (!r.ok) return null;
  const s = r.body as Record<string, string | null>;
  if (!s?.shipment_status) return null;
  return {
    id,
    deliverBy: s.deliver_by_date ?? null,
    storeId: s.store_id ?? null,
    bucket: s.shipment_status,
  };
}

/**
 * Scan the buckets — but only for the orders we could not resolve by id, and
 * only until they are all found.
 *
 * This is what stops the sweep growing with the account. `cancelled` alone is
 * 1,675 and climbing, `label_purchased` 83k; paging them every 15 minutes was a
 * dead end (~17s against a 30s timeout). In steady state `wanted` is empty and
 * this whole function is skipped.
 *
 * The early exit is safe because an unresolved order is, by definition, one we
 * have never seen — i.e. a fresh import, which lands in `pending`, the first
 * bucket. It cannot simultaneously be a historical cancellation. Orders we HAVE
 * seen are resolved by id above, where the GET reports their true current
 * status, so bucket precedence no longer depends on scan order for them.
 */
async function shipmentsByNo(key: string, truncated: string[], wanted: Set<string>) {
  const map = new Map<string, Found>();
  if (wanted.size === 0) return map;
  for (const bucket of SS_SCAN_BUCKETS) {
    if (wanted.size === 0) break;
    // ⚠️ The `cancelled` bucket is unbounded and already in the thousands. If we
    // stop early we silently miss orders and report a clean sweep, so the cap is
    // generous AND breaching it is surfaced rather than swallowed.
    let page = 1;
    for (; page <= MAX_PAGES; page++) {
      const r = await ss(key, 'GET', `/v2/shipments?shipment_status=${bucket}&page=${page}&page_size=100`);
      if (!r.ok) throw new Error(`list ${bucket} p${page}: HTTP ${r.status} ${r.text.slice(0, 300)}`);
      const b = r.body as { shipments?: Array<Record<string, string | null>>; pages?: number };
      for (const s of b.shipments ?? []) {
        if (!s.shipment_number || !s.shipment_id) continue;
        // Only the orders we are actually looking for. The buckets hold the
        // co-man's whole history — 1,640 in `cancelled` alone, almost none of
        // them ours — and an unfiltered map means the caller iterates all of
        // them. That cost a 2-minute run (one no-op UPDATE per foreign
        // shipment) against a 30s cron timeout.
        if (!wanted.has(s.shipment_number)) continue;
        // An order can appear in more than one bucket over its life; the LAST
        // write wins, and SS_SYNCED_BUCKETS is ordered active-first so an
        // exception bucket (on_hold / cancelled) takes precedence.
        map.set(s.shipment_number, {
          id: s.shipment_id,
          deliverBy: s.deliver_by_date ?? null,
          storeId: s.store_id ?? null,
          bucket,
        });
        wanted.delete(s.shipment_number);
      }
      // Stop the moment every wanted order is accounted for — the remaining
      // pages of `cancelled` hold nothing we are looking for.
      if (wanted.size === 0) { page = 0; break; }
      if (page >= (b.pages ?? 1)) { page = 0; break; }
    }
    if (page !== 0) truncated.push(bucket);
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
      .select('shipment_no, required_by, status, shipstation_order_id')
      .in('status', TRACKED_STATUSES);
    if (error) return json({ error: `read sample_shipments: ${error.message}` }, 500);

    const rows = (data ?? []) as Row[];
    if (!rows.length) return json({ ok: true, considered: 0, updated: 0, note: 'nothing to track' });

    // ── Resolve each order to its ShipStation shipment ──────────────────────
    // Cached id first (one cheap GET), bucket scan only for what is left over.
    const pending = new Map<string, Found>();
    const unresolved = new Set<string>();
    let byId = 0;
    for (const row of rows) {
      if (!row.shipstation_order_id) { unresolved.add(row.shipment_no); continue; }
      const found = await shipmentById(key, row.shipstation_order_id);
      // A stale id (record destroyed, or never valid) must fall back to the
      // scan, not be reported as "not yet imported".
      if (found) { pending.set(row.shipment_no, found); byId++; }
      else unresolved.add(row.shipment_no);
    }

    const truncated: string[] = [];
    const scanned = await shipmentsByNo(key, truncated, unresolved);
    for (const [no, found] of scanned) pending.set(no, found);

    // Cache every id learned this run so the scan shrinks toward zero. Failure
    // here is not fatal — it only costs a rescan next time.
    const learned: string[] = [];
    for (const [no, found] of scanned) {
      const { error: idErr } = await supabase
        .from('sample_shipments')
        .update({ shipstation_order_id: found.id })
        .eq('shipment_no', no);
      if (idErr) console.error(`shipstation-deliverby: cache id ${no}: ${idErr.message}`);
      else learned.push(no);
    }

    if (truncated.length) {
      // Loud on purpose: a truncated scan makes "no status changes" a lie.
      console.error(`shipstation-deliverby: TRUNCATED scan of ${truncated.join(', ')} — results incomplete`);
    }

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
      `already=${alreadyCorrect} not-yet-imported=${notYetImported} ` +
      `by-id=${byId} scanned=${scanned.size} learned=${learned.length} failed=${failed.length}`,
    );
    return json({
      ok: true,
      considered: rows.length,
      updated: updated.length,
      updated_orders: updated,
      already_correct: alreadyCorrect,
      not_yet_imported: notYetImported,
      status_changes: statusChanges,
      truncated_buckets: truncated,
      stores: byStore,
      // resolved_by_id should climb to `considered` and scanned should fall to
      // 0 within a run or two. If scanned stays high, ids are not sticking and
      // the sweep is still paging history every run — the thing this fixes.
      resolved_by_id: byId,
      scanned: scanned.size,
      ids_learned: learned.length,
      failed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`shipstation-deliverby: ${msg}`);
    return json({ error: msg }, 500);
  }
});
