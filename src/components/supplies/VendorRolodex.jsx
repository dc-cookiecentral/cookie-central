import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty } from '../specsheet/pills';
import { VendorStatus, ContactName, REF_LABEL } from './supplyUi';
import { deleteRow } from '../../hooks/useSupplies';

// Vendors tab — the rolodex (docs/SUPPLIES_SPEC.md). While the edit lock is
// open (V2.2): + Vendor, Edit vendor, + Contact, edit / delete a contact
// (and confirm the ones that came from Marc's sheet).
// /supplies?tab=vendors&vendor=<id> highlights and scrolls to one card; the
// Supplies tab links here from every vendor name, and each card links back to
// the items it supplies.

const CATEGORIES = [
  ['raw', 'Ingredients — raw materials', '#2E7D6B'],
  ['packaging', 'Packaging', '#1E5F8A'],
  ['equipment', 'Equipment', '#6B7280'],
  ['services', 'Services & co-manufacturing', '#7A5BA0'],
];

export default function VendorRolodex({ data, maps, editing, setModal, onChanged }) {
  const [params] = useSearchParams();
  const vendorId = params.get('vendor');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (vendorId) document.getElementById(`vendor-${vendorId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [vendorId]);

  const needle = q.trim().toLowerCase();
  const matches = (v) =>
    !needle ||
    [v.name, v.address, v.notes, ...(maps.contactsByVendor.get(v.id) || []).map((c) => c.name),
      ...[...(maps.itemsByVendor.get(v.id)?.values() || [])].map((i) => i.name)]
      .some((s) => s && s.toLowerCase().includes(needle));
  const vendors = [...data.vendors].sort((a, b) => a.name.localeCompare(b.name)).filter(matches);

  return (
    <div>
      <div className="flex justify-between items-end mb-3 gap-3 flex-wrap">
        <div className="text-[11px] text-gr">Every supplier, its terms and people. Double-click a contact name for details.</div>
        <div className="flex gap-2 items-center">
        {editing && (
          <button onClick={() => setModal({ kind: 'vendor' })} className="px-3 py-1.5 rounded text-[11px] font-bold bg-pk text-white hover:opacity-90">+ Vendor</button>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search vendor, contact or item…"
          className="text-[11px] px-2.5 py-1.5 border border-lt rounded-md bg-cd w-[240px] focus:outline-none focus:border-pk"
        />
        </div>
      </div>
      {CATEGORIES.map(([cat, label, color]) => {
        const list = vendors.filter((v) => v.category === cat);
        if (!list.length) return null;
        return (
          <div key={cat} className="mb-5">
            <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color }}>{label} · {list.length}</div>
            <div className="grid gap-3 items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {list.map((v) => <VendorCard key={v.id} vendor={v} maps={maps} selected={v.id === vendorId} editing={editing} setModal={setModal} onChanged={onChanged} />)}
            </div>
          </div>
        );
      })}
      {vendors.length === 0 && <div className="text-[11px] text-gr italic py-6 text-center">No vendors match “{q}”.</div>}
    </div>
  );
}

const SMALL = 'px-1.5 py-px rounded text-[9px] border border-lt text-pk hover:bg-pc';

function VendorCard({ vendor: v, maps, selected, editing, setModal, onChanged }) {
  const removeContact = async (c) => {
    if (!window.confirm(`Delete the contact ${c.name} at ${v.name}?`)) return;
    const { error } = await deleteRow('vendor_contacts', c.id);
    if (error) window.alert(`Couldn't delete: ${error.message}`);
    else onChanged();
  };
  // Contacts from documents first, Marc's rolodex after; primary first within each.
  const contacts = [...(maps.contactsByVendor.get(v.id) || [])]
    .sort((a, b) => (a.source === 'marc_sheet') - (b.source === 'marc_sheet') || b.is_primary - a.is_primary);
  const documented = maps.documentedVendors.has(v.id);
  const items = [...(maps.itemsByVendor.get(v.id)?.values() || [])].sort((a, b) => a.name.localeCompare(b.name));
  const facts = [
    ['Address', v.address],
    ['Phone', v.phone_main],
    ['Website', v.website && <a href={`https://${v.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer" className="text-pk hover:underline">{v.website}</a>],
    ['Account #', v.account_number],
    ['Terms', v.default_terms],
    ['FOB', v.fob],
    ['Freight', v.freight_notes],
    ['Billed as', v.billing_entity],
  ].filter(([, val]) => val);

  return (
    <div id={`vendor-${v.id}`} className={`bg-cd rounded-xl p-3 border ${selected ? 'border-2 border-pk shadow-md' : 'border-lt'}`}>
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="text-[13px] font-bold text-dk">{v.name}</div>
        <div className="flex gap-1.5 items-center">
          {editing && <button onClick={() => setModal({ kind: 'vendor', vendor: v })} className={SMALL}>Edit</button>}
          <VendorStatus v={v.status} />
        </div>
      </div>
      {!documented && (
        <div
          title={`Everything on this card comes from ${REF_LABEL} or is not on file — no quote, invoice or PO yet.`}
          className="mb-1.5 inline-block px-1.5 py-px rounded border border-dashed border-gr/40 text-[9px] italic text-gr/80"
        >
          No quote, invoice or PO on file — <span className="not-italic font-semibold text-pk">request a quote</span>
        </div>
      )}
      {facts.map(([k, val]) => (
        <div key={k} className="flex gap-2 text-[10.5px] py-px">
          <span className="w-[62px] flex-shrink-0 text-gr uppercase text-[8px] font-bold pt-[2px]">{k}</span>
          <span className="text-dk">{val}</span>
        </div>
      ))}
      <div className="mt-1.5 text-[10.5px]">
        <span className="text-gr uppercase text-[8px] font-bold">Contacts </span>
        {editing && <button onClick={() => setModal({ kind: 'contact', vendor: v })} className={`${SMALL} ml-1`}>+ Contact</button>}
        {editing ? (
          <div className="mt-1 space-y-0.5">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5">
                <ContactName contact={c} />
                {c.role && <span className="text-gr">({c.role})</span>}
                {c.is_primary && <span className="text-[8px] font-bold uppercase text-pk">primary</span>}
                <button onClick={() => setModal({ kind: 'contact', vendor: v, contact: c })} className={SMALL}>
                  {c.source === 'marc_sheet' ? 'Edit / confirm' : 'Edit'}
                </button>
                <button onClick={() => removeContact(c)} className="text-[9px] text-gr hover:text-red-600" title="Delete contact">✕</button>
              </div>
            ))}
            {!contacts.length && <Empty label="— none on file" />}
          </div>
        ) : contacts.length ? (
          contacts.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ' · '}
              <ContactName contact={c} />
              {c.role && <span className="text-gr"> ({c.role})</span>}
            </span>
          ))
        ) : <Empty label="— none on file" />}
      </div>
      {v.notes && <div className="mt-1.5 text-[10.5px] text-md">{v.notes}</div>}
      {items.length > 0 && (
        <div className="mt-2 pt-1.5 border-t border-lt text-[10.5px]">
          <span className="text-gr uppercase text-[8px] font-bold">Supplies </span>
          {items.map((i, n) => (
            <span key={i.id}>
              {n > 0 && ' · '}
              <Link to={`/supplies?item=${i.id}`} className="text-pk hover:underline">{i.name}</Link>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
