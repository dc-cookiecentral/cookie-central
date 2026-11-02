import { useState } from 'react';

// Shared config-driven add/edit form (docs/SUPPLIES_SPEC.md §V2.1). The page
// owns the config and the write; this owns the form state, coercion and look.
//
//   <EditModal config={cfg} row={row|null} data={…} onSave={async (payload, ctx) => ({ error })} … />
//
// config: {
//   title,                — "Add {title}" / "Edit {title}" unless `heading` is given
//   key?,                 — natural key: locked (and monospace) on edit, with a footnote
//   heading?,             — fixed heading instead of Add/Edit {title}
//   submitLabel?,         — fixed button text instead of "Add {title}" / "Save changes"
//   keyNote?,             — false hides the "natural key is locked" footnote
//   fields: [field],
// }
// field: {
//   name, label,          — label may be (form, ctx) => string
//   type?: text|number|date|select|bool|textarea|csv,
//   options?,             — ['a', 'b'] or [{ value, label }]; '' renders as '—'
//   optionsFrom?,         — 'collection.field' of `data`, deduped + sorted
//   required?, hint?,     — hint may be (form, ctx) => string
//   disabled?,            — bool or (form, ctx) => bool; `clearWhenDisabled` shows it blank
//   step?, min?, autoFocus?, wide?, mono?,
//   validate?,            — (value, form) => error string | null, run on the coerced value
// }
// ctx = { isEdit, row }. onSave receives the coerced payload (number → Number|null,
// bool → boolean, csv → string[], '' → null) and returns { error }.

const INPUT = 'w-full px-2 py-1 rounded border border-lt text-[11px]';

const optionsFor = (spec, data) => {
  if (spec.options) return spec.options.map((o) => (typeof o === 'object' ? o : { value: o, label: o === '' ? '—' : o }));
  if (spec.optionsFrom) {
    const [coll, field] = spec.optionsFrom.split('.');
    const list = (data?.[coll] || []).map((r) => r[field]).filter(Boolean);
    return ['', ...[...new Set(list)].sort()].map((o) => ({ value: o, label: o === '' ? '—' : o }));
  }
  return null;
};

const resolve = (v, form, ctx) => (typeof v === 'function' ? v(form, ctx) : v);

function coerce(f, v) {
  if (f.type === 'number') return v === '' || v == null ? null : Number(v);
  if (f.type === 'bool') return !!v;
  if (f.type === 'csv') return String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  return v === '' ? null : v;
}

export default function EditModal({ config: cfg, row, data, onSave, onClose, onSaved }) {
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
  const ctx = { isEdit, row };

  const set = (name, v) => setForm((f) => ({ ...f, [name]: v }));

  const save = async () => {
    for (const f of cfg.fields) {
      if (f.required && !String(form[f.name] ?? '').trim()) {
        setErr(`${resolve(f.label, form, ctx)} is required.`);
        return;
      }
    }
    const payload = {};
    for (const f of cfg.fields) {
      payload[f.name] = coerce(f, form[f.name]);
      const msg = f.validate?.(payload[f.name], form);
      if (msg) {
        setErr(msg);
        return;
      }
    }
    setSaving(true);
    const { error } = await onSave(payload, ctx);
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  const heading = cfg.heading ?? `${isEdit ? 'Edit' : 'Add'} ${cfg.title}`;
  const submit = cfg.submitLabel ?? (isEdit ? 'Save changes' : `Add ${cfg.title}`);

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto py-10" onClick={onClose}>
      <div className="bg-cd rounded-xl shadow-xl w-[560px] max-w-[92vw] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-black text-dk">{heading}</div>
          <button onClick={onClose} className="text-gr hover:text-pk text-lg leading-none">×</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {cfg.fields.map((f) => {
            const opts = optionsFor(f, data);
            const label = resolve(f.label, form, ctx);
            const hint = resolve(f.hint, form, ctx);
            const keyLocked = isEdit && f.name === cfg.key;
            const disabled = keyLocked || !!resolve(f.disabled, form, ctx);
            const value = disabled && f.clearWhenDisabled ? '' : form[f.name] ?? '';
            const mono = f.mono || f.name === cfg.key;
            return (
              <div key={f.name} className={f.type === 'textarea' || f.wide ? 'col-span-2' : ''}>
                <div className="text-[8px] text-gr uppercase mb-0.5">{label}{f.required && ' *'}</div>
                {f.type === 'bool' ? (
                  <label className="flex items-center gap-1.5 text-[11px] text-dk">
                    <input type="checkbox" checked={!!form[f.name]} onChange={(e) => set(f.name, e.target.checked)} /> {label}
                  </label>
                ) : opts ? (
                  <select value={value} onChange={(e) => set(f.name, e.target.value)} disabled={disabled} className={`${INPUT} bg-bg`}>
                    {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea value={value} onChange={(e) => set(f.name, e.target.value)} rows={2} disabled={disabled} className={INPUT} />
                ) : (
                  <input
                    type={f.type === 'number' || f.type === 'date' ? f.type : 'text'}
                    value={value}
                    onChange={(e) => set(f.name, e.target.value)}
                    disabled={disabled}
                    step={f.step}
                    min={f.min}
                    autoFocus={f.autoFocus}
                    className={`${INPUT} ${disabled ? 'bg-bg text-gr' : ''} ${mono ? 'font-mono' : ''}`}
                  />
                )}
                {hint && <div className="text-[9px] text-gr mt-0.5">{hint}</div>}
              </div>
            );
          })}
        </div>
        {err && <div className="text-[11px] text-red-600 mt-2">{err}</div>}
        <div className="flex gap-2 mt-3">
          <button onClick={save} disabled={saving} className="bg-pk text-white px-3 py-1.5 rounded text-[11px] font-semibold hover:bg-pm disabled:opacity-50">
            {saving ? 'Saving…' : submit}
          </button>
          <button onClick={onClose} className="text-[11px] text-gr hover:text-pk px-2">Cancel</button>
        </div>
        {isEdit && cfg.key && cfg.keyNote !== false && (
          <div className="text-[8px] text-gr italic mt-1.5">The natural key ({cfg.key}) is locked on edit — add a new row to change it.</div>
        )}
      </div>
    </div>
  );
}
