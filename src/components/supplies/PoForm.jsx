import { useMemo, useState } from 'react';
import { createPurchaseOrder } from '../../hooks/useSupplies';
import { fmtMoney, fmtCost } from './supplyUi';

// New purchase order: header (vendor, PO #, date, terms, pickup/delivered,
// freight, the PO file) + one row per item ordered. Saving files each row as a
// PO price line, so the item's last PO price, last order date, actual landed
// cost and the vendor's card all update from it — nothing typed twice.
// Same look as components/shared/EditModal; its own component because a PO
// has repeating lines.
//
// Each line picks an item, then the vendor's SKU for it (order unit, lb per
// unit) — or adds a new SKU when this vendor hasn't sold us the item before.
// The price typed is the one printed on the PO: per order unit. The line total
// and $/lb (or $/1,000) are previews; the database derives the real figures.

const INPUT = 'w-full px-2 py-1 rounded border border-lt text-[11px] bg-bg';
const LABEL = 'text-[8px] text-gr uppercase mb-0.5';
const NEW = '__new__';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const num = (v) => (v === '' || v == null ? null : Number(v));
const blankLine = () => ({ key: Math.random().toString(36).slice(2), item_id: '', sku_id: '', brand_name: '', order_unit: '', unit_weight_lbs: '', units_per_order_unit: '', units_per_thousand: true, qty: '', unit_price: '' });

