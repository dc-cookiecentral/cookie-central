import { formatDate, isLate, daysUntil } from '../utils/dates';

// The PO pipeline, planned vs actual per step. Late steps (actual after
// planned) render red. Steps map to purchase_orders columns:
//   Production ready      → (no column yet)
//   Ship to DOT           → ship_to_dot_date / ship_to_dot_actual
//   DOT receives          → (no planned) / dot_receipt_date
//   DOT ships to retailer → ship_date_original / ship_date_actual
//   Retailer DC (MABD)    → mabd / delivery_date
function buildSteps(po) {
  return [
    { label: 'Production ready', planned: null, actual: null },
    { label: 'Ship to DOT', planned: po.ship_to_dot_date, actual: po.ship_to_dot_actual },
    { label: 'DOT receives', planned: null, actual: po.dot_receipt_date },
    { label: 'DOT ships to retailer', planned: po.ship_date_original, actual: po.ship_date_actual },
    { label: 'Retailer DC receives (MABD)', planned: po.mabd, actual: po.delivery_date },
  ];
}

function Step({ step, isLast }) {
  const late = isLate(step.planned, step.actual);
  const done = !!step.actual;
  // Pending + planned in the near future → show urgency days.
  const days = !done ? daysUntil(step.planned) : null;

  const dot = done
    ? late
      ? 'bg-red-500'
      : 'bg-emerald-500'
    : step.planned
    ? 'bg-amber-400'
    : 'bg-gray-300';

  return (
    <div className="flex-1 min-w-[120px] relative">
      <div className="flex items-center">
        <span className={`w-3 h-3 rounded-full ${dot} z-10`} />
        {!isLast && <span className="flex-1 h-px bg-lt" />}
      </div>
      <div className="mt-2 pr-3">
        <div className="text-[9px] font-bold uppercase text-gr leading-tight">{step.label}</div>
        <div className="mt-1 space-y-0.5">
          <div className="text-[10px] text-md">
            <span className="text-gr">Planned:</span> {formatDate(step.planned)}
            {days != null && step.planned && (
              <span className="text-gr"> ({days < 0 ? 'overdue' : days === 0 ? 'today' : `${days}d`})</span>
            )}
          </div>
          <div className={`text-[11px] font-semibold ${late ? 'text-red-600' : done ? 'text-emerald-600' : 'text-gr'}`}>
            <span className="text-gr font-normal">Actual:</span> {formatDate(step.actual)}
            {late && ' · late'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FulfillmentTimeline({ po }) {
  const steps = buildSteps(po);
  return (
    <div className="px-[18px] py-3">
      <div className="text-[8px] font-bold text-pk uppercase mb-3 pb-1 border-b-2 border-lt">
        Fulfillment Timeline
      </div>
      <div className="flex flex-wrap gap-y-3">
        {steps.map((step, i) => (
          <Step key={step.label} step={step} isLast={i === steps.length - 1} />
        ))}
      </div>
    </div>
  );
}
