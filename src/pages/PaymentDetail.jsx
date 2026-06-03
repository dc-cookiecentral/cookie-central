import { useNavigate, useParams } from 'react-router-dom';
import Pill from '../components/Pill';
import DetailPager from '../components/DetailPager';
import { useUOM } from '../contexts/UOMContext';
import { useRetailerFilter } from '../contexts/RetailerFilterContext';
import {
  usePaymentDetail,
  usePayments,
  outstandingOf,
  stage1Done,
  stage2Done,
  stage2Awaiting,
} from '../hooks/usePayments';
import { formatDate } from '../utils/dates';

// Payment detail (BUILD_PLAN 6.2). Mirrors the prototype: PO + invoice header,
// ship/pay/retailer pills, 4 KPI tiles, line items, NOVA, and a 3-stage
// payment timeline (Ship → Cortina to DC → Retailer to Cortina).

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

const usd = (n) =>
  n == null || Number(n) === 0
    ? '$0'
    : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Tile({ label, value, highlight }) {
  return (
    <div
      className={`rounded-lg px-3 py-2.5 border border-lt ${
        highlight ? 'bg-red-50' : 'bg-bg'
      }`}
    >
      <div className="text-[8px] font-semibold uppercase text-gr">{label}</div>
      <div className={`text-base font-extrabold mt-0.5 ${highlight ? 'text-red-600' : 'text-dk'}`}>
        {value}
      </div>
    </div>
  );
}

// One payment-timeline stage. `state` controls colour + label.
//   done   → green, value "Paid" (or supplied label)
//   awaiting → amber, value "Awaiting"
//   pending  → gray, value "Pending"
function TimelineStage({ label, state, value }) {
  const cls = {
    done:     ['bg-emerald-50', 'text-emerald-600'],
    awaiting: ['bg-bg',         'text-amber-600'],
    pending:  ['bg-bg',         'text-gr'],
    info:     ['bg-bg',         'text-dk'],
  }[state] || ['bg-bg', 'text-gr'];
  return (
    <div className={`flex-1 rounded-md px-3 py-2 border border-lt ${cls[0]}`}>
      <div className="text-[8px] uppercase text-gr">{label}</div>
      <div className={`text-[11px] font-bold mt-0.5 ${cls[1]}`}>{value}</div>
    </div>
  );
}

