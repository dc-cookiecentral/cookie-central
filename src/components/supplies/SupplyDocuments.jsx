import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty } from '../specsheet/pills';
import { deleteDocument } from '../../hooks/useSupplies';
import { fmtDate, VendorLink, DOC_KINDS, docKindLabel } from './supplyUi';
import { useThumbs, DocThumb } from './docUi';

// Documents tab: the supplies document library — renderings, drawings, spec
// sheets, COAs, and the quotes / POs / invoices / packing slips behind the
// price lines. UNASSIGNED documents (no item picked yet, e.g. a tray drawing
// that could be the Walmart, Cookie Pie or ALDI tray) sit at the top until
// someone assigns them. While the edit lock is open: + Add document, Assign /
// Edit, Delete.

export default function SupplyDocuments({ data, maps, editing, setModal, onChanged }) {
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');

  const needle = q.trim().toLowerCase();
  const docs = (data.documents || [])
    .filter((d) => !kind || d.doc_kind === kind)
    .filter((d) => {
      if (!needle) return true;
      const items = (maps.itemIdsByDoc.get(d.id) || []).map((id) => maps.itemsById.get(id)?.name);
      return [d.title, d.notes, maps.vendorsById.get(d.vendor_id)?.name, ...items].some((s) => s && s.toLowerCase().includes(needle));
    })
    .sort((a, b) => String(b.doc_date || '').localeCompare(String(a.doc_date || '')) || a.title.localeCompare(b.title));
  const unassigned = docs.filter((d) => !maps.itemIdsByDoc.get(d.id)?.length);
  const assigned = docs.filter((d) => maps.itemIdsByDoc.get(d.id)?.length);
  const thumbs = useThumbs(docs);

  const remove = async (d) => {
    const usedByLine = data.quotes.some((x) => x.doc_path === d.doc_path);
    const msg = usedByLine
      ? `Remove “${d.title}” from the library? A price line still opens this file, so the file itself is kept.`
      : `Delete “${d.title}” and its file? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    const { error } = await deleteDocument(d, data.quotes);
    if (error) window.alert(`Couldn't delete: ${error.message}`);
    else onChanged();
  };

  const row = (d) => {
    const items = (maps.itemIdsByDoc.get(d.id) || []).map((id) => maps.itemsById.get(id)).filter(Boolean);
    const vendor = maps.vendorsById.get(d.vendor_id) || null;
    return (
      <div key={d.id} className="flex gap-3 items-start py-2 border-t border-lt first:border-t-0">
        <DocThumb doc={d} url={thumbs[d.doc_path]} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-dk">{d.title}</div>
          <div className="text-[10px] text-md">
            <span className="inline-block px-1.5 py-px rounded text-[9px] font-bold bg-pc text-pk mr-1">{docKindLabel(d.doc_kind)}</span>
            {vendor ? <VendorLink vendor={vendor} /> : <span className="text-gr">vendor not set</span>}
            {d.doc_date && <span className="text-gr"> · {fmtDate(d.doc_date)}</span>}
          </div>
          <div className="text-[10px] mt-0.5">
            {items.length ? items.map((i, n) => (
              <span key={i.id}>
                {n > 0 && ' · '}
                <Link to={`/supplies?item=${i.id}`} className="text-pk hover:underline">{i.name}</Link>
              </span>
            )) : <span className="inline-block px-1.5 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-700">⚑ unassigned — which item is this for?</span>}
          </div>
          {d.notes && <div className="text-[10px] text-md mt-0.5">{d.notes}</div>}
        </div>
        {editing && (
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={() => setModal({ kind: 'doc', doc: d })} className="px-2 py-0.5 rounded text-[10px] border border-lt text-pk hover:bg-pc">
              {items.length ? 'Edit / reassign' : 'Assign'}
            </button>
            <button onClick={() => remove(d)} className="px-2 py-0.5 rounded text-[10px] border border-red-200 text-red-600 hover:bg-red-50">Delete</button>
          </div>
        )}
      </div>
    );
  };

  const section = (label, list, color, note) => (
    <div className="mb-4">
      <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color }}>{label} — {list.length}</div>
      {note && <div className="text-[10px] text-gr mb-1">{note}</div>}
      <div className="bg-cd border border-lt rounded-xl px-3 py-1">
        {list.length ? list.map(row) : <div className="py-2"><Empty label="— none" /></div>}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-end mb-3 gap-3 flex-wrap">
        <div className="text-[11px] text-gr max-w-[640px]">
          Renderings, drawings, spec sheets and the original quotes, POs and invoices, each assigned to the item(s) it belongs to.
          Click a thumbnail to open the original. {!editing && 'Unlock editing to add or assign documents.'}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="px-2 py-1 rounded border border-lt text-[11px] bg-bg">
            <option value="">All types</option>
            {DOC_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, vendor, item…" className="px-2 py-1 rounded border border-lt text-[11px] bg-bg w-[200px]" />
          {editing && (
            <button onClick={() => setModal({ kind: 'doc' })} className="px-3 py-1.5 rounded text-[11px] font-bold bg-pk text-white hover:opacity-90">+ Add document</button>
          )}
        </div>
      </div>
      {(unassigned.length > 0 || !assigned.length) && section('Unassigned', unassigned, '#B45309', 'Not yet linked to an item. Open each, decide which item(s) it covers, and assign it.')}
      {section('Assigned', assigned, '#7A5BA0')}
    </div>
  );
}
