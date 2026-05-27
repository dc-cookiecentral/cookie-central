import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Pill from './Pill';
import { useDotInventory } from '../hooks/useDotInventory';
import { useAssemblersInventory } from '../hooks/useAssemblersInventory';
import { formatDateTime } from '../utils/dates';

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
  const [open, setOpen] = useState({ dot: true, asm: true });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

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
            <div className="px-3 pt-1.5 pb-0.5 text-[8px] font-semibold text-md uppercase">
              Raw Materials — click for Reference detail
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-pc">
                  <th className={TH}>Code</th>
                  <th className={TH}>Ingredient</th>
                  <th className={THR}>Qty</th>
                  <th className={THR}>Lead</th>
                  <th className={THR}>Makes</th>
                  <th className={THR}>Wks</th>
                  <th className={THC}>Flag</th>
                </tr>
              </thead>
              <tbody>
                {asm.rawMaterials.map((rm) => (
                  <tr
                    key={rm.code}
                    onClick={() => navigate(`/reference?material=${encodeURIComponent(rm.code)}`)}
                    className={`border-b border-bg cursor-pointer hover:bg-pc ${
                      rm.expiry_status === 'partial_expired'
                        ? 'bg-red-50'
                        : rm.expiry_status === 'almost_expired'
                        ? 'bg-amber-50'
                        : ''
                    }`}
                  >
                    <td className="px-2 py-1.5 font-semibold text-gr text-[8px] font-mono">{rm.code}</td>
                    <td className="px-2 py-1.5 font-semibold">
                      {rm.name}
                      {rm.expired_quantity > 0 && (
                        <span className="text-[8px] text-red-600 ml-1">
                          ({rm.expired_quantity.toLocaleString()} exp)
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold">
                      {(rm.quantity ?? 0).toLocaleString()}
                      <span className="text-[8px] text-gr ml-0.5">{rm.unit}</span>
                    </td>
                    <td className={`px-2 py-1.5 text-right ${rm.default_lead_days >= 21 ? 'text-amber-600' : 'text-gr'}`}>
                      {rm.default_lead_days != null ? `${rm.default_lead_days}d` : '--'}
                    </td>
                    {/* Makes/Wks need production consumption rates (Assemblers production report) */}
                    <td className="px-2 py-1.5 text-right text-gr">--</td>
                    <td className="px-2 py-1.5 text-right text-gr">--</td>
                    <td className="px-2 py-1.5 text-center">
                      <Pill status={rm.expiry_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {asm.packaging.length > 0 && (
              <>
                <div className="px-3 pt-1.5 pb-0.5 text-[8px] font-semibold text-md uppercase border-t border-lt">
                  Packaging
                </div>
                <table className="w-full border-collapse text-[11px]">
                  <tbody>
                    {asm.packaging.map((pk) => (
                      <tr key={pk.code} className="border-b border-bg">
                        <td className="px-2 py-1.5 font-semibold text-gr text-[8px] font-mono w-[60px]">
                          {pk.code}
                        </td>
                        <td className="px-2 py-1.5 font-semibold">{pk.name}</td>
                        <td className="px-2 py-1.5 text-right font-bold">
                          {(pk.quantity ?? 0).toLocaleString()}
                          <span className="text-[8px] text-gr ml-0.5">{pk.unit}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        ))}
    </div>
  );
}
