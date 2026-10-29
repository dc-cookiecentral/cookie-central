import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSupplies } from '../hooks/useSupplies';
import { Empty } from '../components/specsheet/pills';
import { buildSupplyMaps, VendorStatus, ContactName } from '../components/supplies/supplyUi';

// Vendors rolodex (docs/SUPPLIES_SPEC.md, Phase V1 — READ-ONLY).
// /vendors?vendor=<id> highlights and scrolls to one card; Supplies links here
// from every vendor name, and each card links back to the items it supplies.

const CATEGORIES = [
  ['raw', 'Ingredients — raw materials', '#2E7D6B'],
  ['packaging', 'Packaging', '#1E5F8A'],
  ['equipment', 'Equipment', '#6B7280'],
  ['services', 'Services & co-manufacturing', '#7A5BA0'],
];

export default function Vendors() {
  const { data, loading, error } = useSupplies();
  const [params] = useSearchParams();
  const vendorId = params.get('vendor');
  const [q, setQ] = useState('');
  const maps = useMemo(() => (data ? buildSupplyMaps(data) : null), [data]);

  useEffect(() => {
    if (vendorId && data) document.getElementById(`vendor-${vendorId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [vendorId, data]);

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading Vendors…</div>;
  if (error)
    return (
      <div className="text-sm text-red-600 py-6">
        {error}
        <div className="text-[11px] text-gr mt-1">If tables are missing, apply the supplies migration + seed first.</div>
      </div>
    );

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
        <div>
          <h1 className="text-xl font-bold text-dk">Vendors <span className="text-gr font-normal text-sm">· rolodex</span></h1>
          <div className="text-[11px] text-gr">Every supplier, its terms and people. Double-click a contact name for details. Read-only.</div>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search vendor, contact or item…"
          className="text-[11px] px-2.5 py-1.5 border border-lt rounded-md bg-cd w-[240px] focus:outline-none focus:border-pk"
        />
      </div>
      {CATEGORIES.map(([cat, label, color]) => {
        const list = vendors.filter((v) => v.category === cat);
        if (!list.length) return null;
        return (
          <div key={cat} className="mb-5">
            <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color }}>{label} · {list.length}</div>
            <div className="grid gap-3 items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {list.map((v) => <VendorCard key={v.id} vendor={v} maps={maps} selected={v.id === vendorId} />)}
            </div>
          </div>
        );
      })}
      {vendors.length === 0 && <div className="text-[11px] text-gr italic py-6 text-center">No vendors match “{q}”.</div>}
    </div>
  );
}

function VendorCard({ vendor: v, maps, selected }) {
  const contacts = [...(maps.contactsByVendor.get(v.id) || [])].sort((a, b) => b.is_primary - a.is_primary);
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
        <VendorStatus v={v.status} />
      </div>
      {facts.map(([k, val]) => (
        <div key={k} className="flex gap-2 text-[10.5px] py-px">
          <span className="w-[62px] flex-shrink-0 text-gr uppercase text-[8px] font-bold pt-[2px]">{k}</span>
          <span className="text-dk">{val}</span>
        </div>
      ))}
      <div className="mt-1.5 text-[10.5px]">
        <span className="text-gr uppercase text-[8px] font-bold">Contacts </span>
        {contacts.length ? (
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