export default function PaymentDetail() {
  const { poNumber } = useParams();
  const navigate = useNavigate();
  const { uom, format } = useUOM();
  const { data, loading, error } = usePaymentDetail(poNumber);
  // Ordered list for the prev/next pager — matches the Payments view (shipped
  // only + retailer filter), falling back to unfiltered if the current PO isn't
  // in that view.
  const { rows } = usePayments();
  const { filter } = useRetailerFilter();
  const shipped = rows.filter((p) => p.ship_status !== 'pending');
  const filteredKeys = filter(shipped, 'retailer').map((p) => p.po_number);
  const paymentKeys = filteredKeys.includes(poNumber) ? filteredKeys : shipped.map((p) => p.po_number);

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) {
    return (
      <div className="bg-cd border border-lt rounded-xl p-8 text-center">
        <div className="text-sm font-semibold text-dk mb-1">PO not found</div>
        <button onClick={() => navigate('/payments')} className="text-xs font-semibold text-pk underline">
          Back to Payments
        </button>
      </div>
    );
  }

  const paid = Number(data.paid_amount ?? 0);
  const total = Number(data.total_amount ?? 0);
  const outstanding = outstandingOf(data);
  const unpaid = paid === 0;
  const isKroger = data.retailer === 'Kroger';

  // 3-stage timeline. Term labels match the prototype:
  //   Walmart: "Cortina to DC (30d)" + "WM to Cortina (60d)"
  //   Kroger:  "Cortina to DC"       + "Kroger to Cortina"
  const stage1Label = isKroger ? 'Cortina to DC' : 'Cortina to DC (30d)';
  const stage2Label = isKroger ? 'Kroger to Cortina' : 'WM to Cortina (60d)';
  const stage1State = stage1Done(data.payment_status) ? 'done' : 'pending';
  const stage2State = stage2Done(data.payment_status)
    ? 'done'
    : stage2Awaiting(data.payment_status)
    ? 'awaiting'
    : 'pending';

  const shipValue = formatDate(data.ship_date_actual || data.ship_date_original);

  return (
    <div className="bg-cd border border-lt rounded-xl p-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-xl font-black text-dk">
            {data.po_number}{' '}
            <span className="text-xs text-gr font-medium">/ {data.invoice_number || 'TBD'}</span>
          </div>
          <div className="flex gap-1.5 mt-1.5 items-center flex-wrap">
            <Pill status={data.ship_status} />
            <Pill status={data.payment_status} />
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                isKroger ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pk'
              }`}
            >
              {data.retailer}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DetailPager items={paymentKeys} current={poNumber} makePath={(po) => `/payments/${po}`} />
          <button
            onClick={() => navigate('/payments')}
            className="bg-bg border border-lt rounded-md px-3 py-1 text-[10px] font-semibold text-md hover:text-pk"
          >
            Back
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        <Tile label="Invoice Amt" value={usd(total)} />
        <Tile label="Paid" value={usd(paid)} highlight={unpaid} />
        <Tile label="Outstanding" value={usd(outstanding)} highlight={outstanding > 0} />
        <Tile label="Terms" value={data.payment_terms || '--'} />
      </div>

      {data.po_line_items?.length > 0 && (
        <>
          <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-1.5 pb-1 border-b-2 border-lt">
            What was ordered
          </div>
          <table className="w-full border-collapse text-[11px] mb-3">
            <thead>
              <tr className="bg-pc">
                <th className={TH}>SKU</th>
                <th className={THR}>{uom}</th>
                <th className={THR}>Rev/cs</th>
                <th className={THR}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {data.po_line_items.map((l) => {
                const lineTotal = Number(l.line_total ?? (l.quantity_cases * (data.revenue_per_case ?? 0)));
                return (
                  <tr key={l.id} className="border-b border-bg">
                    <td className="px-3 py-2 font-bold">{l.sku}</td>
                    <td className="px-3 py-2 text-right">{format(l.quantity_cases)}</td>
                    <td className="px-3 py-2 text-right text-gr">{usd(data.revenue_per_case)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{usd(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {data.nova_changes && (
        <div className="mb-3">
          <div className="text-[8px] font-bold uppercase text-amber-700 mb-1">NOVA Changes</div>
          <div className="bg-yellow-100 border border-yellow-200 rounded-md px-3 py-2 text-[10px] text-amber-900">
            {data.nova_changes}
          </div>
        </div>
      )}

      <div className="text-[8px] font-bold uppercase tracking-wider text-md mb-1.5 pb-1 border-b-2 border-lt">
        Payment timeline ({data.payment_terms || 'terms TBD'})
      </div>
      <div className="flex gap-2">
        <TimelineStage label="Ship" state="info" value={shipValue} />
        <TimelineStage
          label={stage1Label}
          state={stage1State}
          value={stage1State === 'done' ? 'Paid' : 'Pending'}
        />
        <TimelineStage
          label={stage2Label}
          state={stage2State}
          value={
            stage2State === 'done' ? 'Paid' : stage2State === 'awaiting' ? 'Awaiting' : 'Pending'
          }
        />
      </div>

      {data.payments?.length > 0 && (
        <div className="mt-4">
          <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-1.5 pb-1 border-b-2 border-lt">
            Payment events ({data.payments.length})
          </div>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-pc">
                <th className={TH}>Date</th>
                <th className={TH}>Stage</th>
                <th className={THR}>Amount</th>
                <th className={THR}>Deductions</th>
                <th className={TH}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.payments
                .slice()
                .sort((a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''))
                .map((p) => (
                  <tr key={p.id} className="border-b border-bg">
                    <td className="px-3 py-2 font-semibold">{formatDate(p.payment_date)}</td>
                    <td className="px-3 py-2 text-md">
                      {p.payment_type === 'cortina_to_dc'
                        ? 'Cortina → DC'
                        : p.payment_type === 'retailer_to_cortina'
                        ? `${isKroger ? 'Kroger' : 'WM'} → Cortina`
                        : p.payment_type || '--'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                      {usd(p.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-md">
                      {Number(p.deductions ?? 0) > 0 ? usd(p.deductions) : '--'}
                    </td>
                    <td className="px-3 py-2 text-md text-[10px]">{p.notes || '--'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
