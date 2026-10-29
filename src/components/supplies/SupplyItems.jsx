import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { openSupplyDoc } from '../../hooks/useSupplies';
import SpecTable from '../specsheet/SpecTable';
import { Empty, Code } from '../specsheet/pills';
import {
  fmtMoney, fmtQty, fmtDate, fmtUnit, priceTone, headlinePrices, DocDate, QuoteStatus, docLabel,
  VendorLink, ContactName,
} from './supplyUi';

// Supplies tab (docs/SUPPLIES_SPEC.md, Phase V1 — READ-ONLY).
//   items list (Ingredients / Packaging) — headline price: last PO + best quote
//     → dblclick an item: its price lines open directly under the item row
//       → dblclick a line: terms & notes, 📄 original document, under that line
// The selected item lives in ?item= so the Vendors tab can link straight to it.

// Current price points first: on PO / active, then preliminary, expired, closed.
const STATUS_RANK = { on_po: 0, active: 1, preliminary: 2, expired: 3, closed: 4 };

export default function SupplyItems({ data, maps }) {
  const [params, setParams] = useSearchParams();
  const itemId = params.get('item');
  const [lineId, setLineId] = useState(null);

  const selectItem = (id) => {
    setLineId(null);
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (id && id !== itemId) next.set('item', id);
      else next.delete('item');
      return next;
    }, { replace: true });
  };

  const rows = data.items
    .map((i) => ({
      ...i,
      primary: maps.vendorsById.get(i.primary_vendor_id) || null,
      vendorCount: new Set((maps.skusByItem.get(i.id) || []).map((s) => s.vendor_id).filter(Boolean)).size,
      lastOrder: maps.lastOrderByItem.get(i.id) || null,
      points: maps.pricePointsByItem.get(i.id) || [],
      ...headlinePrices(maps.pricePointsByItem.get(i.id)),
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
      key: 'price', label: 'Price', // relabelled per section value: (r) => (r.lastPo || r.bestQuote)?.unit ?? '',
      render: (r) => <HeadlinePrice row={r} />,
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
    return (
      <div className="mb-5">
        <div className="text-[11px] font-bold uppercase tracking-wide mt-1 mb-1" style={{ color }}>{label}</div>
        <SpecTable
          columns={cols.map((c) => (c.key === 'price' ? { ...c, label: kind === 'ingredient' ? 'Price / lb' : 'Price / 1,000' } : c))}
          rows={kindRows}
          bandLabel={`${label} — ${kindRows.length} items · double-click an item for its vendors`}
          bandColor={color}
          onRowDoubleClick={(r) => selectItem(r.id)}
          isRowSelected={(r) => r.id === itemId}
          renderRowDetail={(r) =>
            r.id === itemId && <ItemDrill item={r} maps={maps} lineId={lineId} setLineId={setLineId} onClose={() => selectItem(null)} />}
        />
      </div>
    );
  };

  return (
    <div>
      <div className="text-[11px] text-gr mb-3 bg-cd border border-lt rounded-lg p-2.5">
        <b>Double-click an item</b> for its vendors and price points. <b>Double-click a price line</b> for terms, notes and the original document.
        Prices in <b className="text-dk">black</b> come from a PO or invoice; prices in <b>grey</b> are quotes. The list shows the latest PO and the best open quote — <b>▸</b> expands the history.
        $/lb and $/1,000 are <b>derived</b> from the document price — never typed. Date badges age against today: green &lt; 60 days, amber 60–90, red &gt; 90 or past validity.
      </div>
      {section('ingredient', 'Ingredients', '#2E7D6B')}
      {section('packaging', 'Packaging', '#1E5F8A')}
    </div>
  );
}

// ── macro-list price: latest PO (black) + best open quote (grey), ▸ history ──
function HeadlinePrice({ row }) {
  const [open, setOpen] = useState(false);
  const { lastPo, bestQuote, points, kind } = row;
  if (!points.length) return <Empty label="— no price on file" />;
  const shown = [lastPo, bestQuote].filter(Boolean);
  const more = points.length - shown.length;
  const point = (p, label) => (
    <div key={p.id + label} className="whitespace-nowrap">
      <span className={`font-semibold ${priceTone(p.quote)}`}>{fmtUnit(kind, p.brk)}</span>
      {p.multiBreak && <span className="text-[9px] text-gr"> @{fmtQty(p.brk.qty)}</span>}
      <span className="text-[9px] text-gr"> · {label} · {p.vendor?.name || 'vendor pending'}</span>
    </div>
  );
  return (
    <div>
      {lastPo && point(lastPo, `last ${lastPo.quote.doc_type === 'invoice' ? 'invoice' : 'PO'}`)}
      {bestQuote && point(bestQuote, 'best quote')}
      {!shown.length && <span className="text-[10px] text-gr italic">No open quote or PO</span>}
      {more > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="block text-[9px] font-semibold text-pk hover:underline"
        >
          {open ? '▾ hide history' : `▸ history (${points.length})`}
        </button>
      )}
      {open && (
        <div className="mt-1 pl-2 border-l-2 border-lt space-y-0.5">
          {points.map((p) => (
            <div key={p.id} className="whitespace-nowrap text-[10px]">
              <span className={`font-semibold ${priceTone(p.quote)}`}>{fmtUnit(kind, p.brk)}</span>
              {p.multiBreak && <span className="text-[9px] text-gr"> @{fmtQty(p.brk.qty)}</span>}
              <span className="text-[9px] text-gr"> · {p.vendor?.name || 'vendor pending'} · {docLabel(p.quote)} · {fmtDate(p.quote.doc_date) || 'undated'}</span>
              {['expired', 'closed'].includes(p.quote.status) && <span className="text-[9px] text-gr"> · {p.quote.status}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── item drill-down: one line per price point (SKUs with none get one line) ──
function ItemDrill({ item, maps, lineId, setLineId, onClose }) {
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
    { key: 'price', label: 'Price / order qty', sortable: false, render: (l) => stack(l, (b) => <span className={`font-semibold ${priceTone(l.quote)}`}>{fmtMoney(b.price_per_order_qty)}</span>) },
    {
      key: 'unit', label: ingredient ? 'Price / lb' : 'Price / 1,000', sortable: false,
      render: (l) => stack(l, (b) => {
        const v = fmtUnit(item.kind, b);
        return v ? <span className={`font-semibold ${priceTone(l.quote)}`}>{v}</span> : null;
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
        renderRowDetail={(l) => l.id === lineId && <LineDetail line={l} maps={maps} onClose={() => setLineId(null)} />}
      />
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
