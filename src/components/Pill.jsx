// Status badge — ported from prototype's <Pill>. Covers ship + payment states.
const MAP = {
  shipped:          ['bg-violet-100',  'text-violet-700',  'Shipped'],
  delivered:        ['bg-green-100',   'text-green-700',   'Delivered'],
  pending:          ['bg-gray-100',    'text-gr',          'Pending'],
  paid_cortina:     ['bg-blue-100',    'text-blue-700',    'Cortina Paid'],
  paid_dc:          ['bg-green-100',   'text-green-700',   'Paid'],
  paid_retailer:    ['bg-green-100',   'text-green-700',   'Paid'],
  awaiting_retailer:['bg-yellow-100',  'text-yellow-700',  'Awaiting'],
  // legacy/prototype aliases
  paid_national:    ['bg-blue-100',    'text-blue-700',    'Cortina Paid'],
  awaiting_walmart: ['bg-yellow-100',  'text-yellow-700',  'Awaiting WM'],
  // raw-material expiry statuses
  good:             ['bg-green-100',   'text-green-700',   'Good'],
  almost_expired:   ['bg-yellow-100',  'text-yellow-700',  'Expiring'],
  partial_expired:  ['bg-red-100',     'text-red-700',     'Exp Lots'],
  // product status
  active:           ['bg-green-100',   'text-green-700',   'Active'],
  upcoming:         ['bg-violet-100',  'text-violet-700',  'Upcoming'],
  discontinued:     ['bg-gray-100',    'text-gr',          'Discontinued'],
  // transition status
  planning:         ['bg-yellow-100',  'text-yellow-700',  'Planning'],
  in_progress:      ['bg-blue-100',    'text-blue-700',    'In Progress'],
  complete:         ['bg-green-100',   'text-green-700',   'Complete'],
};

export default function Pill({ status }) {
  const [bg, text, label] = MAP[status] || MAP.pending;
  return (
    <span className={`inline-block px-2.5 py-[3px] rounded-full text-[10px] font-semibold whitespace-nowrap ${bg} ${text}`}>
      {label}
    </span>
  );
}
