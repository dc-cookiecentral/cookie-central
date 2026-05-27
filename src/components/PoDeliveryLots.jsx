import { useState } from 'react';
import { usePoLots, addPoLot, updatePoBol } from '../hooks/usePurchaseOrders';
import { formatDate } from '../utils/dates';

const TH = 'px-2 py-1.5 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

// lot source → [label, badge classes]
const LOT_SOURCE = {
  email: ['Email', 'bg-violet-100 text-violet-700 border-violet-200'],
  manual: ['Manual', 'bg-slate-100 text-slate-600 border-slate-200'],
  dot_report: ['DOT Report', 'bg-blue-100 text-blue-700 border-blue-200'],
};
function LotSourceBadge({ source }) {
  const [label, cls] = LOT_SOURCE[source] || [source || '—', 'bg-bg text-gr border-lt'];
  return <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-semibold border ${cls}`}>{label}</span>;
}

const EMPTY = { lot_number: '', sku: '', quantity_cases: '', received_date: '' };
const inputCls = 'w-full px-2 py-1 rounded border border-lt text-[10px] bg-cd';

export function DeliveryLots({ poId, bolNumber }) {
  const { lots, loading, refresh } = usePoLots(poId);

  // Editable BOL
  const [bol, setBol] = useState(bolNumber || '');
  const [editingBol, setEditingBol] = useState(false);
  const [savingBol, setSavingBol] = useState(false);

  // Add-lot form
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const saveBol = async () => {
    setSavingBol(true);
    const { error } = await updatePoBol(poId, bol.trim());
    setSavingBol(false);
    if (error) setErr(error.message);
    else {
      setErr(null);
      setEditingBol(false);
    }
  };

  const submitLot = async () => {
    if (!form.lot_number.trim()) return;
    setBusy(true);
    const { error } = await addPoLot(poId, {
      lot_number: form.lot_number.trim(),
      sku: form.sku.trim(),
      quantity_cases: form.quantity_cases ? Number(form.quantity_cases) : null,
      received_date: form.received_date,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
    } else {
      setErr(null);
      setForm(EMPTY);
      setAdding(false);
      refresh();
    }
  };

  return (
    <div className="px-[18px] pb-3">
      <div className="text-[8px] font-bold text-pk uppercase mb-1.5 pb-1 border-b-2 border-lt">
        Delivery &amp; Lots
      </div>

      {/* BOL number — editable, auto-populated from email when available */}
      <div className="flex items-center gap-2 mb-2 text-[10px]">
        <span className="text-[8px] font-semibold uppercase text-gr">BOL #</span>
        {editingBol ? (
          <>
            <input
              autoFocus
              value={bol}
              onChange={(e) => setBol(e.target.value)}
              placeholder="BOL-…"
              className={inputCls + ' max-w-[180px]'}
            />
            <button onClick={saveBol} disabled={savingBol} className="text-pk font-semibold disabled:opacity-50">
              {savingBol ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setBol(bolNumber || ''); setEditingBol(false); }} className="text-gr">
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="font-bold text-dk">{bol || '—'}</span>
            <button onClick={() => setEditingBol(true)} className="text-[9px] text-pk underline underline-offset-2">
              {bol ? 'Edit' : 'Add BOL #'}
            </button>
          </>
        )}
      </div>

      {/* Lot numbers table */}
      {loading ? (
        <div className="text-[10px] text-gr py-2">Loading…</div>
      ) : lots.length === 0 ? (
        <div className="text-[10px] text-gr py-1">No lots recorded yet.</div>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-pc">
              <th className={TH}>Lot #</th>
              <th className={TH}>SKU</th>
              <th className={THR}>Cases</th>
              <th className={TH}>Received</th>
              <th className={TH}>Source</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id} className="border-b border-bg">
                <td className="px-2 py-1.5 font-mono font-semibold text-dk">{l.lot_number}</td>
                <td className="px-2 py-1.5 text-md">{l.sku || '—'}</td>
                <td className="px-2 py-1.5 text-right">{l.quantity_cases?.toLocaleString() ?? '—'}</td>
                <td className="px-2 py-1.5 text-md">{formatDate(l.received_date)}</td>
                <td className="px-2 py-1.5"><LotSourceBadge source={l.source} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add-lot form / button */}
      {adding ? (
        <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-1.5 items-end bg-bg border border-lt rounded-lg p-2">
          <label className="text-[8px] text-gr uppercase">Lot #
            <input value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} className={inputCls} />
          </label>
          <label className="text-[8px] text-gr uppercase">SKU
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={inputCls} />
          </label>
          <label className="text-[8px] text-gr uppercase">Cases
            <input type="number" value={form.quantity_cases} onChange={(e) => setForm({ ...form, quantity_cases: e.target.value })} className={inputCls} />
          </label>
          <label className="text-[8px] text-gr uppercase">Received
            <input type="date" value={form.received_date} onChange={(e) => setForm({ ...form, received_date: e.target.value })} className={inputCls} />
          </label>
          <div className="flex gap-1.5">
            <button onClick={submitLot} disabled={busy || !form.lot_number.trim()} className="bg-pk text-white rounded px-2 py-1 text-[10px] font-semibold disabled:opacity-50">
              {busy ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => { setAdding(false); setForm(EMPTY); setErr(null); }} className="text-[10px] text-gr px-1">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 text-[10px] font-semibold text-pk hover:text-pm">
          + Add Lot
        </button>
      )}

      {err && <div className="mt-1.5 text-[9px] text-red-600">{err}</div>}

      <div className="mt-2 text-[8px] text-gr italic">
        Lot # is the traceability key. Linking these to raw_material_lots / dot_inventory
        (outbound ↔ inbound, for recalls + shelf life) lands in Phase 2.
      </div>
    </div>
  );
}
