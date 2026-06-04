import { useParams, useNavigate } from 'react-router-dom';
import Pill from '../components/Pill';
import FulfillmentTimeline from '../components/FulfillmentTimeline';
import { OriginalVsCurrent, ChangeHistory } from '../components/PoChangeHistory';
import { DeliveryLots } from '../components/PoDeliveryLots';
import { usePurchaseOrder, usePoChanges, usePurchaseOrders } from '../hooks/usePurchaseOrders';
import { useRetailerFilter } from '../contexts/RetailerFilterContext';
import { useUOM } from '../contexts/UOMContext';
import DetailPager from '../components/DetailPager';
import { formatDate } from '../utils/dates';

const TH = 'px-2 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

// Rule-based fallback: derives a one-liner from observable PO state (NOVA edits,
// ship-date shifts, lateness vs MABD, missing BOL) so the card never reads empty
// before any email has been ingested for this PO.
function stateFindings(order) {
  const findings = [];
  if (order.nova_changes) findings.push(`NOVA edit on file: ${order.nova_changes}`);
  if (order.ship_date_original && order.ship_date_actual && order.ship_date_original !== order.ship_date_actual) {
    findings.push('Ship date moved from original — track carrier handoff.');
  }
  if (order.ship_status === 'pending' && order.ship_date_original) {
    const days = Math.round((new Date(order.ship_date_original) - new Date()) / 86400000);
    if (days <= 3) findings.push(`Ships in ${days}d — confirm pallets ready.`);
  }
  if (order.payment_status === 'awaiting_retailer' || order.payment_status === 'awaiting_walmart') {
    findings.push('Retailer payment overdue — confirm invoice with Cortina.');
  }
  if (!findings.length) findings.push('No anomalies detected from current PO state.');
  return findings;
}

// Live findings synthesized from the AI agent's email extractions
// (po_emails.extracted_data). Walks the thread newest-first so the most recent
// value wins per field, and surfaces any flagged anomalies.
function liveFindings(order, emails) {
  const withData = emails.filter((e) => e.extracted_data && Object.keys(e.extracted_data).length);
  if (!withData.length) return null;

  const findings = [];
  const seen = (k) => withData.find((e) => e.extracted_data[k] != null)?.extracted_data[k];

  const carrier = seen('carrier');
  if (carrier && carrier !== order.carrier) findings.push(`Carrier per email: ${carrier}.`);
  const shipDate = seen('ship_date');
  if (shipDate && order.mabd && new Date(shipDate) > new Date(order.mabd)) {
    findings.push(`Email ship date ${shipDate} is after MABD ${order.mabd} — at risk.`);
  }
  const lotTotal = withData.reduce((n, e) => n + (Number(e.extracted_data.lots) || 0), 0);
  if (lotTotal) findings.push(`${lotTotal} finished-good lot(s) reported across delivery emails.`);

  const anomalies = withData.flatMap((e) =>
    Array.isArray(e.extracted_data.anomalies) ? e.extracted_data.anomalies : []
  );
  for (const a of anomalies.slice(0, 3)) findings.push(`⚠ ${a}`);

  if (!findings.length) {
    // Extraction exists but nothing notable — show the latest summary instead.
    const latest = withData[withData.length - 1];
    if (latest?.summary) findings.push(latest.summary);
  }
  return findings.length ? findings : null;
}

