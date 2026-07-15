import { useState } from 'react';
import { saveSpecRow } from '../../hooks/useSpecSheet';

// Config-driven add/edit forms for every spine level. Each `kind` maps to its
// table, natural key, and field list. Number/bool/array coercion happens on save.
// Field: { name, label, type: text|number|select|bool|textarea|csv, options?, required? }

const F = {
  rawdough: {
    table: 'raw_doughs', key: 'raw_sku', title: 'Raw Dough',
    fields: [
      { name: 'raw_sku', label: 'Raw SKU', required: true },
      { name: 'name', label: 'Name' },
      { name: 'family', label: 'Form', type: 'select', options: ['', 'Stuffed', 'Shot'] },
      { name: 'subtype', label: 'Tier', type: 'select', options: ['', 'Classic', 'Gourmet'] },
      { name: 'batch_wt_oz', label: 'Batch Weight (oz)', type: 'number' },
      { name: 'co_mans', label: 'Co-Man(s) (comma-sep)', type: 'csv' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  proddough: {
    table: 'wip_doughs', key: 'wip_sku', title: 'Production Dough',
    fields: [
      { name: 'wip_sku', label: 'WIP SKU', required: true },
      { name: 'name', label: 'Name' },
      { name: 'type', label: 'Form', type: 'select', options: ['', 'Shot', 'Mixed'] },
      { name: 'subtype', label: 'Tier', type: 'select', options: ['', 'Classic', 'Gourmet'] },
      { name: 'raw_base', label: 'Base (Raw Dough name)', optionsFrom: 'rawDoughs.name' },
      { name: 'mixins', label: 'Mix-ins' },
      { name: 'mixin_wt_oz', label: 'Mix-in Wt (oz)', type: 'number' },
      { name: 'raw_dough_portion_oz', label: 'Raw Portion (oz)', type: 'number' },
      { name: 'wip_batch_wt_oz', label: 'WIP Batch Wt (oz)', type: 'number' },
      { name: 'co_mans', label: 'Co-Man(s) (comma-sep)', type: 'csv' },
    ],
  },
  stuffing: {
    table: 'stuffings', key: 'stuffing_id', title: 'Stuffing',
    fields: [
      { name: 'stuffing_id', label: 'Stuffing ID', required: true },
      { name: 'name', label: 'Name' },
      { name: 'type', label: 'Type' },
      { name: 'no_flex', label: 'No Flex (no substitution)', type: 'bool' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  cookie: {
    table: 'products', key: 'code', title: 'Cookie',
    fields: [
      { name: 'code', label: 'Cookie Code', required: true },
      { name: 'description', label: 'Description' },
      { name: 'flavor', label: 'Flavor' },
      { name: 'outer_cookie', label: 'Outer Cookie' },
      { name: 'stuffing', label: 'Stuffing' },
      { name: 'tier', label: 'Tier', type: 'select', options: ['', 'Classic', 'Gourmet'] },
      { name: 'form', label: 'Form', type: 'select', options: ['', 'Stuffed', 'Shot'] },
      { name: 'prep', label: 'Prep', type: 'select', options: ['', 'Baked', 'Raw'] },
      { name: 'dough_oz', label: 'Dough oz', type: 'number' },
      { name: 'wip_dough', label: 'Made From (Dough)', optionsFrom: 'wipDoughs.name' },
      { name: 'allergens', label: 'Allergens' },
      { name: 'ingredients', label: 'Ingredients', type: 'textarea' },
      { name: 'nutrition', label: 'Nutrition', type: 'textarea' },
      { name: 'sample_eligible', label: 'Sample eligible', type: 'bool' },
    ],
  },
  each: {
    table: 'eaches', key: 'each_sku', title: 'Each',
    fields: [
      { name: 'each_sku', label: 'Each SKU', required: true },
      { name: 'product_code', label: 'Cookie', optionsFrom: 'products.code' },
      { name: 'each_upc', label: 'UPC' },
      { name: 'cookies_per_each', label: 'Cookies / Each', type: 'number' },
      { name: 'pack_type', label: 'Pack Type' },
      { name: 'net_wt', label: 'Net Wt' },
      { name: 'brand', label: 'Brand' },
      { name: 'retail_price', label: 'Retail Price', type: 'number' },
      { name: 'length_in', label: 'Length (in)', type: 'number' },
      { name: 'width_in', label: 'Width (in)', type: 'number' },
      { name: 'height_in', label: 'Height (in)', type: 'number' },
      { name: 'gross_wt_oz', label: 'Gross Wt (oz)', type: 'number' },
      { name: 'sample_eligible', label: 'Sample eligible', type: 'bool' },
    ],
  },
  inner: {
    table: 'inners', key: 'inner_sku', title: 'Inner Case',
    fields: [
      { name: 'inner_sku', label: 'Inner SKU', required: true },
      { name: 'name', label: 'Name' },
      { name: 'each_sku', label: 'Holds Each', optionsFrom: 'eaches.each_sku' },
      { name: 'eaches_per_inner', label: 'Eaches / Inner', type: 'number' },
      { name: 'sellable', label: 'Sellable', type: 'bool' },
      { name: 'upc', label: 'UPC' },
      { name: 'gtin14', label: 'GTIN-14' },
      { name: 'sample_eligible', label: 'Sample eligible', type: 'bool' },
    ],
  },
  mastercase: {
    table: 'master_cases', key: 'case_id', title: 'Master Case',
    fields: [
      { name: 'case_id', label: 'Case ID', required: true },
      { name: 'name', label: 'Name' },
      { name: 'status', label: 'Status' },
      { name: 'channel', label: 'Channel' },
      { name: 'composed_of', label: 'Composed Of', type: 'select', options: ['eaches', 'inners', 'cookies'] },
      { name: 'unit_ref', label: 'Unit Ref (code of composed level)' },
      { name: 'unit_qty', label: 'Units in Case', type: 'number' },
      { name: 'product_sku', label: 'Product SKU' },
      { name: 'gtin14', label: 'GTIN' },
      { name: 'length_in', label: 'Length (in)', type: 'number' },
      { name: 'width_in', label: 'Width (in)', type: 'number' },
      { name: 'height_in', label: 'Height (in)', type: 'number' },
      { name: 'gross_wt_lb', label: 'Gross Wt (lb)', type: 'number' },
      { name: 'cube_cuft', label: 'Cube (ft³)', type: 'number' },
      { name: 'net_wt_manual', label: 'Net Wt (sheet, lb)', type: 'number' },
      { name: 'storage_override', label: 'Storage override', type: 'select', options: ['', 'Ambient', 'Frozen'] },
      { name: 'ti', label: 'Ti', type: 'number' },
      { name: 'hi', label: 'Hi', type: 'number' },
      { name: 'cases_per_pallet', label: 'Cases / Pallet', type: 'number' },
      { name: 'pallet_size', label: 'Pallet Size' },
      { name: 'pallet_weight_lb', label: 'Pallet Wt (lb)', type: 'number' },
      { name: 'loading_height_in', label: 'Loading Ht (in)', type: 'number' },
      { name: 'shelf_life', label: 'Shelf Life' },
      { name: 'country', label: 'Country' },
      { name: 'sample_eligible', label: 'Sample eligible', type: 'bool' },
    ],
  },
};

const optionsFor = (spec, data) => {
  if (spec.options) return spec.options;
  if (spec.optionsFrom) {
    const [coll, field] = spec.optionsFrom.split('.');
    const list = (data?.[coll] || []).map((r) => r[field]).filter(Boolean);
    return ['', ...[...new Set(list)].sort()];
  }
  return null;
};

export default function EditModal({ kind, row, data, onClose, onSaved }) {
  const cfg = F[kind];
  const [form, setForm] = useState(() => {
    const init = {};
    cfg.fields.forEach((f) => {
      const v = row ? row[f.name] : undefined;
      init[f.name] = f.type === 'csv' ? (Array.isArray(v) ? v.join(', ') : v || '') : f.type === 'bool' ? !!v : v ?? '';
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const isEdit = !!row;

  const set = (name, v) => setForm((f) => ({ ...f, [name]: v }));

  const save = async () => {
    for (const f of cfg.fields) {
      if (f.required && !String(form[f.name] ?? '').trim()) {
        setErr(`${f.label} is required.`);
        return;
      }
    }
    const payload = {};
    cfg.fields.forEach((f) => {
      let v = form[f.name];
      if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
      else if (f.type === 'bool') v = !!v;
      else if (f.type === 'csv') v = String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
      else v = v === '' ? null : v;
      payload[f.name] = v;
    });
    setSaving(true);
    const { error } = await saveSpecRow(cfg.table, cfg.key, payload);
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto py-10" onClick={onClose}>
      <div className="bg-cd rounded-xl shadow-xl w-[560px] max-w-[92vw] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-black text-dk">{isEdit ? 'Edit' : 'Add'} {cfg.title}</div>
          <button onClick={onClose} className="text-gr hover:text-pk text-lg leading-none">×</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {cfg.fields.map((f) => {
            const opts = optionsFor(f, data);
            const keyLocked = isEdit && f.name === cfg.key;
            return (
              <div key={f.name} className={f.type === 'textarea' ? 'col-span-2' : ''}>
                <div className="text-[8px] text-gr uppercase mb-0.5">{f.label}{f.required && ' *'}</div>
                {f.type === 'bool' ? (
                  <label className="flex items-center gap-1.5 text-[11px] text-dk">
                    <input type="checkbox" checked={!!form[f.name]} onChange={(e) => set(f.name, e.target.checked)} /> {f.label}
                  </label>
                ) : opts ? (
                  <select value={form[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[11px] bg-bg">
                    {opts.map((o) => <option key={o} value={o}>{o === '' ? '—' : o}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea value={form[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} rows={2} className="w-full px-2 py-1 rounded border border-lt text-[11px]" />
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={form[f.name] ?? ''}
                    onChange={(e) => set(f.name, e.target.value)}
                    disabled={keyLocked}
                    className={`w-full px-2 py-1 rounded border border-lt text-[11px] ${keyLocked ? 'bg-bg text-gr' : ''} ${f.name === cfg.key ? 'font-mono' : ''}`}
                  />
                )}
              </div>
            );
          })}
        </div>
        {err && <div className="text-[11px] text-red-600 mt-2">{err}</div>}
        <div className="flex gap-2 mt-3">
          <button onClick={save} disabled={saving} className="bg-pk text-white px-3 py-1.5 rounded text-[11px] font-semibold hover:bg-pm disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : `Add ${cfg.title}`}
          </button>
          <button onClick={onClose} className="text-[11px] text-gr hover:text-pk px-2">Cancel</button>
        </div>
        {isEdit && <div className="text-[8px] text-gr italic mt-1.5">The natural key ({cfg.key}) is locked on edit — add a new row to change it.</div>}
      </div>
    </div>
  );
}
