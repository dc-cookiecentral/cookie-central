import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import RetailerFilterPill from '../components/RetailerFilterPill';
import Pill from '../components/Pill';
import { useRetailerFilter } from '../contexts/RetailerFilterContext';
import { useUOM } from '../contexts/UOMContext';
import {
  usePayments,
  stage1Done,
  stage2Done,
  stage2Awaiting,
  outstandingOf,
} from '../hooks/usePayments';

// Payment-centric re-pivot of purchase_orders (BUILD_PLAN 6.1). Mirrors the
// approved prototype's Payments list — filters out unshipped POs (you can
// only pay for what shipped), no KPI strip, two-stage status columns
// (Cortina paid DC | Retailer paid Cortina).

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';

const usd = (n) =>
  n == null || Number(n) === 0
    ? '$0'
    : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Payments() {
  const navigate = useNavigate();
  const { filter } = useRetailerFilter();
  const { uom, format } = useUOM();
  const { rows, loading, error } = usePayments();

  // Prototype rule: payments list shows only POs that have shipped.
  const visible = filter(rows.filter((p) => p.ship_status !== 'pending'), 'retailer');

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
          <div className="text-sm font-semibold text-dk mb-1">No shipped POs to bill</div>
          <div className="text-xs text-md mb-3">
            Payments are tracked against shipped purchase orders. Upload NetSuite POs to populate this view.
          </div>
          <Link to="/uploads" className="text-xs font-semibold text-pk hover:text-pm underline">
            Go to Uploads →
          </Link>
        </div>
      ) : (
        <div className="bg-cd border border-lt rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-lt text-[9px] font-bold text-gr uppercase tracking-wider">
            Click a PO for detail · Two-stage tracking: Cortina → DC, then Retailer → Cortina
          </div>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-pc">
                {['PO', 'Ret', 'Invoice', uom, 'Amt', 'Paid', 'Terms', 'Cortina', 'WM/Ret'].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((po) => {
                const paid = Number(po.paid_amount ?? 0);
                const awaiting = stage2Awaiting(po.payment_status);
                return (
                  <tr
                    key={po.id}
                    onClick={() => navigate(`/payments/${po.po_number}`)}
                    className={[
                      'border-b border-bg cursor-pointer hover:bg-pc',
                      awaiting ? 'bg-amber-50' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2 font-bold">{po.po_number}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-px rounded text-[8px] font-semibold ${
                          po.retailer === 'Kroger'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-pink-100 text-pk'
                        }`}
                      >
                        {po.retailer}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-md text-[10px]">
                      {po.invoice_number || <span className="text-gr">TBD</span>}
                    </td>
                    <td className="px-3 py-2 font-semibold">{format(po.total_cases ?? 0)}</td>
                    <td className="px-3 py-2">{usd(po.total_amount)}</td>
                    <td
                      className={`px-3 py-2 font-semibold ${
                        paid === 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {usd(paid)}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-gr">{po.payment_terms || '--'}</td>
                    <td className="px-3 py-2">
                      {stage1Done(po.payment_status) ? (
                        <Pill status="paid_cortina" />
                      ) : (
                        <span className="text-gr">--</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {stage2Done(po.payment_status) ? (
                        <Pill status="paid_retailer" />
                      ) : stage2Awaiting(po.payment_status) ? (
                        <Pill status="awaiting_retailer" />
                      ) : (
                        <span className="text-gr">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-1.5 text-[8px] text-gr italic border-t border-lt">
            Most-outstanding first within each payment stage.
          </div>
        </div>
      )}
    </div>
  );
}
