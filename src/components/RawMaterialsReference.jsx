import { useState, Fragment } from 'react';
import { useRawMaterialsOverview } from '../hooks/useRawMaterialsOverview';

const TH = 'px-2 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider whitespace-nowrap';
const THR = TH + ' text-right';

const usd = (n, dp = 2) =>
  n == null ? '--' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
const qty = (n) => (n == null ? '--' : Math.round(Number(n)).toLocaleString());
const wks = (n) => (n == null ? '--' : `${n.toFixed(1)}w`);

const TIER_CLS = {
  red: 'text-red-700 bg-red-100',
  yellow: 'text-yellow-800 bg-yellow-100',
  green: 'text-emerald-700 bg-emerald-50',
};

// Reference > Raw Materials — one row per normalized ingredient, grouped by type
// (Ingredients / Finished Goods / Packaging). Double-click a row to expand the
// brand variants from the ingredient master.
export default function RawMaterialsReference() {
  const { groups, loading, error } = useRawMaterialsOverview();
  const [expanded, setExpanded] = useState(() => new Set());

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!groups.length) {
    return (
      <div className="bg-cd border border-lt rounded-xl p-8 text-center">
        <div className="text-sm font-semibold text-dk mb-1">No raw materials yet</div>
        <div className="text-xs text-md">
          Import the Ingredient Master (Uploads → Reference Data) and an Assemblers inventory report.
        </div>
      </div>
    );
  }

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden">
      <div className="px-3 py-2 text-[8px] font-semibold uppercase text-pk border-b border-lt">
        Raw materials · run rate &amp; reorder timing from production + inventory · double-click a row for brand variants
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px] whitespace-nowrap">
          <thead>
            <tr className="bg-pc">
              <th className={TH}>Ingredient</th>
              <th className={TH}>Type</th>
              <th className={THR}>Avg COGS</th>
              <th className={THR}>On Hand</th>
              <th className={THR}>Run Rate</th>
              <th className={THR}>Wks OH</th>
              <th className={THR}>Expiring</th>
              <th className={THR}>Net Avail</th>
              <th className={THR}>Net Wks</th>
              <th className={THR}>Lead</th>
              <th className={THR}>Reorder By</th>
              <th className={TH}>Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.type}>
                <tr className="bg-bg">
                  <td colSpan={12} className="px-3 py-1 text-[9px] font-extrabold uppercase tracking-wider text-pk">
                    {g.type} <span className="text-gr font-semibold">· {g.rows.length}</span>
                  </td>
                </tr>
                {g.rows.map((r) => {
                  const open = expanded.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onDoubleClick={() => toggle(r.id)}
                        title="Double-click for brand variants"
                        className="border-b border-bg cursor-pointer hover:bg-pc select-none"
                      >
                        <td className="px-2 py-1.5 font-semibold text-dk">
                          <span className="inline-block w-3 text-gr">{r.suppliers.length ? (open ? '▾' : '▸') : ''}</span>
                          {r.name}
                          {r.suppliers.length > 1 && <span className="text-[8px] text-gr ml-1">×{r.suppliers.length}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-md">{r.type}</td>
                        <td className="px-2 py-1.5 text-right">{usd(r.avgCogs)}</td>
                        <td className="px-2 py-1.5 text-right font-bold">
                          {qty(r.onHand)}
                          <span className="text-[8px] text-gr ml-0.5">{r.unit}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right">{r.runRate != null ? `${qty(r.runRate)}/wk` : '--'}</td>
                        <td className="px-2 py-1.5 text-right">{wks(r.weeksOnHand)}</td>
                        <td className={`px-2 py-1.5 text-right ${r.expiring > 0 ? 'text-amber-700 font-semibold' : 'text-gr'}`}>
                          {r.expiring > 0 ? qty(r.expiring) : '--'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold">{qty(r.netAvailable)}</td>
                        <td className="px-2 py-1.5 text-right">{wks(r.netWeeks)}</td>
                        <td className="px-2 py-1.5 text-right">{r.leadDays != null ? `${r.leadDays}d` : '--'}</td>
                        <td className="px-2 py-1.5 text-right">
                          {r.reorderTier ? (
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${TIER_CLS[r.reorderTier]}`}>
                              {r.reorderByWeeks <= 0 ? 'NOW' : `${r.reorderByWeeks.toFixed(1)}w`}
                            </span>
                          ) : (
                            '--'
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-md max-w-[280px] whitespace-normal">
                          {r.recommendation ?? <span className="text-gr italic">No production history</span>}
                        </td>
                      </tr>
                      {open &&
                        r.suppliers.map((s) => (
                          <tr key={s.id} className="border-b border-bg bg-bg/40 text-[10px]">
                            <td className="px-2 py-1 pl-7 text-md" colSpan={2}>
                              <span className="font-semibold">{s.brand || '(brand?)'}</span>
                              <span className="text-gr ml-1.5">{s.distributor || '--'}</span>
                              {s.dc_item_number && <span className="font-mono text-[8px] text-gr ml-1.5">{s.dc_item_number}</span>}
                            </td>
                            <td className="px-2 py-1 text-right">{usd(s.cost_per_unit)}</td>
                            <td className="px-2 py-1 text-right text-gr" colSpan={2}>
                              {s.pkg_type || '--'}
                              {s.qty_per_package != null && <span className="ml-1">· {qty(s.qty_per_package)}/pkg</span>}
                            </td>
                            <td className="px-2 py-1 text-right text-gr" colSpan={2}>
                              {s.moq ? `MOQ ${s.moq}` : ''}
                            </td>
                            <td className="px-2 py-1 text-gr" colSpan={2}>
                              {s.shelf_life_text ? `Shelf ${s.shelf_life_text}` : ''}
                            </td>
                            <td className="px-2 py-1 text-right text-gr">{s.lead_time_text || '--'}</td>
                            <td className="px-2 py-1 text-gr" />
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
