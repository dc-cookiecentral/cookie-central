import RetailerFilterPill from '../components/RetailerFilterPill';
import { useRetailerFilter } from '../contexts/RetailerFilterContext';
import { useUOM } from '../contexts/UOMContext';

// Day 1: smoke-test page showing the retailer filter + UOM context wired up.
// Day 3 replaces this with the real list view from BUILD_PLAN 3.1.
export default function ProductOrders() {
  const { retailer } = useRetailerFilter();
  const { uom, format } = useUOM();
  const sample = 720;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-dk">Product Orders</h1>
        <RetailerFilterPill />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-gr mb-4">
        Day 3 page — context smoke test only
      </div>
      <div className="bg-cd border border-lt rounded-xl p-6 max-w-xl text-sm text-md space-y-2">
        <div>Retailer filter: <span className="font-semibold text-dk">{retailer}</span></div>
        <div>UOM: <span className="font-semibold text-dk">{uom}</span></div>
        <div>
          Sample qty (720 cases) →{' '}
          <span className="font-semibold text-dk">{format(sample)} {uom}</span>
        </div>
        <div className="text-xs text-gr pt-2 border-t border-lt">
          Real list view: retailer badges, Days column, urgency sort, KPIs, alerts —
          built Day 3 (BUILD_PLAN 3.1).
        </div>
      </div>
    </div>
  );
}
