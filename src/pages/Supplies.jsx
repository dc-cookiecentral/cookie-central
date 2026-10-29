import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSupplies, openSupplyDoc } from '../hooks/useSupplies';
import SpecTable from '../components/specsheet/SpecTable';
import { Empty, Code } from '../components/specsheet/pills';
import {
  buildSupplyMaps, fmtMoney, fmtPerLb, fmtPerM, fmtQty, fmtDate, DocDate, QuoteStatus, docLabel,
  VendorLink, ContactName,
} from '../components/supplies/supplyUi';

// Supplies (docs/SUPPLIES_SPEC.md, Phase V1 — READ-ONLY).
//   items list (Ingredients / Packaging)
//     → dblclick an item: one line per vendor SKU price point
//       → dblclick a line: terms & notes, 📄 original document
// The selected item lives in ?item= so /vendors can link straight to it.

// Current price points first: on PO / active, then preliminary, expired, closed.
const STATUS_RANK = { on_po: 0, active: 1, preliminary: 2, expired: 3, closed: 4 };

export default function Supplies() {
  const { data, loading, error } = useSupplies();
  const [params, setParams] = useSearchParams();
  const itemId = params.get('item');
  const [lineId, setLineId] = useState(null);

  const maps = useMemo(() => (data ? buildSupplyMaps(data) : null), [data]);

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading Supplies…</div>;
  if (error)
    return (
      <div className="text-sm text-red-600 py-6">
        {error}
        <div className="text-[11px] text-gr mt-1">If tables are missing, apply the supplies migration + seed first.</div>
      </div>
    );

  const selectItem = (id) => {
    setLineId(null);
    setParams(id && id !== itemId ? { item: id } : {}, { replace: true });
  };

  const rows = data.items
    .map((i) => ({
      ...i,
      primary: maps.vendorsById.get(i.primary_vendor_id) || null,
      vendorCount: new Set((maps.skusByItem.get(i.id) || []).map((s) => s.vendor_id).filter(Boolean)).size,
      lastOrder: maps.lastOrderByItem.get(i.id) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cols = [
    { key: 'name', label: 'Item', render: (r) => <span className="font-semibold text-dk">{r.name}</span> },
    {
      key: 'primary', label: 'Primary Vendor', value: (r) => r.primary?.name || '',
      render: (r) =>
        r.primary ? <span>★ <VendorLink vendor={r.primary} /></span>
          : r.vendorCount ? <span className="text-gr">{r.vendorCount} vendor{r.vendorCount > 1 ? 's' : ''} — none selected</span>
            : <Empty label="— vendor pending" />,
    },
    {
      key: 'lastOrder', label: 'Last Order', value: (r) => r.lastOrder?.doc_date || '',
      render: (r) =>
        r.lastOrder ? (
          <span>
            {fmtDate(r.lastOrder.doc_date)} <span className="text-[9px] text-gr">{docLabel(r.lastOrder)}</span>
          </span>
        ) : <Empty />,
    },
  ];

  const section = (kind, label, color) => {
    const kindRows = rows.filter((r) => r.kind === kind);
    const selected = kindRows.find((r) => r.id === itemId);
    return (
      <div className="mb-5">
        <div className="text-[11px] font-bold uppercase tracking-wide mt-1 mb-1" style={{ color }}>{label}</div>
        <SpecTable
          columns={cols}
          rows={kindRows}
          bandLabel={`${label} — ${kindRows.length} items · double-click an item for its vendors`}
          bandColor={color}
          onRowDoubleClick={(r) => selectItem(r.id)}
          isRowSelected={(r) => r.id === itemId}
        />
        {selected && (
          <ItemDrill item={selected} data={data} maps={maps} lineId={lineId} setLineId={setLineId} onClose={() => selectItem(null)} />
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold text-dk">Supplies <span className="text-gr font-normal text-sm">· ingredients &amp; packaging</span></h1>
        <div className="text-[11px] text-gr">Who sells each ingredient and packaging component, at what price and terms, with the original quote or invoice. Read-only.</div>
      </div>
      <div className="text-[11px] text-gr mb-3 bg-cd border border-lt rounded-lg p-2.5">
        <b>Double-click an item</b> for its vendors and price points. <b>Double-click a price line</b> for terms, notes and the original document.
        $/lb and $/1,000 are <b>derived</b> from the document price — never typed. Date badges age against today: green &lt; 60 days, amber 60–90, red &gt; 90 or past validity.
      </div>
      {section('ingredient', 'Ingredients', '#2E7D6B')}
      {section('packaging', 'Packaging', '#1E5F8A')}
    </div>
  );
}

// ── item drill-down: one line per price point (SKUs with none get one line) ──
function ItemDrill({ item, data, maps, lineId, setLineId, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [item.id]);

  const ingredient = item.kind === 'ingredient';
  const lines = (maps.skusByItem.get(item.id) || []).flatMap((sku) => {
    const vendor = maps.vendorsById.get(sku.vendor_id) || null;
    const quotes = maps.quotesBySku.get(sku.id) || [];
    if (!quotes.length) return [{ id: sku.id, sku, vendor, quote: null, breaks: [] }];
    return quotes.map((quote) => ({ id: quote.id, sku, vendor, quote, breaks: maps.breaksByQuote.get(quote.id) || [] }));
  });
  lines.sort((a, b) =>
    (b.vendor?.id === item.primary_vendor_id) - (a.vendor?.id === item.primary_vendor_id)
    || (STATUS_RANK[a.quote?.status] ?? 9) - (STATUS_RANK[b.quote?.status] ?? 9)
    || String(b.quote?.doc_date || '').localeCompare(String(a.quote?.doc_date || '')));
  const line = lines.find((l) => l.id === lineId);

  const stack = (l, fn) =>
    l.breaks.length ? (
      <div className="space-y-0.5">{l.breaks.map((b) => <div key={b.break_id} className="whitespace-nowrap">{fn(b) ?? <Empty />}</div>)}</div>
    ) : <Empty />;
  const orderQty = (l, b) =>
    l.sku.order_unit === 'each' ? `${fmtQty(b.qty)} pcs` : `${fmtQty(b.qty)} × ${l.sku.order_unit}`;

  const cols = [
    {
      key: 'vendor', label: 'Vendor — Brand/SKU · item code', value: (l) => l.vendor?.name || '',
      render: (l) => {
        const primaryContact = (maps.contactsByVendor.get(l.vendor?.id) || []).find((c) => c.is_primary);
        return (
          <div className="min-w-[220px]">
            {l.vendor?.id === item.primary_vendor_id && <span className="text-amber-500 mr-0.5">★</span>}
            <VendorLink vendor={l.vendor} />
            <div className="text-[10px] text-md">
              {l.sku.brand_name || <Empty label="— brand not on file" />}
              {l.sku.item_code && <> · <Code v={l.sku.item_code} /></>}
            </div>
            {primaryContact && <div className="text-[10px] text-gr"><ContactName contact={primaryContact} /></div>}
          </div>
        );
      },
    },
    {
      key: 'qty', label: 'Order qty / unit', sortable: false,
      render: (l) => (l.breaks.length ? stack(l, (b) => orderQty(l, b)) : <span className="text-gr">{l.sku.order_unit}</span>),
    },
    { key: 'price', label: 'Price / order qty', sortable: false, render: (l) => stack(l, (b) => <span className="font-semibold text-dk">{fmtMoney(b.price_per_order_qty)}</span>) },
    {
      key: 'unit', label: ingredient ? 'Price / lb' : 'Price / 1,000', sortable: false,
      render: (l) => stack(l, (b) => {
        const v = ingredient ? fmtPerLb(b.price_per_lb) : b.price_per_thousand != null ? fmtPerM(b.price_per_thousand) : b.price_per_unit != null && `${fmtMoney(b.price_per_unit)} ea`;
        return v ? <span className="font-semibold text-emerald-700">{v}</span> : null;
      }),
    },
    {
      key: 'source', label: 'Source', value: (l) => l.quote?.status || '',
      render: (l) =>
        l.quote ? (
          <div>
            <QuoteStatus v={l.quote.status} />
            <div className="text-[10px] text-md mt-0.5">{docLabel(l.quote)}</div>
          </div>
        ) : <Empty label="— no price on file" />,
    },
    {
      key: 'date', label: 'Date', value: (l) => l.quote?.doc_date || '',
      render: (l) =>
        l.quote ? (
          <div>
            <DocDate date={l.quote.doc_date} validUntil={l.quote.valid_until} />
            {l.quote.doc_path && (
              <button
                onClick={(e) => { e.stopPropagation(); openSupplyDoc(l.quote.doc_path); }}
                onDoubleClick={(e) => e.stopPropagation()}
                className="block mt-0.5 text-[10px] font-semibold text-pk hover:underline"
              >
                📄 Open original
              </button>
            )}
          </div>
        ) : <Empty />,
    },
  ];

  return (
    <div ref={ref} className="border-2 border-pk rounded-xl p-3 mb-4 bg-pc">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-[15px] font-bold text-dk">{item.name}</div>
          {item.notes && <div className="text-[11px] text-md max-w-[900px]">{item.notes}</div>}
        </div>
        <button onClick={onClose} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-lt text-gr hover:text-pk">✕ Close</button>
      </div>
      <SpecTable
        key={item.id}
        columns={cols}
        rows={lines}
        bandLabel={`${lines.length} price line${lines.length === 1 ? '' : 's'} · double-click a line for terms & notes`}
        bandColor="#7A5BA0"
        emptyNote="No vendor SKUs on file for this item."
        onRowDoubleClick={(l) => setLineId(l.id === lineId ? null : l.id)}
        isRowSelected={(l) => l.id === lineId}
      />
      {line && <LineDetail line={line} maps={maps} onClose={() => setLineId(null)} />}
    </div>
  );
}

// ── line detail: terms, notes, the original document ────────────────────────
function LineDetail({ line, maps, onClose }) {
  const { quote, sku, vendor } = line;
  const contacts = maps.contactsByVendor.get(vendor?.id) || [];
  const fields = [
    ['MOQ', quote?.moq],
    ['Lead time', quote?.lead_time],
    ['Payment terms', quote?.terms || (vendor?.default_terms && `${vendor.default_terms} (vendor default)`)],
    ['One-time costs', quote?.one_time_costs],
    ['FOB / freight', [vendor?.fob, vendor?.freight_notes].filter(Boolean).join(' · ')],
    ['Valid until', quote?.valid_until && fmtDate(quote.valid_until)],
    ['Order unit', [sku.order_unit, sku.unit_weight_lbs && `${sku.unit_weight_lbs} lb`, sku.units_per_order_unit > 1 && `${fmtQty(sku.units_per_order_unit)} pcs`].filter(Boolean).join(' · ')],
    ['Vendor item #', sku.vendor_item_code],
  ];
  return (
    <div className="bg-cd border border-lt rounded-xl p-3">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-[12px] font-bold text-dk">
            {vendor?.name || 'Vendor pending'} — {sku.brand_name || 'brand not on file'}
          </div>
          {quote && (
            <div className="text-[10px] text-md flex items-center gap-1.5 mt-0.5">
              <QuoteStatus v={quote.status} /> {docLabel(quote)} · <DocDate date={quote.doc_date} validUntil={quote.valid_until} />
            </div>
          )}
        </div>
        <div className="flex gap-1.5 items-center">
          {quote?.doc_path && (
            <button onClick={() => openSupplyDoc(quote.doc_path)} className="text-[11px] font-semibold px-3 py-1 rounded border border-pk text-pk hover:bg-pc">
              📄 Open original{quote.doc_date ? ` (${fmtDate(quote.doc_date)})` : ''}
            </button>
          )}
          <button onClick={onClose} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-lt text-gr hover:text-pk">✕</button>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {fields.map(([k, v]) => (
          <div key={k}>
            <div className="text-[8px] font-bold uppercase tracking-wider text-gr">{k}</div>
            <div className="text-[11px] text-dk">{v || <Empty />}</div>
          </div>
        ))}
      </div>
      {(quote?.notes || sku.spec_note) && (
        <div className="mt-2 pt-2 border-t border-lt text-[11px] text-md space-y-1">
          {quote?.notes && <div><b className="text-dk">Notes:</b> {quote.notes}</div>}
          {sku.spec_note && <div><b className="text-dk">SKU:</b> {sku.spec_note}</div>}
        </div>
      )}
      {contacts.length > 0 && (
        <div className="mt-2 pt-2 border-t border-lt text-[11px] text-md">
          <b className="text-dk">Contacts</b> <span className="text-[9px] text-gr">(double-click a name)</span>:{' '}
          {contacts.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ' · '}
              <ContactName contact={c} />
              {c.role && <span className="text-gr"> ({c.role})</span>}
            </span>
          ))}
        </div>
      )}
      {!quote && <div className="mt-2 text-[11px] text-gr italic">No quote, PO or invoice on file for this SKU yet.</div>}
    </div>
  );
}
