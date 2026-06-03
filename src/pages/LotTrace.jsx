import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Pill from '../components/Pill';
import { useLotTrace } from '../hooks/useLotTrace';
import { formatDate } from '../utils/dates';

const TH = 'px-2 py-1.5 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

// Section header (matches the PO-detail convention).
function StageHeader({ children, tone = 'pk' }) {
  const color = tone === 'violet' ? 'text-violet-700' : tone === 'blue' ? 'text-blue-700' : 'text-pk';
  return (
    <div className={`text-[8px] font-bold uppercase mb-1.5 pb-1 border-b-2 border-lt ${color}`}>
      {children}
    </div>
  );
}

function TraceLink({ lot, label }) {
  if (!lot) return null;
  return (
    <Link
      to={`/trace?lot=${encodeURIComponent(lot)}`}
      className="text-[9px] text-pk hover:text-pm underline underline-offset-2 whitespace-nowrap"
      title={`Trace lot ${lot}`}
    >
      {label || 'Trace ↗'}
    </Link>
  );
}

// One finished-good lot and everything around it: raw materials in (backward),
// pallets / shipments / POs out (forward).
function FgLotGroup({ group, queryNorm }) {
  const { fgLot, run, runCount, rawSources, pallets, shipments, poLots } = group;
  return (
    <div className="bg-bg border border-lt rounded-xl mb-3">
      {/* FG lot header */}
      <div className="px-3 py-2.5 border-b border-lt flex justify-between items-start">
        <div>
          <div className="text-[8px] text-gr font-semibold uppercase">Finished-good lot</div>
          <div className="text-[16px] font-black font-mono text-dk leading-tight">{fgLot}</div>
          {run && (
            <div className="text-[10px] text-md mt-0.5">
              {run.fg_item_description || run.fg_item_code}{' '}
              {run.fg_item_code && <span className="text-gr">({run.fg_item_code})</span>}
            </div>
          )}
        </div>
        <div className="text-right text-[9px] text-gr">
          {run ? (
            <>
              <div>Job {run.job_id}</div>
              <div>Produced {formatDate(run.produced_date)}</div>
              {run.quantity_produced != null && (
                <div className="font-semibold text-md">
                  {Number(run.quantity_produced).toLocaleString()} {run.quantity_unit || ''}
                </div>
              )}
              {run.fg_expiry_date && <div>Exp {formatDate(run.fg_expiry_date)}</div>}
            </>
          ) : (
            <div className="italic">No production-run record</div>
          )}
        </div>
      </div>

      {runCount > 1 && (
        <div className="px-3 pt-2 text-[9px] text-amber-700">
          ⚠ {runCount} production runs share this FG lot code — showing the first; verify upstream.
        </div>
      )}

      <div className="p-3 space-y-3">
        {/* Backward: raw materials consumed */}
        <div>
          <StageHeader>← Raw materials in</StageHeader>
          {rawSources.length === 0 ? (
            <div className="text-[10px] text-gr italic">No subcomponent records for this run.</div>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-pc">
                  <th className={TH}>Subcomponent</th>
                  <th className={TH}>Raw lot #</th>
                  <th className={THR}>Consumed</th>
                  <th className={TH}>Received</th>
                  <th className={TH}>Expiry</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {rawSources.map(({ sub, rawLot }) => {
                  const isQuery = sub.raw_lot_code && queryNorm === normForRow(sub.raw_lot_code);
                  return (
                    <tr key={sub.id} className={`border-b border-bg ${isQuery ? 'bg-pink-50' : ''}`}>
                      <td className="px-2 py-1.5 text-md">
                        {sub.subcomponent_description || sub.subcomponent_code || '—'}
                      </td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-dk">
                        {sub.raw_lot_code || '—'}
                        {!rawLot && sub.raw_lot_code && (
                          <span className="ml-1 text-[8px] text-amber-600" title="No matching raw_material_lots row">
                            unmatched
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {sub.quantity_consumed != null
                          ? `${Number(sub.quantity_consumed).toLocaleString()} ${sub.unit_of_measure || ''}`
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-md">{rawLot ? formatDate(rawLot.received_date) : '—'}</td>
                      <td className="px-2 py-1.5 text-md">{rawLot ? formatDate(rawLot.expiry_date) : '—'}</td>
                      <td className="px-2 py-1.5 text-right">
                        {sub.raw_lot_code && <TraceLink lot={sub.raw_lot_code} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Forward: pallets */}
        {pallets.length > 0 && (
          <div>
            <StageHeader>Pallets built</StageHeader>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-pc">
                  <th className={TH}>Pallet #</th>
                  <th className={THR}>Units</th>
                  <th className={TH}>Produced</th>
                </tr>
              </thead>
              <tbody>
                {pallets.map((p) => (
                  <tr key={p.id} className="border-b border-bg">
                    <td className="px-2 py-1.5 font-mono">{p.pallet_number || '—'}</td>
                    <td className="px-2 py-1.5 text-right">
                      {p.units_produced != null
                        ? `${Number(p.units_produced).toLocaleString()} ${p.unit_of_measure || ''}`
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-md">{formatDate(p.produced_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Forward: shipments */}
        {shipments.length > 0 && (
          <div>
            <StageHeader tone="blue">Shipped out →</StageHeader>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-pc">
                  <th className={TH}>Shipment #</th>
                  <th className={TH}>Ship to</th>
                  <th className={TH}>Date</th>
                  <th className={THR}>Cases</th>
                  <th className={TH}>Order ref</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <tr key={s.id} className="border-b border-bg">
                    <td className="px-2 py-1.5 font-mono">{s.shipment_number || '—'}</td>
                    <td className="px-2 py-1.5 text-md">{s.ship_to || '—'}</td>
                    <td className="px-2 py-1.5 text-md">{formatDate(s.ship_date)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {s.case_quantity != null
                        ? `${Number(s.case_quantity).toLocaleString()} ${s.case_unit || ''}`
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-gr font-mono">{s.ship_order_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Forward: arrived against PO */}
        {poLots.length > 0 && (
          <div>
            <StageHeader tone="violet">Arrived against PO →</StageHeader>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-pc">
                  <th className={TH}>PO</th>
                  <th className={TH}>Retailer</th>
                  <th className={TH}>SKU</th>
                  <th className={THR}>Cases</th>
                  <th className={TH}>Received</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {poLots.map(({ poLot, po }) => (
                  <tr key={poLot.id} className="border-b border-bg">
                    <td className="px-2 py-1.5 font-bold">
                      {po ? (
                        <Link to={`/orders/${po.po_number}`} className="text-pk hover:text-pm underline underline-offset-2">
                          {po.po_number}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-md">{po?.retailer || '—'}</td>
                    <td className="px-2 py-1.5 text-md">{poLot.sku || '—'}</td>
                    <td className="px-2 py-1.5 text-right">{poLot.quantity_cases?.toLocaleString() ?? '—'}</td>
                    <td className="px-2 py-1.5 text-md">{formatDate(poLot.received_date)}</td>
                    <td className="px-2 py-1.5">{po?.ship_status && <Pill status={po.ship_status} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// local mirror of normLot for row highlighting (avoids importing twice)
function normForRow(s) {
  return String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

// Recall report — one line per PO/customer touching the queried lot (task 11.4).
function RecallReport({ trace }) {
  const { query, recallPOs } = trace;
  if (!recallPOs.length) return null;

  const copy = () => {
    const lines = [
      `RECALL REPORT — lot ${query}`,
      `Generated for trace query "${query}"`,
      '',
      'PO,Retailer,Destination DC,Ship status,Delivery date,Via FG lot',
      ...recallPOs.map(({ po, viaLot }) =>
        [po.po_number, po.retailer, po.destination_dc || '', po.ship_status || '', po.delivery_date || '', viaLot].join(',')
      ),
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-3">
      <div className="flex justify-between items-center mb-1.5">
        <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
          Recall report — {recallPOs.length} PO{recallPOs.length === 1 ? '' : 's'} touching this lot
        </div>
        <button
          onClick={copy}
          className="text-[9px] font-semibold text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-100"
        >
          Copy as CSV
        </button>
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className={TH}>PO</th>
            <th className={TH}>Retailer</th>
            <th className={TH}>Destination</th>
            <th className={TH}>Delivery</th>
            <th className={TH}>Via FG lot</th>
          </tr>
        </thead>
        <tbody>
          {recallPOs.map(({ po, viaLot }) => (
            <tr key={po.id} className="border-b border-red-100">
              <td className="px-2 py-1 font-bold">
                <Link to={`/orders/${po.po_number}`} className="text-pk hover:text-pm underline underline-offset-2">
                  {po.po_number}
                </Link>
              </td>
              <td className="px-2 py-1 text-md">{po.retailer || '—'}</td>
              <td className="px-2 py-1 text-md">{po.destination_dc || '—'}</td>
              <td className="px-2 py-1 text-md">{formatDate(po.delivery_date)}</td>
              <td className="px-2 py-1 font-mono text-gr">{viaLot}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LotTrace() {
  const [params, setParams] = useSearchParams();
  const lot = params.get('lot') || '';
  const [input, setInput] = useState(lot);

  // Keep the box in sync when arriving via a deep-link / browser nav.
  useEffect(() => {
    setInput(lot);
  }, [lot]);

  const { trace, loading, error } = useLotTrace(lot);

  const submit = (e) => {
    e.preventDefault();
    const v = input.trim();
    if (v) setParams({ lot: v });
    else setParams({});
  };

  return (
    <div className="bg-cd border border-lt rounded-xl">
      {/* header + search */}
      <div className="px-[18px] py-4 border-b border-lt">
        <div className="text-[22px] font-black">Lot Trace</div>
        <div className="text-[10px] text-gr mt-0.5">
          Enter any lot code — raw material, finished-good, or outbound — to see the full chain both directions.
        </div>
        <form onSubmit={submit} className="flex gap-2 mt-3 max-w-[420px]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. 6147AM"
            className="flex-1 px-3 py-1.5 rounded-lg border border-lt text-[12px] font-mono bg-bg"
          />
          <button
            type="submit"
            className="bg-pk text-white rounded-lg px-4 py-1.5 text-[11px] font-bold hover:bg-pm"
          >
            Trace
          </button>
        </form>
      </div>

      <div className="px-[18px] py-4">
        {!lot && (
          <div className="text-[11px] text-gr py-8 text-center">
            Type a lot code above, or follow a “Trace” link from a PO, delivery lot, or FIFO row.
          </div>
        )}
        {lot && loading && <div className="text-sm text-gr py-10 text-center">Tracing…</div>}
        {lot && error && <div className="text-sm text-red-600 py-10 text-center">{error}</div>}

        {lot && !loading && !error && trace && !trace.found && (
          <div className="py-10 text-center">
            <div className="text-sm text-md">
              No records found for lot <span className="font-mono font-bold">{lot}</span>.
            </div>
            <div className="text-[10px] text-gr mt-1">
              Checked raw lots, production runs, pallets, shipments, and PO lots.
            </div>
          </div>
        )}

        {lot && !loading && !error && trace && trace.found && (
          <>
            {/* summary banner */}
            <div className="bg-gradient-to-br from-pink-100 to-violet-100 rounded-xl px-3 py-2 mb-3">
              <div className="text-[10px] text-md leading-snug">
                Tracing <span className="font-mono font-bold text-dk">{trace.query}</span> —{' '}
                {trace.entryLabel}.
                {' '}Found in: <span className="font-semibold">{trace.matchedTables.join(', ')}</span>.
                {trace.fgLots.length > 0 && (
                  <>
                    {' '}Linked to {trace.fgLots.length} finished-good lot
                    {trace.fgLots.length === 1 ? '' : 's'}.
                  </>
                )}
              </div>
            </div>

            {/* raw-lot entry detail (when the query itself is a raw lot) */}
            {trace.entryKind === 'raw' && trace.rawEntry?.lots?.length > 0 && (
              <div className="bg-bg border border-lt rounded-xl mb-3 px-3 py-2.5">
                <StageHeader>{trace.entryCategory === 'packaging' ? 'Packaging lot' : 'Raw-material lot'}</StageHeader>
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-pc">
                      <th className={TH}>Material</th>
                      <th className={TH}>Lot #</th>
                      <th className={THR}>Qty</th>
                      <th className={TH}>Received</th>
                      <th className={TH}>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trace.rawEntry.lots.map((l) => (
                      <tr key={l.id} className="border-b border-bg">
                        <td className="px-2 py-1.5 text-md">
                          {l.raw_materials?.name || l.raw_materials?.code || '—'}
                        </td>
                        <td className="px-2 py-1.5 font-mono font-semibold text-dk">{l.lot_number}</td>
                        <td className="px-2 py-1.5 text-right">
                          {l.quantity != null
                            ? `${Number(l.quantity).toLocaleString()} ${l.raw_materials?.unit || ''}`
                            : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-md">{formatDate(l.received_date)}</td>
                        <td className="px-2 py-1.5 text-md">{formatDate(l.expiry_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {trace.fgLots.length === 0 && (
                  <div className="text-[10px] text-gr italic mt-2">
                    Not yet consumed in any recorded production run.
                  </div>
                )}
              </div>
            )}

            {/* recall report */}
            <RecallReport trace={trace} />

            {/* the FG-lot chain(s) */}
            {trace.fgLots.map((g) => (
              <FgLotGroup key={g.fgLot} group={g} queryNorm={trace.normalized} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
