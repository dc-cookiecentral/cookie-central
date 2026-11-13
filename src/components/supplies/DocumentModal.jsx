import { useMemo, useState } from 'react';
import { saveDocument } from '../../hooks/useSupplies';
import { DOC_KINDS } from './supplyUi';

// Add a document (rendering, drawing, spec sheet, COA, quote, invoice …) or
// edit one — and choose which items it belongs to. One document can belong to
// several items (a drawing covering the Walmart and ALDI trays); with none
// ticked it stays UNASSIGNED on the Documents tab until someone picks.
// Same look as components/shared/EditModal.

const INPUT = 'w-full px-2 py-1 rounded border border-lt text-[11px] bg-bg';
const LABEL = 'text-[8px] text-gr uppercase mb-0.5';

const baseName = (name) => String(name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

export default function DocumentModal({ data, maps, doc, presetItemIds = [], onClose, onSaved }) {
  const isEdit = !!doc;
  const [form, setForm] = useState(() => ({
    title: doc?.title || '',
    doc_kind: doc?.doc_kind || 'rendering',
    vendor_id: doc?.vendor_id || '',
    doc_date: doc?.doc_date || '',
    notes: doc?.notes || '',
  }));
  const [itemIds, setItemIds] = useState(() => new Set(isEdit ? maps.itemIdsByDoc.get(doc.id) || [] : presetItemIds));
  const [file, setFile] = useState(null);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (id) => setItemIds((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const vendors = useMemo(() => [...data.vendors].sort((a, b) => a.name.localeCompare(b.name)), [data.vendors]);
  // Packaging first: renderings and drawings are mostly packaging.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.items
      .filter((i) => !needle || i.name.toLowerCase().includes(needle) || itemIds.has(i.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [['Packaging', list.filter((i) => i.kind === 'packaging')], ['Ingredients', list.filter((i) => i.kind === 'ingredient')]]
      .filter(([, l]) => l.length);
  }, [data.items, q, itemIds]);

  const save = async () => {
    if (!isEdit && !file) return setErr('Choose the file to upload.');
    const title = form.title.trim() || baseName(file?.name);
    if (!title) return setErr('Give the document a title.');
    setErr(null);
    setSaving(true);
    const { error } = await saveDocument({
      doc: {
        ...(isEdit ? { id: doc.id } : {}),
        title,
        doc_kind: form.doc_kind,
        vendor_id: form.vendor_id || null,
        doc_date: form.doc_date || null,
        notes: form.notes.trim() || null,
      },
      file,
      itemIds: [...itemIds],
      vendorName: maps.vendorsById.get(form.vendor_id)?.name,
    });
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto py-10" onClick={onClose}>
      <div className="bg-cd rounded-xl shadow-xl w-[640px] max-w-[94vw] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <div className="text-sm font-black text-dk">{isEdit ? `Document — ${doc.title}` : 'Add document'}</div>
          <button onClick={onClose} className="text-gr hover:text-pk text-lg leading-none">×</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!isEdit && (
            <div className="col-span-2">
              <div className={LABEL}>File * (PDF or image)</div>
              <input
                type="file" accept="application/pdf,image/*" className="text-[11px]"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  if (f && !form.title.trim()) set('title', baseName(f.name));
                }}
              />
            </div>
          )}
          <div className="col-span-2">
            <div className={LABEL}>Title *</div>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Walmart 4-pk tray — drawing rev B" className={INPUT} />
          </div>
          <div>
            <div className={LABEL}>Type</div>
            <select value={form.doc_kind} onChange={(e) => set('doc_kind', e.target.value)} className={INPUT}>
              {DOC_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <div className={LABEL}>Document date</div>
            <input type="date" value={form.doc_date} onChange={(e) => set('doc_date', e.target.value)} className={INPUT} />
          </div>
          <div className="col-span-2">
            <div className={LABEL}>Vendor</div>
            <select value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)} className={INPUT}>
              <option value="">— none / not sure</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.status === 'closed' ? ' (closed)' : ''}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <div className={LABEL}>Notes</div>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="What it shows, which version, anything unclear" className={INPUT} />
          </div>
        </div>

        <div className="mt-3 flex justify-between items-end gap-2">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-dk">Belongs to</div>
            <div className="text-[9px] text-gr">
              {itemIds.size ? `${itemIds.size} item${itemIds.size > 1 ? 's' : ''} ticked` : 'None ticked: the document stays unassigned until you pick.'}
            </div>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…" className="px-2 py-1 rounded border border-lt text-[11px] bg-bg w-[200px]" />
        </div>
        <div className="mt-1 max-h-[260px] overflow-y-auto border border-lt rounded-lg p-2 bg-bg/40">
          {groups.map(([label, list]) => (
            <div key={label} className="mb-1.5">
              <div className="text-[8px] font-bold uppercase tracking-wider text-gr mb-0.5">{label}</div>
              {list.map((i) => (
                <label key={i.id} className="flex items-center gap-1.5 text-[11px] text-dk py-px">
                  <input type="checkbox" checked={itemIds.has(i.id)} onChange={() => toggle(i.id)} /> {i.name}
                </label>
              ))}
            </div>
          ))}
          {!groups.length && <div className="text-[11px] text-gr italic">No item matches “{q}”.</div>}
        </div>

        {err && <div className="text-[11px] text-red-600 mt-2">{err}</div>}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-3 py-1 rounded text-[11px] border border-lt text-gr">Cancel</button>
          <button onClick={save} disabled={saving} className="px-3 py-1 rounded text-[11px] font-bold bg-pk text-white disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Add document'}
          </button>
        </div>
      </div>
    </div>
  );
}