// Phase 2: pull from real email extraction when available, else fall back to the
// PO-state heuristics. `emails` already carries extracted_data (usePurchaseOrder).
function AIInsightCard({ order, emails }) {
  const live = liveFindings(order, emails);
  const findings = live ?? stateFindings(order);
  return (
    <div className="px-[18px] pb-3">
      <div className="bg-gradient-to-br from-pink-100 to-violet-100 rounded-xl px-3 py-2">
        <div className="text-[10px] font-bold text-pk uppercase tracking-wider mb-0.5">
          AI Insight{' '}
          <span className="text-[8px] text-md font-medium normal-case">
            {live ? `— from ${emails.length} email${emails.length === 1 ? '' : 's'}` : '— from PO state'}
          </span>
        </div>
        <div className="text-[10px] text-md leading-snug space-y-0.5">
          {findings.map((f, i) => (
            <div key={i}>{f}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PurchaseOrderDetail() {
  const { poNumber } = useParams();
  const navigate = useNavigate();
  const { order, loading, error } = usePurchaseOrder(poNumber);
  const { changes, loading: changesLoading } = usePoChanges(order?.id);
  const { uom, format } = useUOM();
  // Ordered list for the prev/next pager — matches the Product Orders view
  // (urgency sort + retailer filter); falls back to the unfiltered list if the
  // current PO isn't in the filtered view (e.g. opened directly).
  const { orders } = usePurchaseOrders();
  const { filter } = useRetailerFilter();
  const filteredKeys = filter(orders, 'retailer').map((o) => o.po_number);
  const orderKeys = filteredKeys.includes(poNumber) ? filteredKeys : orders.map((o) => o.po_number);

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading…</div>;
  if (error) return <div className="text-sm text-red-600 py-10 text-center">{error}</div>;
  if (!order)
    return (
      <div className="py-10 text-center">
        <div className="text-sm text-md mb-2">PO {poNumber} not found.</div>
        <button onClick={() => navigate('/orders')} className="text-xs text-pk underline">
          Back to Product Orders
        </button>
      </div>
    );

  const lines = order.po_line_items ?? [];
  const emails = (order.po_emails ?? []).slice().sort((a, b) =>
    (a.timestamp || '') < (b.timestamp || '') ? -1 : 1
  );
  const revPerCase = order.revenue_per_case;

  return (
    <div className="bg-cd border border-lt rounded-xl">
      {/* header */}
      <div className="px-[18px] py-4 border-b border-lt flex justify-between">
        <div>
          <div className="text-[22px] font-black">
            {order.po_number}{' '}
            {order.invoice_number && (
              <span className="text-xs text-gr">/ {order.invoice_number}</span>
            )}
          </div>
          <div className="flex gap-1.5 mt-1.5 items-center">
            <Pill status={order.ship_status} />
            <Pill status={order.payment_status} />
            <span
              className={`px-2 py-[3px] rounded-full text-[9px] font-semibold ${
                order.retailer === 'Kroger' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pk'
              }`}
            >
              {order.retailer}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 h-fit">
          <DetailPager items={orderKeys} current={poNumber} makePath={(po) => `/orders/${po}`} />
          <button
            onClick={() => navigate('/orders')}
            className="bg-bg border border-lt rounded-lg px-3 py-1.5 text-[10px] font-semibold text-md hover:bg-pc"
          >
            Back
          </button>
        </div>
      </div>

      {/* Original vs Current summary (only renders if something changed) */}
      <OriginalVsCurrent changes={changes} />

      {/* Fulfillment Timeline (replaces the old info cards) */}
      <FulfillmentTimeline po={order} />

      {/* compact facts row */}
      <div className="px-[18px] pb-3 grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { l: 'Destination', v: order.destination_dc || 'TBD' },
          { l: 'Carrier', v: order.carrier || 'TBD' },
          { l: 'Freight', v: order.freight_handler || 'TBD' },
          { l: 'Terms', v: order.payment_terms || '--' },
          { l: uom, v: format(order.total_cases ?? 0) },
        ].map((it) => (
          <div key={it.l} className="bg-bg border border-lt rounded-lg px-3 py-2">
            <div className="text-[8px] text-gr font-semibold uppercase">{it.l}</div>
            <div className="text-[13px] font-bold mt-0.5">{it.v}</div>
          </div>
        ))}
      </div>

      {/* line items */}
      <div className="px-[18px] pb-3">
        <div className="text-[8px] font-bold text-pk uppercase mb-1.5 pb-1 border-b-2 border-lt">
          Line Items
        </div>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-pc">
              <th className={TH}>SKU</th>
              <th className={THR}>Cases</th>
              <th className={THR}>Rev/cs</th>
              <th className={THR}>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-bg">
                <td className="px-2 py-1.5 font-bold">{l.sku}</td>
                <td className="px-2 py-1.5 text-right">{(l.quantity_cases ?? 0).toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right text-gr">
                  {revPerCase != null ? `$${Number(revPerCase).toFixed(2)}` : '--'}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold">
                  {l.line_total != null
                    ? `$${Number(l.line_total).toLocaleString()}`
                    : revPerCase != null
                    ? `$${(l.quantity_cases * revPerCase).toLocaleString()}`
                    : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* NOVA changes */}
      {order.nova_changes && (
        <div className="px-[18px] pb-3">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-[10px] text-yellow-800">
            <strong>NOVA:</strong> {order.nova_changes}
          </div>
        </div>
      )}

      {/* Finished-good lots shipped outbound to DOT (from delivery emails / manual).
          Inbound BOLs live in Inventory → Reorder / Landing, not here. */}
      <DeliveryLots poId={order.id} />

      {/* AI insight card (3.4) — synthesizes the agent's email extractions
          (po_emails.extracted_data: carrier/BOL/lots/anomalies, ship-date vs
          MABD), falling back to PO-state heuristics before any email lands. */}
      <AIInsightCard order={order} emails={emails} />

      {/* email thread (from systems@ enrichment) */}
      {emails.length > 0 && (
        <div className="px-[18px] pb-4">
          <div className="text-[8px] font-bold text-violet-700 uppercase mb-1.5 pb-1 border-b-2 border-lt">
            Email Thread ({emails.length})
          </div>
          <div className="border-l-2 border-lt ml-1">
            {emails.map((em) => (
              <div key={em.id} className="pl-3.5 py-1.5 border-b border-bg relative">
                <span className="absolute -left-1 top-2 w-1.5 h-1.5 rounded-full bg-cd border-2 border-pm" />
                <div className="flex justify-between">
                  <span className="font-bold text-[10px]">
                    {em.sender_name}{' '}
                    <span className="font-normal text-gr">{em.sender_org}</span>
                  </span>
                  <span className="text-[8px] text-gr">{formatDate(em.timestamp)}</span>
                </div>
                <div className="text-[10px] font-semibold mt-0.5">{em.summary}</div>
                {em.extracted_data && (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {Object.entries(em.extracted_data).map(([k, v]) => (
                      <span
                        key={k}
                        className="bg-bg border border-lt px-1 rounded text-[8px] font-semibold"
                      >
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Change History (PART 2) — full audit trail below the email thread */}
      <ChangeHistory changes={changes} loading={changesLoading} />
    </div>
  );
}
