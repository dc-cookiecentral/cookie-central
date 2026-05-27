import { formatDate, formatDateTime } from '../utils/dates';

// Column → display label + value kind, for the tracked purchase_orders fields
// (mirrors the log_po_changes() trigger's column list).
const FIELD_META = {
  ship_status: { label: 'Ship status' },
  payment_status: { label: 'Payment status' },
  ship_date_actual: { label: 'Actual ship', kind: 'date' },
  ship_date_original: { label: 'Original ship', kind: 'date' },
  ship_to_dot_date: { label: 'Ship to DOT', kind: 'date' },
  ship_to_dot_actual: { label: 'Ship to DOT (actual)', kind: 'date' },
  dot_receipt_date: { label: 'DOT receipt', kind: 'date' },
  total_cases: { label: 'Total cases', kind: 'int' },
  total_amount: { label: 'Total amount', kind: 'usd' },
  carrier: { label: 'Carrier' },
  destination_dc: { label: 'Destination DC' },
  mabd: { label: 'MABD', kind: 'date' },
  payment_terms: { label: 'Payment terms' },
  invoice_number: { label: 'Invoice #' },
  bol_number: { label: 'BOL #' },
  nova_changes: { label: 'NOVA note' },
};

const labelFor = (field) => FIELD_META[field]?.label || field;

function fmtVal(field, raw) {
  if (raw == null || raw === '') return '—';
  const kind = FIELD_META[field]?.kind;
  if (kind === 'date') return formatDate(raw);
  if (kind === 'int') return Number(raw).toLocaleString();
  if (kind === 'usd') return '$' + Number(raw).toLocaleString();
  return String(raw);
}

// source → [label, badge classes]
const SOURCE = {
  nova: ['NOVA', 'bg-yellow-100 text-yellow-800 border-yellow-200'],
  cortina: ['Cortina', 'bg-blue-100 text-blue-700 border-blue-200'],
  internal: ['Internal', 'bg-pink-100 text-pk border-pink-200'],
  email: ['Email', 'bg-violet-100 text-violet-700 border-violet-200'],
  manual: ['Manual', 'bg-slate-100 text-slate-600 border-slate-200'],
};

function SourceBadge({ source }) {
  const [label, cls] = SOURCE[source] || [source || 'unknown', 'bg-bg text-gr border-lt'];
  return <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-semibold border ${cls}`}>{label}</span>;
}

// Net original→current per field, from the change rows: first change's original
// vs last change's new value. Only fields that net-differ are returned.
function netChanges(changes) {
  const byField = new Map();
  for (const c of changes) {
    if (!byField.has(c.field_name)) byField.set(c.field_name, { original: c.original_value, current: c.new_value });
    else byField.get(c.field_name).current = c.new_value;
  }
  return [...byField.entries()]
    .map(([field, v]) => ({ field, ...v }))
    .filter((r) => (r.original ?? '') !== (r.current ?? ''));
}

// PART 4 — compact "Original vs Current" card. Renders nothing when nothing differs.
export function OriginalVsCurrent({ changes }) {
  const diffs = netChanges(changes);
  if (diffs.length === 0) return null;
  return (
    <div className="mx-[18px] mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <div className="text-[8px] font-bold uppercase tracking-wider text-amber-700 mb-1">
        Changed from original
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {diffs.map((d) => (
          <div key={d.field} className="text-[10px]">
            <span className="text-md">{labelFor(d.field)}: </span>
            <span className="text-gr line-through">{fmtVal(d.field, d.original)}</span>
            <span className="text-gr"> → </span>
            <span className="font-bold text-dk">{fmtVal(d.field, d.current)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// PART 2 — full change-history timeline, newest first.
export function ChangeHistory({ changes, loading }) {
  return (
    <div className="px-[18px] pb-4">
      <div className="text-[8px] font-bold text-pk uppercase mb-1.5 pb-1 border-b-2 border-lt">
        Change History{changes.length ? ` (${changes.length})` : ''}
      </div>
      {loading ? (
        <div className="text-[10px] text-gr py-2">Loading…</div>
      ) : changes.length === 0 ? (
        <div className="text-[10px] text-gr py-2">No recorded changes yet.</div>
      ) : (
        <div className="border-l-2 border-lt ml-1">
          {changes
            .slice()
            .reverse()
            .map((c) => (
              <div key={c.id} className="pl-3.5 py-1.5 border-b border-bg relative">
                <span className="absolute -left-1 top-2.5 w-1.5 h-1.5 rounded-full bg-cd border-2 border-pk" />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[10px] font-semibold text-dk">{labelFor(c.field_name)}</span>
                  <span className="text-[8px] text-gr">{formatDateTime(c.created_at)}</span>
                </div>
                <div className="text-[10px] mt-0.5">
                  <span className="text-gr line-through">{fmtVal(c.field_name, c.original_value)}</span>
                  <span className="text-gr"> → </span>
                  <span className="font-bold text-dk">{fmtVal(c.field_name, c.new_value)}</span>
                </div>
                <div className="flex gap-1.5 items-center mt-1">
                  <SourceBadge source={c.change_source} />
                  {c.changed_by_profile?.full_name && (
                    <span className="text-[8px] text-gr">by {c.changed_by_profile.full_name}</span>
                  )}
                  {c.change_reason && <span className="text-[8px] text-gr italic">· {c.change_reason}</span>}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
