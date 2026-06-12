import { useNavigate, useParams } from 'react-router-dom';
import Pill from '../components/Pill';
import DetailPager from '../components/DetailPager';
import { useUOM } from '../contexts/UOMContext';
import { useRetailerFilter } from '../contexts/RetailerFilterContext';
import { useCortinaInvoiceDetail, useCortinaInvoices } from '../hooks/usePayments';
import { formatDate } from '../utils/dates';

// Payment detail — Stage 1 (Cortina → DC) from cortina_invoices. Stage 2
// (Walmart → Cortina) isn't in the Walmart Orders feed, so it reads "Not tracked".

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

const usd = (n) =>
  n == null || Number(n) === 0
    ? '$0'
    : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Tile({ label, value, highlight }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 border border-lt ${highlight ? 'bg-red-50' : 'bg-bg'}`}>
      <div className="text-[8px] font-semibold uppercase text-gr">{label}</div>
      <div className={`text-base font-extrabold mt-0.5 ${highlight ? 'text-red-600' : 'text-dk'}`}>{value}</div>
    </div>
  );
}

function TimelineStage({ label, state, value }) {
  const cls = {
    done: ['bg-emerald-50', 'text-emerald-600'],
    awaiting: ['bg-bg', 'text-amber-600'],
    pending: ['bg-bg', 'text-gr'],
    info: ['bg-bg', 'text-dk'],
    na: ['bg-bg', 'text-gr'],
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
  const { data, loading, error } = useCortinaInvoiceDetail(poNumber);

  // Pager across the invoice list (de-duplicated to one entry per PO).
  const { rows } = useCortinaInvoices();
  const { filter } = useRetailerFilter();
  const filteredKeys = [...new Set(filter(rows, 'retailer').map((i) => i.po_number).filter(Boolean))];
  const paymentKeys = filteredKeys.includes(poNumber)
    ? filteredKeys
    : [...new Set(rows.map((i) => i.po_number).filter(Boolean))];

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

  const invoices = data.cortina_invoices ?? [];
  const lines = data.po_line_items ?? [];
  const isKroger = data.retailer === 'Kroger';

  const total = invoices.reduce((s, i) => s + (Number(i.invoice_amount) || 0), 0) || Number(data.total_amount ?? 0);
  const paid = invoices.filter((i) => i.payment_date).reduce((s, i) => s + (Number(i.invoice_amount) || 0), 0);
  const outstanding = Math.max(0, total - paid);
  const allPaid = invoices.length > 0 && invoices.every((i) => i.payment_date);
  const somePaid = invoices.some((i) => i.payment_date);
  const terms = invoices.find((i) => i.invoice_terms != null)?.invoice_terms;

  const stage1Label = isKroger ? 'Cortina to DC' : `Cortina to DC${terms != null ? ` (Net ${terms})` : ''}`;
  const stage1State = allPaid ? 'done' : somePaid ? 'awaiting' : 'pending';
  const latestPay = invoices.map((i) => i.payment_date).filter(Boolean).sort().pop();

  const shipValue = formatDate(data.ship_date_actual || data.ship_date_original);

  return (
    <div className="bg-cd border border-lt rounded-xl p-5">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-xl font-black text-dk">
            {data.cortina_so_number || data.po_number}{' '}
            <span className="text-xs text-gr font-medium">/ {invoices[0]?.invoice_number || 'No invoice yet'}</span>
          </div>
          {data.walmart_po_number && (
            <div className="text-[10px] text-gr font-semibold">Walmart PO {data.walmart_po_number}</div>
          )}
          <div className="flex gap-1.5 mt-1.5 items-center flex-wrap">
            <Pill status={data.ship_status} />
            <Pill status={allPaid ? 'paid' : somePaid ? 'partial' : 'pending'} />
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
        <Tile label="Paid" value={usd(paid)} highlight={paid === 0} />
        <Tile label="Outstanding" value={usd(outstanding)} highlight={outstanding > 0} />
        <Tile label="Terms" value={terms != null ? `Net ${terms}` : data.payment_terms || '--'} />
      </div>

      {lines.length > 0 && (
        <>
          <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-1.5 pb-1 border-b-2 border-lt">
            What was ordered
          </div>
          <table className="w-full border-collapse text-[11px] mb-3">
            <thead>
              <tr className="bg-pc">
                <th className={TH}>SKU</th>
                <th className={TH}>DC</th>
                <th className={THR}>{uom}</th>
                <th className={THR}>WM $/unit</th>
                <th className={THR}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-bg">
                  <td className="px-3 py-2 font-bold">{l.sku}</td>
                  <td className="px-3 py-2 text-[10px] text-md">{l.destination_dc || '--'}</td>
                  <td className="px-3 py-2 text-right">{format(l.quantity_cases)}</td>
                  <td className="px-3 py-2 text-right text-gr">{usd(l.walmart_unit_price)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{usd(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="text-[8px] font-bold uppercase tracking-wider text-md mb-1.5 pb-1 border-b-2 border-lt">
        Payment timeline
      </div>
      <div className="flex gap-2">
        <TimelineStage label="Ship" state="info" value={shipValue} />
        <TimelineStage
          label={stage1Label}
          state={stage1State}
          value={stage1State === 'done' ? `Paid ${formatDate(latestPay)}` : stage1State === 'awaiting' ? 'Partial' : 'Pending'}
        />
        <TimelineStage
          label={isKroger ? 'Kroger to Cortina' : 'WM to Cortina'}
          state="na"
          value="Not tracked"
        />
      </div>

      {invoices.length > 0 && (
        <div className="mt-4">
          <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-1.5 pb-1 border-b-2 border-lt">
            Invoices &amp; payments ({invoices.length})
          </div>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-pc">
                <th className={TH}>Invoice</th>
                <th className={TH}>Invoiced</th>
                <th className={TH}>Terms</th>
                <th className={THR}>Amount</th>
                <th className={TH}>Payment Doc</th>
                <th className={TH}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {invoices
                .slice()
                .sort((a, b) => (a.invoice_date || '').localeCompare(b.invoice_date || ''))
                .map((inv) => (
                  <tr key={inv.id} className="border-b border-bg">
                    <td className="px-3 py-2 font-bold">{inv.invoice_number}</td>
                    <td className="px-3 py-2 font-semibold">{formatDate(inv.invoice_date)}</td>
                    <td className="px-3 py-2 text-md text-[10px]">
                      {inv.invoice_terms != null ? `Net ${inv.invoice_terms}` : '--'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{usd(inv.invoice_amount)}</td>
                    <td className="px-3 py-2 text-md text-[10px]">{inv.payment_document || '--'}</td>
                    <td className="px-3 py-2">
                      {inv.payment_date ? (
                        <span className="text-emerald-600 font-semibold text-[10px]">{formatDate(inv.payment_date)}</span>
                      ) : (
                        <span className="text-amber-600 font-semibold text-[10px]">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
