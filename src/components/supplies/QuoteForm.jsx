import { useState } from 'react';
import { saveQuote } from '../../hooks/useSupplies';
import { fmtMoney, fmtCost } from './supplyUi';

// Add or edit a quote (or verbal price, or an invoice not tied to a PO) for one
// of an item's vendor SKUs: document details, price breaks, the original file.
// Prices are typed as printed — per order unit at each quantity; the line
// total and $/lb (or $/1,000) are previews, the database derives the real
// figures. Same look as components/shared/EditModal; its own component
// because a quote has repeating breaks. POs are entered on the POs tab.

const INPUT = 'w-full px-2 py-1 rounded border border-lt text-[11px] bg-bg';
const LABEL = 'text-[8px] text-gr uppercase mb-0.5';
const num = (v) => (v === '' || v == null ? null : Number(v));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const key = () => Math.random().toString(36).slice(2);

export default function QuoteForm({ maps, item, sku: presetSku, quote, onClose, onSaved }) {
  const isEdit = !!quote;
  const skus = (maps.skusByItem.get(item.id) || []).filter((s) => s.vendor_id);
  const [f, setF] = useState(() => ({
    sku_id: quote?.sku_id || presetSku?.id || (skus.length === 1 ? skus[0].id : ''),
    doc_type: quote?.doc_type && quote.doc_type !== 'reference' ? quote.doc_type : 'quote',
    doc_ref: quote?.doc_ref || '',
    doc_date: quote?.doc_date || (isEdit ? '' : today()),
    valid_until: quote?.valid_until || '',
    status: quote?.status || 'active',
    moq: quote?.moq || '', lead_time: quote?.lead_time || '', terms: quote?.terms || '',
    one_time_costs: quote?.one_time_costs || '', notes: quote?.notes || '',
  }));
  const [breaks, setBreaks] = useState(() => {
    const cur = isEdit ? maps.breaksByQuote.get(quote.id) || [] : [];
    return cur.length
      ? cur.map((b) => ({ key: key(), qty: String(b.qty), unit_price: String(Math.round((b.price_per_order_qty / b.qty) * 10000) / 10000) }))
      : [{ key: key(), qty: '', unit_price: '' }];
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setBreak = (k, patch) => setBreaks((bs) => bs.map((b) => (b.key === k ? { ...b, ...patch } : b)));
  const sku = maps.skusById.get(f.sku_id) || null;
  const vendor = sku ? maps.vendorsById.get(sku.vendor_id) : null;

  const preview = (b) => {
    const qty = num(b.qty);
    const price = num(b.unit_price);
    if (!sku || !(qty > 0) || price == null) return null;
    const total = Math.round(qty * price * 100) / 100;
    let unit = null;
    if (item.kind === 'ingredient' && sku.unit_weight_lbs > 0) unit = fmtCost('ingredient', total / (qty * sku.unit_weight_lbs));
    if (item.kind === 'packaging' && sku.units_per_thousand) unit = fmtCost('packaging', (1000 * total) / (qty * (sku.units_per_order_unit || 1)));
    return { total, unit };
  };

  const save = async () => {
    if (!sku) return setErr('Pick the vendor SKU this price is for (add one first with + SKU if it is missing).');
    const filled = breaks.filter((b) => b.qty !== '' || b.unit_price !== '');
    const out = [];
    for (const [n, b] of filled.entries()) {
      const qty = num(b.qty);
      const price = num(b.unit_price);
      if (!(qty > 0)) return setErr(`Price break ${n + 1}: quantity must be more than 0.`);
      if (price == null || !(price >= 0)) return setErr(`Price break ${n + 1}: enter the price per ${sku.order_unit}.`);
      out.push({ qty, unit_price: price });
    }
    if (new Set(out.map((b) => b.qty)).size !== out.length) return setErr('Two price breaks have the same quantity.');
    setErr(null);
    setSaving(true);
    const trim = (v) => String(v || '').trim() || null;
    const { error } = await saveQuote({
      quote: {
        ...(isEdit ? { id: quote.id } : {}),
        sku_id: sku.id, vendor_id: sku.vendor_id, doc_type: f.doc_type, doc_ref: trim(f.doc_ref),
        doc_date: f.doc_date || null, valid_until: f.valid_until || null, status: f.status,
        moq: trim(f.moq), lead_time: trim(f.lead_time), terms: trim(f.terms), one_time_costs: trim(f.one_time_costs), notes: trim(f.notes),
      },
      breaks: out,
      file,
      itemId: item.id,
      vendorName: vendor?.name,
    });
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto py-10" onClick={onClose}>
      <div className="bg-cd rounded-xl shadow-xl w-[720px] max-w-[94vw] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-black text-dk">{isEdit ? 'Edit price' : 'Add a quote'} — {item.name}</div>
          <button onClick={onClose} className="text-gr hover:text-pk text-lg leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="col-span-2 sm:col-span-4">
            <div className={LABEL}>Vendor SKU *</div>
            <select value={f.sku_id} onChange={(e) => set('sku_id', e.target.value)} disabled={isEdit} className={INPUT}>
              <option value="">— pick the vendor and SKU</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {[maps.vendorsById.get(s.vendor_id)?.name, s.brand_name, s.order_unit].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
            {!skus.length && <div className="text-[9px] text-pk mt-0.5">This item has no vendor SKU yet. Close this and use + SKU first.</div>}
          </div>
          <div>
            <div className={LABEL}>Type</div>
            <select value={f.doc_type} onChange={(e) => set('doc_type', e.target.value)} className={INPUT}>
              <option value="quote">Quote</option>
              <option value="verbal">Verbal / email price</option>
              <option value="invoice">Invoice (no PO)</option>
            </select>
          </div>
          <div>
            <div className={LABEL}>Quote / doc #</div>
            <input value={f.doc_ref} onChange={(e) => set('doc_ref', e.target.value)} placeholder="Proposal 102508" className={INPUT} />
          </div>
          <div>
            <div className={LABEL}>Date</div>
            <input type="date" value={f.doc_date} onChange={(e) => set('doc_date', e.target.value)} className={INPUT} />
          </div>
          <div>
            <div className={LABEL}>Valid until</div>
            <input type="date" value={f.valid_until} onChange={(e) => set('valid_until', e.target.value)} className={INPUT} />
          </div>
          <div>
            <div className={LABEL}>Status</div>
            <select value={f.status} onChange={(e) => set('status', e.target.value)} className={INPUT}>
              <option value="active">Active</option>
              <option value="preliminary">Preliminary</option>
              <option value="expired">Expired</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <div className={LABEL}>MOQ</div>
            <input value={f.moq} onChange={(e) => set('moq', e.target.value)} className={INPUT} />
          </div>
          <div className="col-span-2">
            <div className={LABEL}>Lead time</div>
            <input value={f.lead_time} onChange={(e) => set('lead_time', e.target.value)} className={INPUT} />
          </div>
          <div className="col-span-2">
            <div className={LABEL}>Payment terms</div>
            <input value={f.terms} onChange={(e) => set('terms', e.target.value)} placeholder={vendor?.default_terms || 'Net 30'} className={INPUT} />
          </div>
          <div className="col-span-2">
            <div className={LABEL}>One-time costs (tooling, plates, setup)</div>
            <input value={f.one_time_costs} onChange={(e) => set('one_time_costs', e.target.value)} className={INPUT} />
          </div>
        </div>

        <div className="mt-3 text-[9px] font-bold uppercase tracking-wider text-dk">Price breaks {sku && <span className="text-gr font-normal normal-case">· price per {sku.order_unit}, as printed</span>}</div>
        <div className="space-y-1.5 mt-1">
          {breaks.map((b, n) => {
            const p = preview(b);
            return (
              <div key={b.key} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  {n === 0 && <div className={LABEL}>Quantity ({sku?.order_unit || 'order units'})</div>}
                  <input type="number" step="any" min="0" value={b.qty} onChange={(e) => setBreak(b.key, { qty: e.target.value })} className={INPUT} />
                </div>
                <div className="col-span-3">
                  {n === 0 && <div className={LABEL}>$ per order unit</div>}
                  <input type="number" step="any" min="0" value={b.unit_price} onChange={(e) => setBreak(b.key, { unit_price: e.target.value })} className={INPUT} />
                </div>
                <div className="col-span-5 text-[10px] text-md pb-1">
                  {p ? <>total <b className="text-dk">{fmtMoney(p.total)}</b>{p.unit && <> · <b className="text-dk">{p.unit}</b></>}</> : <span className="text-gr">—</span>}
                </div>
                <div className="col-span-1 pb-1 text-right">
                  {breaks.length > 1 && <button onClick={() => setBreaks((bs) => bs.filter((x) => x.key !== b.key))} className="text-[10px] text-gr hover:text-pk" title="Remove this break">✕</button>}
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={() => setBreaks((bs) => [...bs, { key: key(), qty: '', unit_price: '' }])} className="mt-1.5 px-2 py-0.5 rounded text-[10px] border border-lt text-pk hover:bg-pc">+ Add a price break</button>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <div className={LABEL}>{isEdit && quote.doc_path ? 'Replace the original file' : 'Original file (PDF or image)'}</div>
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[11px]" />
            <div className="text-[9px] text-gr mt-0.5">Opens as 📄 Open original, and is filed in Documents under this item.</div>
          </div>
          <div>
            <div className={LABEL}>Notes</div>
            <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={INPUT} />
          </div>
        </div>

        {err && <div className="text-[11px] text-red-600 mt-2">{err}</div>}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1 rounded text-[11px] border border-lt text-gr">Cancel</button>
          <button onClick={save} disabled={saving} className="px-3 py-1 rounded text-[11px] font-bold bg-pk text-white disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Add quote'}
          </button>
        </div>
      </div>
    </div>
  );
}
