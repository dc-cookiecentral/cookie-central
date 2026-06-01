import { useState } from 'react';
import { useEomSnapshot, getDefaultMonth, addMonths } from '../hooks/useEomSnapshot';

// EOM Snapshot (BUILD_PLAN 7.1). Month-pinned monthly summary with vs-prev-month
// deltas on the primary KPIs, plus shrink / markdowns / fill rate (sourced
// from the latest weekly_report in the month), plus current inventory state.

const usd = (n) =>
  n == null ? '--' : '$' + Math.round(Number(n)).toLocaleString();
const qty = (n) => (n == null ? '--' : Number(n).toLocaleString());

function delta(curr, prev, fmt = (n) => n) {
  if (prev == null || prev === 0) return curr ? '+' + fmt(curr) : '--';
  const diff = (Number(curr) || 0) - (Number(prev) || 0);
  if (!diff) return 'flat vs prev';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${fmt(diff)} vs prev`;
}

function PrimaryTile({ label, value, deltaText, positive }) {
  const cls = positive == null ? 'text-gr' : positive ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className="bg-bg border border-lt rounded-lg p-3">
      <div className="text-base font-extrabold text-dk">{value}</div>
      <div className="text-[7px] font-semibold uppercase text-gr mt-0.5">{label}</div>
      <div className={`text-[9px] font-semibold mt-1 ${cls}`}>{deltaText}</div>
    </div>
  );
}
function SecondaryTile({ label, value, note }) {
  return (
    <div className="bg-bg border border-lt rounded-lg p-3">
      <div className="text-sm font-extrabold text-dk">{value}</div>
      <div className="text-[7px] font-semibold uppercase text-gr mt-0.5">{label}</div>
      <div className="text-[9px] text-gr mt-1">{note}</div>
    </div>
  );
}

export default function EomSnapshot() {
  const [month, setMonth] = useState(() => getDefaultMonth());
  const { data, loading, error } = useEomSnapshot(month);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-dk">EOM Snapshot</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="bg-cd border border-lt rounded-md px-2 py-1 text-[10px] font-semibold text-md hover:text-pk"
          >
            ←
          </button>
          <div className="text-xs font-semibold text-dk min-w-[120px] text-center">
            {data?.monthLabel || '—'}
          </div>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="bg-cd border border-lt rounded-md px-2 py-1 text-[10px] font-semibold text-md hover:text-pk"
            disabled={addMonths(month, 1) > new Date()}
          >
            →
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

      {loading || !data ? (
        <div className="text-sm text-gr py-10 text-center">Loading…</div>
      ) : (
        <div className="bg-cd border border-lt rounded-xl p-4">
          <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-0.5">
            End of Month · {data.monthLabel}
          </div>
          <div className="text-[8px] text-gr mb-3">
            Generated {data.generatedAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · Deltas vs prior month
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <PrimaryTile
              label="POs Shipped"
              value={data.kpis.pos.value}
              deltaText={delta(data.kpis.pos.value, data.kpis.pos.prev)}
              positive={data.kpis.pos.value >= data.kpis.pos.prev}
            />
            <PrimaryTile
              label="Cases Shipped"
              value={qty(data.kpis.cases.value)}
              deltaText={delta(data.kpis.cases.value, data.kpis.cases.prev, qty)}
              positive={data.kpis.cases.value >= data.kpis.cases.prev}
            />
            <PrimaryTile
              label="Revenue"
              value={usd(data.kpis.revenue.value)}
              deltaText={delta(data.kpis.revenue.value, data.kpis.revenue.prev, usd)}
              positive={data.kpis.revenue.value >= data.kpis.revenue.prev}
            />
            <PrimaryTile
              label="Chargebacks"
              value={usd(data.kpis.chargebacks.value)}
              deltaText="From payment deductions"
              positive={data.kpis.chargebacks.value === 0}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <SecondaryTile
              label="Markdowns"
              value={data.secondary.markdowns != null ? data.secondary.markdowns : '--'}
              note={data.secondary.markdownsNote}
            />
            <SecondaryTile
              label="Shrink"
              value={data.secondary.shrinkLbs ? `${qty(data.secondary.shrinkLbs)} lbs` : '--'}
              note={data.secondary.shrinkNote}
            />
            <SecondaryTile
              label="Fill Rate"
              value={data.secondary.fillRate != null ? data.secondary.fillRate : '--'}
              note={data.secondary.fillRateNote}
            />
          </div>

          {data.sections.map((sec) => (
            <div key={sec.title} className="mb-3">
              <div className="text-[8px] font-bold uppercase tracking-wider text-md mb-1">
                {sec.title}
              </div>
              {sec.rows.length ? (
                <table className="w-full border-collapse text-[10px]">
                  <tbody>
                    {sec.rows.map(([name, value]) => (
                      <tr key={name} className="border-b border-bg">
                        <td className="px-2 py-1 font-semibold">{name}</td>
                        <td className="px-2 py-1 text-right font-bold">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-[10px] text-gr italic">No data.</div>
              )}
            </div>
          ))}

          <div className="text-[8px] text-gr italic">
            Snapshot tables show current quantities (Phase 1). Phase 2 will persist
            month-end snapshots so historical months freeze at their true positions.
          </div>
        </div>
      )}
    </div>
  );
}
