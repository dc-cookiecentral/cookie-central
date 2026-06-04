import { Fragment, useEffect, useState } from 'react';
import { useRawMaterialOrders, receiveRawMaterialOrder } from '../hooks/useRawMaterialOrders';
import { formatDate } from '../utils/dates';

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';
const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyLot = () => ({ lot_number: '', quantity: '', expiry_date: '' });

// Landing / receiving (the lot-origin point). For each open order, capture the
// land date + the lot number(s) and expiry the product actually arrived with.
// One order can land as multiple lots, so the form supports adding rows.
export default function LandingView({ reloadKey }) {
  const { orders, loading, error, refresh } = useRawMaterialOrders();
  const [openId, setOpenId] = useState(null);
  const [landDate, setLandDate] = useState(todayIso());
  const [bol, setBol] = useState('');
  const [lots, setLots] = useState([emptyLot()]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (reloadKey !== undefined) refresh();
  }, [reloadKey, refresh]);

  const startReceive = (order) => {
    setOpenId(order.id);
    setLandDate(todayIso());
    setBol('');
    setLots([emptyLot()]);
    setFormError(null);
  };

  const setLot = (i, patch) =>
    setLots((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLot = () => setLots((ls) => [...ls, emptyLot()]);
  const removeLot = (i) => setLots((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const submit = async (order) => {
    const valid = lots.filter((l) => Number(l.quantity) > 0);
    if (valid.length === 0) {
      setFormError('Enter at least one lot with a quantity.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await receiveRawMaterialOrder(order, { landDate, lots: valid, bolReference: bol });
      setOpenId(null);
      refresh();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-sm text-gr py-8 text-center">Loading orders…</div>;
  if (error) return <div className="text-sm text-red-600 py-4">{error}</div>;

  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden">
      <div className="px-4 py-2 border-b border-lt">
        <div className="text-[10px] font-bold text-pk uppercase">Awaiting landing</div>
        <div className="text-[9px] text-md">
          Record land date + inbound BOL # + lot number(s) + expiry. Lot numbers and the
          inbound BOL (from the distributor) are captured here.
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gr">No open orders.</div>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-pc">
              <th className={TH}>Ingredient</th>
              <th className={TH}>Distributor / Brand</th>
              <th className={THR}>Ordered</th>
              <th className={THR}>Expected</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <Fragment key={o.id}>
                <tr className="border-b border-bg">
                  <td className="px-3 py-2 font-semibold">
                    {o.raw_materials?.name}
                    <div className="text-[8px] text-gr font-mono">{o.raw_materials?.code}</div>
                  </td>
                  <td className="px-3 py-2 text-md">
                    {o.distributor ? `${o.distributor}${o.brand ? ' — ' + o.brand : ''}` : '--'}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {(o.quantity ?? 0).toLocaleString()}
                    <span className="text-[8px] text-gr ml-0.5">{o.raw_materials?.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gr">{formatDate(o.expected_delivery)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => (openId === o.id ? setOpenId(null) : startReceive(o))}
                      className="text-[10px] font-semibold text-pk hover:text-pm underline"
                    >
                      {openId === o.id ? 'Cancel' : 'Receive'}
                    </button>
                  </td>
                </tr>
                {openId === o.id && (
                  <tr className="bg-bg">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <label className="text-[10px] font-semibold text-md">Land date</label>
                        <input
                          type="date"
                          value={landDate}
                          onChange={(e) => setLandDate(e.target.value)}
                          className="border border-lt rounded px-2 py-1 text-[10px]"
                        />
                        <label className="text-[10px] font-semibold text-md">BOL #</label>
                        <input
                          value={bol}
                          onChange={(e) => setBol(e.target.value)}
                          placeholder="Inbound BOL #"
                          className="border border-lt rounded px-2 py-1 text-[10px] w-[150px]"
                        />
                        <span className="text-[10px] text-gr">
                          ordered {(o.quantity ?? 0).toLocaleString()} {o.raw_materials?.unit}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {lots.map((l, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              value={l.lot_number}
                              onChange={(e) => setLot(i, { lot_number: e.target.value })}
                              placeholder="Lot #"
                              className="border border-lt rounded px-2 py-1 text-[10px] w-[140px]"
                            />
                            <input
                              type="number"
                              min="0"
                              value={l.quantity}
                              onChange={(e) => setLot(i, { quantity: e.target.value })}
                              placeholder="Qty"
                              className="border border-lt rounded px-2 py-1 text-[10px] w-[90px] text-right"
                            />
                            <label className="text-[9px] text-gr">exp</label>
                            <input
                              type="date"
                              value={l.expiry_date}
                              onChange={(e) => setLot(i, { expiry_date: e.target.value })}
                              className="border border-lt rounded px-2 py-1 text-[10px]"
                            />
                            <button
                              onClick={() => removeLot(i)}
                              className="text-[10px] text-gr hover:text-red-600"
                              title="Remove lot"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <button onClick={addLot} className="text-[10px] text-pk underline">
                          + Add lot
                        </button>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-gr">
                            received{' '}
                            <span className="font-semibold text-dk">
                              {lots
                                .reduce((s, l) => s + (Number(l.quantity) || 0), 0)
                                .toLocaleString()}
                            </span>{' '}
                            {o.raw_materials?.unit}
                          </span>
                          {formError && <span className="text-[10px] text-red-600">{formError}</span>}
                          <button
                            onClick={() => submit(o)}
                            disabled={busy}
                            className="text-[11px] font-semibold bg-pk text-white rounded-lg px-3 py-1.5 hover:bg-pm disabled:opacity-40"
                          >
                            {busy ? 'Saving…' : 'Confirm landing'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
