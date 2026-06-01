import { Link, useNavigate } from 'react-router-dom';
import RetailerFilterPill from '../components/RetailerFilterPill';
import AlertsPanel from '../components/AlertsPanel';
import Pill from '../components/Pill';
import DaysTag from '../components/DaysTag';
import { useRetailerFilter } from '../contexts/RetailerFilterContext';
import { useUOM } from '../contexts/UOMContext';
import { usePurchaseOrders } from '../hooks/usePurchaseOrders';
import { daysUntil, formatDate, isLate } from '../utils/dates';

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';

function Kpi({ label, value }) {
  return (
    <div className="bg-cd border border-lt rounded-xl px-4 py-3 flex-1 min-w-[90px]">
      <div className="text-lg font-extrabold text-dk">{value}</div>
      <div className="text-[8px] font-semibold uppercase text-gr mt-px">{label}</div>
    </div>
  );
}

// Ship-to-DOT cell: urgency tag while pending; once shipped show the actual
// date (red if it missed the planned date).
function ShipToDotCell({ po }) {
  if (po.ship_to_dot_actual) {
    const late = isLate(po.ship_to_dot_date, po.ship_to_dot_actual);
    return (
      <span className={`text-[10px] font-semibold ${late ? 'text-red-600' : 'text-emerald-600'}`}>
        {formatDate(po.ship_to_dot_actual)}
        {late && ' (late)'}
      </span>
    );
  }
  if (po.ship_to_dot_date) return <DaysTag days={daysUntil(po.ship_to_dot_date)} />;
  return <span className="text-gr text-[9px]">--</span>;
}

export default function ProductOrders() {
  const navigate = useNavigate();
  const { filter } = useRetailerFilter();
  const { uom, format } = useUOM();
  const { orders, loading, error } = usePurchaseOrders();

  const rows = filter(orders, 'retailer');

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-dk">Product Orders</h1>
        <RetailerFilterPill />
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

      {loading ? (
        <div className="text-sm text-gr py-10 text-center">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="bg-cd border border-lt rounded-xl p-8 text-center">
          <div className="text-sm font-semibold text-dk mb-1">No purchase orders yet</div>
          <div className="text-xs text-md mb-3">
            POs come from Cortina's NetSuite export.
          </div>
          <Link to="/uploads" className="text-xs font-semibold text-pk hover:text-pm underline">
            Upload a NetSuite file →
          </Link>
        </div>
      ) : (
        <>
          <AlertsPanel title="Attention" max={6} />
          <div className="flex gap-2 flex-wrap mb-3">
            <Kpi label="Active POs" value={rows.length} />
            <Kpi label="Pending Ship" value={rows.filter((p) => p.ship_status === 'pending').length} />
            <Kpi label="In Transit" value={rows.filter((p) => p.ship_status === 'shipped').length} />
            <Kpi label="Delivered" value={rows.filter((p) => p.ship_status === 'delivered').length} />
            <Kpi
              label="Unpaid"
              value={rows.filter((p) => !p.paid_amount || Number(p.paid_amount) === 0).length}
            />
          </div>

          <div className="bg-cd border border-lt rounded-xl overflow-hidden">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-pc">
                  {['PO', 'Ret', 'MABD', 'Days', 'Products', uom, 'Ship to DOT', 'Ship', 'Payment'].map(
                    (h) => (
                      <th key={h} className={TH}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((po) => {
                  const days =
                    po.ship_status === 'pending' ? daysUntil(po.ship_date_original) : null;
                  return (
                    <tr
                      key={po.id}
                      onClick={() => navigate(`/orders/${po.po_number}`)}
                      className="border-b border-bg cursor-pointer hover:bg-pc"
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
                      <td className="px-3 py-2 font-semibold">{formatDate(po.mabd)}</td>
                      <td className="px-3 py-2">
                        {days != null ? (
                          <DaysTag days={days} />
                        ) : (
                          <span className="text-gr text-[9px]">{po.ship_status}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[10px]">
                        {(po.po_line_items ?? []).map((l) => (
                          <div key={l.id}>
                            <span className="font-semibold">{l.sku}</span>{' '}
                            <span className="text-gr">{l.quantity_cases}cs</span>
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2 font-semibold">{format(po.total_cases ?? 0)}</td>
                      <td className="px-3 py-2">
                        <ShipToDotCell po={po} />
                      </td>
                      <td className="px-3 py-2">
                        <Pill status={po.ship_status} />
                      </td>
                      <td className="px-3 py-2">
                        <Pill status={po.payment_status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-3 py-1.5 text-[8px] text-gr italic border-t border-lt">
              Sorted by urgency (soonest ship-to-DOT first).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
