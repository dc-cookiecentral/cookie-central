import { useState } from 'react';
import { saveAssumedCost, savePo } from '../../hooks/useSupplies';

// Edit forms for the Supplies tab (same look as the Spec Sheet's EditModal).
//   kind 'assumed' — an item's assumed cost ($/lb ingredient, $/1,000 packaging)
//   kind 'po'      — the PO behind a PO/invoice line: picked up or delivered,
//                    packing slip, and (pickup only) the freight we pay in
//                    transit, which v_po_line_cost splits across the PO's lines
//                    by weight.

const INPUT = 'w-full px-2 py-1 rounded border border-lt text-[11px]';

function Field({ label, hint, children, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[8px] text-gr uppercase mb-0.5">{label}</div>
      {children}
      {hint && <div className="text-[9px] text-gr mt-0.5">{hint}</div>}
    </div>
  );
}

const toNum = (v) => (v === '' || v == null ? null : Number(v));

export default function SupplyEditModal({ modal, onClose, onSaved }) {
  const { kind } = modal;
  const [form, setForm] = useState(() =>
    kind === 'assumed'
      ? { assumed_cost: modal.item.assumed_cost ?? '' }
      : {
          po_number: modal.po?.po_number ?? '',
          fulfillment: modal.po?.fulfillment ?? '',
          packing_slip_ref: modal.po?.packing_slip_ref ?? '',
          ship_date: modal.po?.ship_date ?? '',
          freight_cost: modal.po?.freight_cost ?? '',
          notes: modal.po?.notes ?? '',
        },
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (name, v) => setForm((f) => ({ ...f, [name]: v }));

  const save = async () => {
    let result;
    if (kind === 'assumed') {
      const v = toNum(form.assumed_cost);
      if (v != null && !(v >= 0)) return setErr('Assumed cost must be a number ≥ 0.');
      setSaving(true);
      result = await saveAssumedCost(modal.item.id, v);
    } else {
      if (!form.po_number.trim()) return setErr('PO number is required.');
      const freight = form.fulfillment === 'pickup' ? toNum(form.freight_cost) : null;
      if (freight != null && !(freight >= 0)) return setErr('Freight must be a number ≥ 0.');
      setSaving(true);
      result = await savePo({
        po_number: form.po_number.trim(),
        vendor_id: modal.po?.vendor_id ?? modal.quote.vendor_id,
        po_date: modal.po?.po_date ?? modal.quote.doc_date ?? null,
        fulfillment: form.fulfillment || null,
        packing_slip_ref: form.packing_slip_ref.trim() || null,
        ship_date: form.ship_date || null,
        freight_cost: freight,
        notes: form.notes.trim() || null,
      }, modal.quote.id);
    }
    setSaving(false);
    if (result.error) setErr(result.error.message);
    else onSaved();
  };

  const unit = modal.item?.kind === 'packaging' ? '$ per 1,000' : '$ per lb';
  const title = kind === 'assumed' ? `Assumed cost — ${modal.item.name}` : modal.po ? `PO ${modal.po.po_number}` : 'Link this line to a PO';

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto py-10" onClick={onClose}>
      <div className="bg-cd rounded-xl shadow-xl w-[560px] max-w-[92vw] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-black text-dk">{title}</div>
          <button onClick={onClose} className="text-gr hover:text-pk text-lg leading-none">×</button>
        </div>

        {kind === 'assumed' ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Assumed cost (${unit})`} hint="Flags when it is 5% or more above or below the actual landed cost of the latest PO.">
              <input type="number" step="any" min="0" value={form.assumed_cost} onChange={(e) => set('assumed_cost', e.target.value)} className={INPUT} autoFocus />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="PO number *" hint={modal.po ? 'Locked — the PO number is the key.' : 'Use the number on the PO, e.g. SP029-2026.'}>
              <input value={form.po_number} onChange={(e) => set('po_number', e.target.value)} disabled={!!modal.po} className={`${INPUT} font-mono ${modal.po ? 'bg-bg text-gr' : ''}`} />
            </Field>
            <Field label="Picked up or delivered">
              <select value={form.fulfillment} onChange={(e) => set('fulfillment', e.target.value)} className={`${INPUT} bg-bg`}>
                <option value="">— not set</option>
                <option value="pickup">Picked up (we pay freight)</option>
                <option value="delivered">Delivered</option>
              </select>
            </Field>
            <Field label="Packing slip / packing list #">
              <input value={form.packing_slip_ref} onChange={(e) => set('packing_slip_ref', e.target.value)} className={INPUT} />
            </Field>
            <Field label="Ship / pickup date">
              <input type="date" value={form.ship_date} onChange={(e) => set('ship_date', e.target.value)} className={INPUT} />
            </Field>
            <Field
              label="Freight we pay in transit ($, whole PO)"
              hint={form.fulfillment === 'pickup' ? 'Split across this PO’s products by weight.' : 'Only for a pickup.'}
            >
              <input
                type="number" step="0.01" min="0" value={form.fulfillment === 'pickup' ? form.freight_cost : ''}
                onChange={(e) => set('freight_cost', e.target.value)} disabled={form.fulfillment !== 'pickup'}
                className={`${INPUT} ${form.fulfillment !== 'pickup' ? 'bg-bg text-gr' : ''}`}
              />
            </Field>
            <Field label="Notes" wide>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={INPUT} />
            </Field>
          </div>
        )}

        {err && <div className="text-[11px] text-red-600 mt-2">{err}</div>}
        <div className="flex gap-2 mt-3">
          <button onClick={save} disabled={saving} className="bg-pk text-white px-3 py-1.5 rounded text-[11px] font-semibold hover:bg-pm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="text-[11px] text-gr hover:text-pk px-2">Cancel</button>
        </div>
      </div>
    </div>
  );
}
