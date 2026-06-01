import { useParams, useNavigate } from 'react-router-dom';
import Pill from '../components/Pill';
import FulfillmentTimeline from '../components/FulfillmentTimeline';
import { OriginalVsCurrent, ChangeHistory } from '../components/PoChangeHistory';
import { DeliveryLots } from '../components/PoDeliveryLots';
import { usePurchaseOrder, usePoChanges } from '../hooks/usePurchaseOrders';
import { useUOM } from '../contexts/UOMContext';
import { formatDate } from '../utils/dates';

const TH = 'px-2 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

// AI insight stub. Derives a one-liner from observable PO state (NOVA edits,
// ship-date shifts, lateness vs MABD, missing BOL) so the card never reads as
// pure placeholder. Phase 2 swaps the body for live AI extraction.
function AIInsightCard({ order }) {
  const findings = [];
  if (order.nova_changes) findings.push(`NOVA edit on file: ${order.nova_changes}`);
  if (order.ship_date_original && order.ship_date_actual && order.ship_date_original !== order.ship_date_actual) {
    findings.push('Ship date moved from original — track carrier handoff.');
  }
  if (order.ship_status === 'pending' && order.ship_date_original) {
    const days = Math.round((new Date(order.ship_date_original) - new Date()) / 86400000);
    if (days <= 3) findings.push(`Ships in ${days}d — confirm pallets + BOL ready.`);
  }
  if (order.ship_status === 'shipped' && !order.bol_number) {
    findings.push('Shipped without a BOL number — capture from delivery email.');
  }
  if (order.payment_status === 'awaiting_retailer' || order.payment_status === 'awaiting_walmart') {
    findings.push('Retailer payment overdue — confirm invoice with Cortina.');
  }
  if (!findings.length) findings.push('No anomalies detected from current PO state.');
  return (
    <div className="px-[18px] pb-3">
      <div className="bg-gradient-to-br from-pink-100 to-violet-100 rounded-xl px-3 py-2">
        <div className="text-[10px] font-bold text-pk uppercase tracking-wider mb-0.5">
          AI Insight <span className="text-[8px] text-md font-medium normal-case">— Phase 1 stub</span>
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
        <button
          onClick={() => navigate('/orders')}
          className="bg-bg border border-lt rounded-lg px-3 py-1.5 text-[10px] font-semibold text-md h-fit hover:bg-pc"
        >
          Back
        </button>
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
          { l: 'BOL', v: order.bol_number || (order.bol_received ? 'Received' : 'Pending') },
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

      {/* Delivery & Lots (BOL + lot numbers from delivery emails / manual) */}
      <DeliveryLots poId={order.id} bolNumber={order.bol_number} />

      {/* AI insight card (3.4) — Phase 1 derives a one-liner from PO state;
          Phase 2 replaces this with structured extraction across the email
          thread (carrier/BOL/cost anomalies, ship-date shifts vs MABD, etc.) */}
      <AIInsightCard order={order} />

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
