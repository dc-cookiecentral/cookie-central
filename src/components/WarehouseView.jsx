import { useState, useMemo, Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Pill from './Pill';
import { useDotInventory } from '../hooks/useDotInventory';
import { useAssemblersInventory } from '../hooks/useAssemblersInventory';
import { useIncomingInventory } from '../hooks/useRawMaterialOrders';
import { formatDateTime } from '../utils/dates';
import { groupByIngredient, worstStatus } from '../utils/ingredientGrouping';

const TH = 'px-2 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';
const THC = TH + ' text-center';

function SectionHeader({ open, onToggle, title, subtitle }) {
  return (
    <div
      onClick={onToggle}
      className="bg-gradient-to-br from-dk to-[#3D2D4D] px-3.5 py-2.5 cursor-pointer flex items-center justify-between"
    >
      <div>
        <div className="text-[11px] font-extrabold text-white">
          {open ? '– ' : '+ '}
          {title}
        </div>
        <div className="text-[8px] text-[#B8A8C8]">{subtitle}</div>
      </div>
      <Link
        to="/uploads"
        onClick={(e) => e.stopPropagation()}
        className="text-[9px] font-semibold text-pk bg-white/90 rounded px-2 py-1 hover:bg-white"
      >
        Upload
      </Link>
    </div>
  );
}

export default function WarehouseView() {
  const navigate = useNavigate();
  const dot = useDotInventory();
  const asm = useAssemblersInventory();
  const incoming = useIncomingInventory();
  const [open, setOpen] = useState({ dot: true, asm: true });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  // Topline raw-material stock rolled up to the normalized ingredient; vendor
  // rows expand underneath (parallels Reference > Raw Materials).
  const asmGroups = useMemo(() => groupByIngredient(asm.rawMaterials), [asm.rawMaterials]);
  const pkgGroups = useMemo(() => groupByIngredient(asm.packaging), [asm.packaging]);
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleGroup = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden">
      {/* ---- DOT Foods ---- */}
      <SectionHeader
        open={open.dot}
        onToggle={() => toggle('dot')}
        title="DOT Foods"
        subtitle={`Redistributor · Last upload: ${formatDateTime(dot.lastSnapshot)}`}
      />
      {open.dot &&
        (dot.loading ? (
          <div className="px-4 py-6 text-center text-sm text-gr">Loading…</div>
        ) : dot.error ? (
          <div className="px-4 py-3 text-xs text-red-600">{dot.error}</div>
        ) : dot.rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gr">
            No DOT inventory — upload a DOT report.
          </div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-pc">
                <th className={TH}>Product</th>
                <th className={THR}>On-Hand</th>
                <th className={THR + ' text-emerald-600'}>In</th>
                <th className={THR + ' text-violet-700'}>To Ret</th>
                <th className={THR + ' text-amber-600'}>Alloc</th>
                <th className={THR + ' font-extrabold'}>Avail</th>
                <th className={THC}>Wks</th>
              </tr>
            </thead>
            <tbody>
              {dot.rows.map((d) => {
                const avail = (d.on_hand ?? 0) - (d.allocated ?? 0);
                const weeks = d.weekly_velocity ? avail / d.weekly_velocity : null;
                const low = weeks != null && weeks < 3;
                return (
                  <tr key={d.sku} className={`border-b border-bg ${low ? 'bg-amber-50' : ''}`}>
                    <td className="px-2 py-1.5 font-semibold">
                      {d.products?.full_name || d.products?.short_name || d.sku}
                      <div className="text-[8px] text-gr">{d.sku}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold">{(d.on_hand ?? 0).toLocaleString()}</td>
                    <td className={`px-2 py-1.5 text-right ${d.incoming ? 'text-emerald-600' : 'text-lt'}`}>
                      {d.incoming ? `+${d.incoming.toLocaleString()}` : '--'}
                    </td>
                    <td className="px-2 py-1.5 text-right text-violet-700">
                      {d.in_transit_to_retailer ? `-${d.in_transit_to_retailer.toLocaleString()}` : '--'}
                    </td>
                    <td className="px-2 py-1.5 text-right text-amber-600">
                      {d.allocated ? `-${d.allocated.toLocaleString()}` : '--'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-extrabold">{avail.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-center">
                      {weeks != null ? (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            low ? 'bg-amber-100 text-yellow-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {weeks.toFixed(1)}w
                        </span>
                      ) : (
                        <span className="text-gr text-[9px]">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}

      {/* ---- Assemblers Chicago ---- */}
      <SectionHeader
        open={open.asm}
        onToggle={() => toggle('asm')}
        title="Assemblers Chicago"
        subtitle={`Internal inventory · Last upload: ${formatDateTime(asm.lastUpload)}`}
      />
      {open.asm &&
        (asm.loading ? (
          <div className="px-4 py-6 text-center text-sm text-gr">Loading…</div>
        ) : asm.error ? (
          <div className="px-4 py-3 text-xs text-red-600">{asm.error}</div>
        ) : asm.rawMaterials.length === 0 && asm.packaging.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gr">
            No Assemblers inventory — upload an inventory report.
          </div>
        ) : (
          <>
            <div className="px-3 pt-1.5 pb-0.5 text-[8px] font-semibold text-md uppercase flex items-center justify-between flex-wrap gap-1">
              <span>Raw Materials — on-hand by ingredient · expand for vendors</span>
              <span className="normal-case font-normal text-gr">
                On Hand received ·{' '}
                <span className="text-blue-700 font-semibold">Ordered</span> placed ·{' '}
                <span className="text-violet-700 font-semibold">Shipped</span> in transit · Total Expected = sum
              </span>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-pc">
                  <th className={TH}>Ingredient</th>
                  <th className={THR}>On Hand</th>
                  <th className={THR + ' text-blue-700'}>Ordered</th>
                  <th className={THR + ' text-violet-700'}>Shipped</th>
                  <th className={THR + ' font-extrabold'}>Total Exp</th>
                  <th className={THR}>Lead</th>
                  <th className={THC}>Flag</th>
                </tr>
              </thead>
              <tbody>
                {asmGroups.map((g) => {
                  const isOpen = expanded.has(g.key);
                  const inc = g.items.reduce(
                    (acc, m) => {
                      const i = incoming[m.id] || { ordered: 0, shipped: 0 };
                      acc.ordered += i.ordered;
                      acc.shipped += i.shipped;
                      return acc;
                    },
                    { ordered: 0, shipped: 0 }
                  );
                  const onHand = g.total;
                  const totalExp = onHand + inc.ordered + inc.shipped;
                  const maxLead = g.items.reduce((mx, m) => Math.max(mx, m.default_lead_days || 0), 0);
                  const expired = g.items.reduce((s, m) => s + (m.expired_quantity || 0), 0);
                  const status = worstStatus(g.statuses);
                  return (
                    <Fragment key={g.key}>
                      <tr
                        onClick={() => toggleGroup(g.key)}
                        className={`border-b border-bg cursor-pointer hover:bg-pc ${
                          status === 'partial_expired'
                            ? 'bg-red-50'
                            : status === 'almost_expired'
                            ? 'bg-amber-50'
                            : ''
                        }`}
                      >
                        <td className="px-2 py-1.5 font-semibold">
                          <span className="inline-block w-3 text-gr">{isOpen ? '▾' : '▸'}</span>
                          {g.name}
                          {g.items.length > 1 && (
                            <span className="text-[8px] text-gr ml-1">×{g.items.length}</span>
                          )}
                          {expired > 0 && (
                            <span className="text-[8px] text-red-600 ml-1">
                              ({expired.toLocaleString()} exp)
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold">
                          {onHand.toLocaleString()}
                          <span className="text-[8px] text-gr ml-0.5">{g.unit}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {inc.ordered > 0 ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-700">
                              +{inc.ordered.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-lt">--</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {inc.shipped > 0 ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-violet-100 text-violet-700">
                              +{inc.shipped.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-lt">--</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-extrabold">
                          {totalExp.toLocaleString()}
                          <span className="text-[8px] text-gr ml-0.5">{g.unit}</span>
                        </td>
                        <td className={`px-2 py-1.5 text-right ${maxLead >= 21 ? 'text-amber-600' : 'text-gr'}`}>
                          {maxLead ? `${maxLead}d` : '--'}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Pill status={status} />
                        </td>
                      </tr>
                      {isOpen &&
                        g.items.map((rm) => {
                          const i = incoming[rm.id] || { ordered: 0, shipped: 0 };
                          const itemExp = (rm.quantity ?? 0) + i.ordered + i.shipped;
                          return (
                            <tr
                              key={rm.code}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/reference?material=${encodeURIComponent(rm.code)}`);
                              }}
                              className="border-b border-bg cursor-pointer bg-bg/40 hover:bg-pc"
                            >
                              <td className="px-2 py-1 pl-7 text-[10px] text-md">
                                {rm.name}
                                <span className="font-mono text-[8px] text-gr ml-1.5">{rm.code}</span>
                                <span className="text-pk text-[9px] ml-2 underline">detail →</span>
                              </td>
                              <td className="px-2 py-1 text-right text-[10px]">
                                {(rm.quantity ?? 0).toLocaleString()}
                                <span className="text-[8px] text-gr ml-0.5">{rm.unit}</span>
                              </td>
                              <td className="px-2 py-1 text-right text-[10px] text-blue-700">
                                {i.ordered > 0 ? `+${i.ordered.toLocaleString()}` : <span className="text-lt">--</span>}
                              </td>
                              <td className="px-2 py-1 text-right text-[10px] text-violet-700">
                                {i.shipped > 0 ? `+${i.shipped.toLocaleString()}` : <span className="text-lt">--</span>}
                              </td>
                              <td className="px-2 py-1 text-right text-[10px] font-semibold">
                                {itemExp.toLocaleString()}
                                <span className="text-[8px] text-gr ml-0.5">{rm.unit}</span>
                              </td>
                              <td className={`px-2 py-1 text-right text-[10px] ${rm.default_lead_days >= 21 ? 'text-amber-600' : 'text-gr'}`}>
                                {rm.default_lead_days != null ? `${rm.default_lead_days}d` : '--'}
                              </td>
                              <td className="px-2 py-1 text-center">
                                <Pill status={rm.expiry_status} />
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {asm.packaging.length > 0 && (
              <>
                <div className="px-3 pt-1.5 pb-0.5 text-[8px] font-semibold text-md uppercase border-t border-lt">
                  Packaging — on-hand by item · expand for vendors
                </div>
                <table className="w-full border-collapse text-[11px]">
                  <tbody>
                    {pkgGroups.map((g) => {
                      const isOpen = expanded.has(g.key);
                      return (
                        <Fragment key={g.key}>
                          <tr
                            onClick={() => toggleGroup(g.key)}
                            className="border-b border-bg cursor-pointer hover:bg-pc"
                          >
                            <td className="px-2 py-1.5 font-semibold">
                              <span className="inline-block w-3 text-gr">{isOpen ? '▾' : '▸'}</span>
                              {g.name}
                              {g.items.length > 1 && (
                                <span className="text-[8px] text-gr ml-1">×{g.items.length}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right font-bold">
                              {g.total.toLocaleString()}
                              <span className="text-[8px] text-gr ml-0.5">{g.unit}</span>
                            </td>
                          </tr>
                          {isOpen &&
                            g.items.map((pk) => (
                              <tr
                                key={pk.code}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/reference?material=${encodeURIComponent(pk.code)}`);
                                }}
                                className="border-b border-bg cursor-pointer bg-bg/40 hover:bg-pc"
                              >
                                <td className="px-2 py-1 pl-7 text-[10px] text-md">
                                  {pk.name}
                                  <span className="font-mono text-[8px] text-gr ml-1.5">{pk.code}</span>
                                  <span className="text-pk text-[9px] ml-2 underline">detail →</span>
                                </td>
                                <td className="px-2 py-1 text-right text-[10px]">
                                  {(pk.quantity ?? 0).toLocaleString()}
                                  <span className="text-[8px] text-gr ml-0.5">{pk.unit}</span>
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </>
        ))}
    </div>
  );
}