export default function PoForm({ data, maps, onClose, onSaved }) {
  const [head, setHead] = useState({ vendor_id: '', po_number: '', po_date: today(), terms: '', lead_time: '', fulfillment: '', freight_cost: '', notes: '' });
  const [lines, setLines] = useState([blankLine()]);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const vendor = maps.vendorsById.get(head.vendor_id) || null;
  const vendors = useMemo(
    () => data.vendors.filter((v) => v.status !== 'closed').sort((a, b) => a.name.localeCompare(b.name)),
    [data.vendors],
  );
  const vendorSkus = (itemId) => (maps.skusByItem.get(itemId) || []).filter((s) => s.vendor_id === head.vendor_id);

  // Items this vendor already sells us first, then everything else.
  const itemGroups = useMemo(() => {
    const sold = maps.itemsByVendor.get(head.vendor_id) || new Map();
    const sort = (a, b) => a.name.localeCompare(b.name);
    const tag = (i) => ({ ...i, label: `${i.name}${i.kind === 'packaging' ? ' (packaging)' : ''}` });
    return [
      [vendor ? `Sold by ${vendor.name}` : null, [...sold.values()].sort(sort).map(tag)],
      [vendor ? 'Other items' : 'Items', data.items.filter((i) => !sold.has(i.id)).sort(sort).map(tag)],
    ].filter(([, list]) => list.length);
  }, [data.items, maps.itemsByVendor, head.vendor_id, vendor]);

  const setH = (k, v) => setHead((h) => ({ ...h, [k]: v }));
  const setVendor = (id) => {
    const v = maps.vendorsById.get(id);
    setHead((h) => ({ ...h, vendor_id: id, terms: h.terms || v?.default_terms || '' }));
    // SKUs belong to a vendor: re-pick each line's SKU for the new vendor.
    setLines((ls) => ls.map((l) => (l.item_id ? { ...l, sku_id: defaultSku(l.item_id, id) } : l)));
  };
  const defaultSku = (itemId, vendorId = head.vendor_id) => {
    const skus = (maps.skusByItem.get(itemId) || []).filter((s) => s.vendor_id === vendorId);
    return skus.length ? skus[0].id : NEW;
  };
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Preview only: what the line will read as once saved.
  const preview = (l) => {
    const item = maps.itemsById.get(l.item_id);
    const qty = num(l.qty);
    const price = num(l.unit_price);
    if (!item || !(qty > 0) || price == null) return { total: null, unit: null };
    const total = Math.round(qty * price * 100) / 100;
    const sku = l.sku_id === NEW ? null : maps.skusById.get(l.sku_id);
    const lbs = sku ? Number(sku.unit_weight_lbs) : num(l.unit_weight_lbs);
    const pcs = sku ? Number(sku.units_per_order_unit || 1) : num(l.units_per_order_unit) || 1;
    const perThousand = sku ? sku.units_per_thousand : l.units_per_thousand;
    let unit = null;
    if (item.kind === 'ingredient' && lbs > 0) unit = fmtCost('ingredient', total / (qty * lbs));
    if (item.kind === 'packaging' && perThousand) unit = fmtCost('packaging', (1000 * total) / (qty * pcs));
    return { total, unit };
  };
  const poTotal = lines.reduce((s, l) => s + (preview(l).total || 0), 0);

  const save = async () => {
    const poNumber = head.po_number.trim();
    if (!head.vendor_id) return setErr('Pick the vendor.');
    if (!poNumber) return setErr('PO number is required.');
    if (!head.po_date) return setErr('PO date is required.');
    const freight = num(head.freight_cost);
    if (freight != null && !(freight >= 0)) return setErr('Freight must be a number ≥ 0.');
    const filled = lines.filter((l) => l.item_id || l.qty || l.unit_price);
    if (!filled.length) return setErr('Add at least one item.');

    const out = [];
    for (const [n, l] of filled.entries()) {
      const item = maps.itemsById.get(l.item_id);
      const where = `Line ${n + 1}${item ? ` (${item.name})` : ''}`;
      if (!item) return setErr(`${where}: pick the item.`);
      const qty = num(l.qty);
      const price = num(l.unit_price);
      if (!(qty > 0)) return setErr(`${where}: quantity must be more than 0.`);
      if (price == null || !(price >= 0)) return setErr(`${where}: enter the price per order unit from the PO.`);
      if (l.sku_id && l.sku_id !== NEW) {
        out.push({ sku_id: l.sku_id, qty, unit_price: price });
        continue;
      }
      if (!l.order_unit.trim()) return setErr(`${where}: enter the order unit, e.g. "50 lb bag".`);
      const lbs = num(l.unit_weight_lbs);
      const pcs = num(l.units_per_order_unit);
      if (item.kind === 'ingredient' && !(lbs > 0)) return setErr(`${where}: enter the lb per order unit, so $/lb can be worked out.`);
      if (item.kind === 'packaging' && pcs != null && !(pcs > 0)) return setErr(`${where}: pieces per order unit must be more than 0.`);
      out.push({
        qty, unit_price: price,
        newSku: {
          item_id: item.id,
          brand_name: l.brand_name.trim() || null,
          order_unit: l.order_unit.trim(),
          unit_weight_lbs: item.kind === 'ingredient' ? lbs : null,
          units_per_order_unit: item.kind === 'packaging' ? pcs : null,
          units_per_thousand: item.kind === 'packaging' ? !!l.units_per_thousand : false,
        },
      });
    }

    setErr(null);
    setSaving(true);
    const { error } = await createPurchaseOrder({
      po: {
        po_number: poNumber,
        vendor_id: head.vendor_id,
        po_date: head.po_date,
        terms: head.terms.trim() || null,
        lead_time: head.lead_time.trim() || null,
        fulfillment: head.fulfillment || null,
        freight_cost: head.fulfillment ? freight : null,
        notes: head.notes.trim() || null,
      },
      lines: out,
      file,
      vendorName: vendor?.name,
    });
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto py-10" onClick={onClose}>
      <div className="bg-cd rounded-xl shadow-xl w-[860px] max-w-[94vw] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-black text-dk">New purchase order</div>
          <button onClick={onClose} className="text-gr hover:text-pk text-lg leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="col-span-2">
            <div className={LABEL}>Vendor *</div>
            <select value={head.vendor_id} onChange={(e) => setVendor(e.target.value)} className={INPUT} autoFocus>
              <option value="">— pick the vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <div className={LABEL}>PO number *</div>
            <input value={head.po_number} onChange={(e) => setH('po_number', e.target.value)} placeholder="SP032-2026" className={`${INPUT} font-mono`} />
          </div>
          <div>
            <div className={LABEL}>PO date *</div>
            <input type="date" value={head.po_date} onChange={(e) => setH('po_date', e.target.value)} className={INPUT} />
          </div>
          <div className="col-span-2">
            <div className={LABEL}>Payment terms</div>
            <input value={head.terms} onChange={(e) => setH('terms', e.target.value)} placeholder="Net 30" className={INPUT} />
          </div>
          <div className="col-span-2">
            <div className={LABEL}>Lead time / expected delivery</div>
            <input value={head.lead_time} onChange={(e) => setH('lead_time', e.target.value)} placeholder="Ships Nov 20" className={INPUT} />
          </div>
          <div className="col-span-2">
            <div className={LABEL}>Picked up or delivered</div>
            <select value={head.fulfillment} onChange={(e) => setHead((h) => ({ ...h, fulfillment: e.target.value, freight_cost: e.target.value ? h.freight_cost : '' }))} className={INPUT}>
              <option value="">— not known yet</option>
              <option value="pickup">Picked up (we pay freight)</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
          <div className="col-span-2">
            <div className={LABEL}>{head.fulfillment === 'delivered' ? 'Freight billed on the invoice ($, whole PO)' : 'Freight we pay in transit ($, whole PO)'}</div>
            <input
              type="number" step="0.01" min="0" value={head.freight_cost} disabled={!head.fulfillment}
              onChange={(e) => setH('freight_cost', e.target.value)} className={INPUT}
            />
            <div className="text-[9px] text-gr mt-0.5">
              {head.fulfillment ? 'Blank keeps the yellow “freight pending” flag; 0 means none. You can fill it in later with Edit PO.' : 'Set picked up / delivered first — or leave both for later.'}
            </div>
          </div>
        </div>

        <div className="mt-3 text-[9px] font-bold uppercase tracking-wider text-dk">Items ordered</div>
        <div className="space-y-2 mt-1">
          {lines.map((l, n) => {
            const item = maps.itemsById.get(l.item_id);
            const skus = item ? vendorSkus(item.id) : [];
            const isNew = item && l.sku_id === NEW;
            const sku = item && !isNew ? maps.skusById.get(l.sku_id) : null;
            const p = preview(l);
            return (
              <div key={l.key} className="border border-lt rounded-lg p-2 bg-bg/40">
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                  <div className="col-span-2 sm:col-span-4">
                    <div className={LABEL}>Item *</div>
                    <select
                      value={l.item_id}
                      onChange={(e) => setLine(l.key, { item_id: e.target.value, sku_id: e.target.value ? defaultSku(e.target.value) : '' })}
                      className={INPUT}
                    >
                      <option value="">— pick the item</option>
                      {itemGroups.map(([label, list]) => (
                        label
                          ? <optgroup key={label} label={label}>{list.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>
                          : list.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <div className={LABEL}>Vendor SKU / order unit</div>
                    <select value={l.sku_id} onChange={(e) => setLine(l.key, { sku_id: e.target.value })} disabled={!item} className={INPUT}>
                      {!item && <option value="">— pick the item first</option>}
                      {skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {[s.brand_name || 'brand not on file', s.order_unit, s.vendor_item_code && `#${s.vendor_item_code}`].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                      {item && <option value={NEW}>+ New SKU from {vendor?.name || 'this vendor'}</option>}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <div className={LABEL}>Qty *{sku ? ` (${sku.order_unit})` : l.order_unit ? ` (${l.order_unit})` : ''}</div>
                    <input type="number" step="any" min="0" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className={INPUT} />
                  </div>
                  <div className="sm:col-span-2">
                    <div className={LABEL}>$ per order unit *</div>
                    <input type="number" step="any" min="0" value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} className={INPUT} />
                  </div>
                </div>

                {isNew && (
                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 mt-2 pl-2 border-l-2 border-pk/40">
                    <div className="col-span-2 sm:col-span-4">
                      <div className={LABEL}>Brand / product name</div>
                      <input value={l.brand_name} onChange={(e) => setLine(l.key, { brand_name: e.target.value })} placeholder="C&H Light Brown Sugar" className={INPUT} />
                    </div>
                    <div className="sm:col-span-3">
                      <div className={LABEL}>Order unit *</div>
                      <input value={l.order_unit} onChange={(e) => setLine(l.key, { order_unit: e.target.value })} placeholder={item.kind === 'ingredient' ? '50 lb bag' : 'case of 1,000'} className={INPUT} />
                    </div>
                    {item.kind === 'ingredient' ? (
                      <div className="sm:col-span-2">
                        <div className={LABEL}>lb per order unit *</div>
                        <input type="number" step="any" min="0" value={l.unit_weight_lbs} onChange={(e) => setLine(l.key, { unit_weight_lbs: e.target.value })} className={INPUT} />
                      </div>
                    ) : (
                      <>
                        <div className="sm:col-span-2">
                          <div className={LABEL}>Pieces per order unit</div>
                          <input type="number" step="any" min="0" value={l.units_per_order_unit} onChange={(e) => setLine(l.key, { units_per_order_unit: e.target.value })} placeholder="1" className={INPUT} />
                        </div>
                        <label className="sm:col-span-3 flex items-center gap-1.5 text-[11px] text-dk pb-1">
                          <input type="checkbox" checked={l.units_per_thousand} onChange={(e) => setLine(l.key, { units_per_thousand: e.target.checked })} /> Show price per 1,000
                        </label>
                      </>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center mt-1.5 text-[10px]">
                  <div className="text-md">
                    {p.total != null ? <>Line total <b className="text-dk">{fmtMoney(p.total)}</b>{p.unit && <> · <b className="text-dk">{p.unit}</b></>}</> : <span className="text-gr">Line total appears once qty and price are in.</span>}
                  </div>
                  {lines.length > 1 && (
                    <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-[10px] text-gr hover:text-pk">Remove line {n + 1}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between items-center mt-2">
          <button onClick={() => setLines((ls) => [...ls, blankLine()])} className="px-2 py-0.5 rounded text-[10px] border border-lt text-pk hover:bg-pc">+ Add another item</button>
          <div className="text-[11px] text-md">PO total (before freight) <b className="text-dk">{fmtMoney(poTotal)}</b></div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <div className={LABEL}>PO file (PDF or image)</div>
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[11px]" />
            <div className="text-[9px] text-gr mt-0.5">Opens from every line as 📄 Open original. Stored privately.</div>
          </div>
          <div>
            <div className={LABEL}>Notes</div>
            <textarea value={head.notes} onChange={(e) => setH('notes', e.target.value)} rows={2} placeholder="Ship to Fresh Coast, Detroit" className={INPUT} />
          </div>
        </div>

        {err && <div className="text-[11px] text-red-600 mt-2">{err}</div>}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1 rounded text-[11px] border border-lt text-gr">Cancel</button>
          <button onClick={save} disabled={saving} className="px-3 py-1 rounded text-[11px] font-bold bg-pk text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save PO'}
          </button>
        </div>
      </div>
    </div>
  );
}
