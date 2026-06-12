import { useNavigate, Link } from 'react-router-dom';
import RetailerFilterPill from '../components/RetailerFilterPill';
import Pill from '../components/Pill';
import { useRetailerFilter } from '../contexts/RetailerFilterContext';
import { useUOM } from '../contexts/UOMContext';
import { useCortinaInvoices } from '../hooks/usePayments';
import { formatDate } from '../utils/dates';

// Payments = Cortina invoices (Stage 1: Cortina → DC), sourced from the Walmart
// Orders export (cortina_invoices). Each row is one invoice linked to its PO.
// Stage 2 (Walmart → Cortina) isn't in this feed, so it reads "Not tracked".

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';

const usd = (n) =>
  n == null || Number(n) === 0
    ? '$0'
    : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Payments() {
  const navigate = useNavigate();
  const { filter } = useRetailerFilter();
  const { uom, format } = useUOM();
  const { rows, loading, error } = useCortinaInvoices();

  const visible = filter(rows, 'retailer');
  const outstanding = visible.filter((i) => !i.paid).reduce((s, i) => s + (Number(i.invoice_amount) || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-dk">Payments</h1>
        <RetailerFilterPill />
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

      {loading ? (
        <div className="text-sm text-gr py-10 text-center">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="bg-cd border border-lt rounded-xl p-8 text-center">
          <div className="text-sm font-semibold text-dk mb-1">No invoices yet</div>
          <div className="text-xs text-md mb-3">
            Invoices arrive with the nightly Cortina Walmart Orders export.
          </div>
          <Link to="/uploads" className="text-xs font-semibold text-pk hover:text-pm underline">
            Go to Uploads →
          </Link>
        </div>
      ) : (
        <div className="bg-cd border border-lt rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-lt text-[9px] font-bold text-gr uppercase tracking-wider flex justify-between">
            <span>Cortina invoices · Stage 1 (Cortina → DC) · Stage 2 (Walmart → Cortina) not tracked in this feed</span>
            <span className="text-amber-700">Outstanding: {usd(outstanding)}</span>
          </div>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-pc">
                {['Invoice', 'SO / PO', 'Ret', uom, 'Amount', 'Invoiced', 'Terms', 'Cortina → DC', 'WM → Cortina'].map(
                  (h) => (
                    <th key={h} className={TH}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => inv.po_number && navigate(`/payments/${inv.po_number}`)}
                  className={[
                    'border-b border-bg cursor-pointer hover:bg-pc',
                    inv.paid ? '' : 'bg-amber-50',
                  ].join(' ')}
                >
                  <td className="px-3 py-2 font-bold">{inv.invoice_number}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{inv.po?.cortina_so_number || inv.po_number}</div>
                    {inv.po?.walmart_po_number && (
                      <div className="text-[8px] text-gr">WM {inv.po.walmart_po_number}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-1.5 py-px rounded text-[8px] font-semibold ${
                        inv.retailer === 'Kroger' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pk'
                      }`}
                    >
                      {inv.retailer}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold">{format(inv.po?.total_cases ?? 0)}</td>
                  <td className="px-3 py-2 font-semibold">{usd(inv.invoice_amount)}</td>
                  <td className="px-3 py-2 text-[10px] text-md">{formatDate(inv.invoice_date)}</td>
                  <td className="px-3 py-2 text-[10px] text-gr">
                    {inv.invoice_terms != null ? `Net ${inv.invoice_terms}` : '--'}
                  </td>
                  <td className="px-3 py-2">
                    {inv.paid ? (
                      <Pill status="paid" />
                    ) : (
                      <Pill status="pending" />
                    )}
                  </td>
                  <td className="px-3 py-2 text-[9px] text-gr italic">Not tracked</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-1.5 text-[8px] text-gr italic border-t border-lt">
            Unpaid invoices first. Payment date + document come from Cortina's NetSuite export.
          </div>
        </div>
      )}
    </div>
  );
}
