import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty } from '../specsheet/pills';

// Shared pieces for the Supplies & Vendors tabs: lookup maps over useSupplies()
// data, formatters, status chips, and the contact popover.

export function buildSupplyMaps(data) {
  const by = (rows, key) => {
    const m = new Map();
    rows.forEach((r) => {
      const k = r[key];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  };
  const vendorsById = new Map(data.vendors.map((v) => [v.id, v]));
  const skusById = new Map(data.skus.map((s) => [s.id, s]));
  const itemsById = new Map(data.items.map((i) => [i.id, i]));
  const skusByItem = by(data.skus, 'item_id');
  const quotesBySku = by(data.quotes, 'sku_id');
  const contactsByVendor = by(data.contacts, 'vendor_id');
  const breaksByQuote = by(data.pricing.filter((p) => p.break_id), 'quote_id');
  breaksByQuote.forEach((rows) => rows.sort((a, b) => Number(a.qty) - Number(b.qty)));

  // Last Order = latest PO/invoice date across the item's SKUs.
  const lastOrderByItem = new Map();
  data.quotes.forEach((q) => {
    if (!['po', 'invoice'].includes(q.doc_type) || !q.doc_date) return;
    const itemId = skusById.get(q.sku_id)?.item_id;
    const cur = lastOrderByItem.get(itemId);
    if (!cur || q.doc_date > cur.doc_date) lastOrderByItem.set(itemId, q);
  });

  const itemsByVendor = new Map();
  data.skus.forEach((s) => {
    if (!s.vendor_id) return;
    const item = itemsById.get(s.item_id);
    if (!item) return;
    if (!itemsByVendor.has(s.vendor_id)) itemsByVendor.set(s.vendor_id, new Map());
    itemsByVendor.get(s.vendor_id).set(item.id, item);
  });

  // One price point per quote, at its best (lowest) break, newest first.
  // PO / invoice = actual purchase price; quote / verbal = offered price.
  const pricePointsByItem = new Map();
  data.quotes.forEach((quote) => {
    const sku = skusById.get(quote.sku_id);
    const item = sku && itemsById.get(sku.item_id);
    if (!item) return;
    const best = (breaksByQuote.get(quote.id) || [])
      .filter((b) => unitPrice(item.kind, b) != null)
      .reduce((m, b) => (m && unitPrice(item.kind, m) <= unitPrice(item.kind, b) ? m : b), null);
    if (!best) return;
    if (!pricePointsByItem.has(item.id)) pricePointsByItem.set(item.id, []);
    pricePointsByItem.get(item.id).push({
      id: quote.id, quote, sku, vendor: vendorsById.get(sku.vendor_id) || null, brk: best,
      unit: unitPrice(item.kind, best), actual: isActual(quote), multiBreak: (breaksByQuote.get(quote.id) || []).length > 1,
    });
  });
  pricePointsByItem.forEach((pts) => pts.sort((a, b) => String(b.quote.doc_date || '').localeCompare(String(a.quote.doc_date || ''))));

  const posById = new Map((data.pos || []).map((p) => [p.id, p]));
  const lineCostByQuote = new Map((data.lineCost || []).map((c) => [c.quote_id, c]));
  const itemCostById = new Map((data.itemCost || []).map((c) => [c.item_id, c]));

  return {
    vendorsById, skusById, itemsById, skusByItem, quotesBySku, contactsByVendor, breaksByQuote, lastOrderByItem, itemsByVendor,
    pricePointsByItem, posById, lineCostByQuote, itemCostById,
  };
}

export const isActual = (q) => ['po', 'invoice'].includes(q.doc_type);

// Headline price for the macro list: the most recent PO/invoice, and the best
// (lowest) quote still in play — not expired/closed, vendor not closed.
// Everything else is history.
export function headlinePrices(points = []) {
  const lastPo = points.find((p) => p.actual) || null;
  const bestQuote = points
    .filter((p) => !p.actual && !['expired', 'closed'].includes(p.quote.status) && p.vendor?.status !== 'closed')
    .reduce((m, p) => (m && m.unit <= p.unit ? m : p), null);
  return { lastPo, bestQuote };
}

// ── formatters ──────────────────────────────────────────────────────────────
const usd = (n, digits = 2) =>
  n == null ? null : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtMoney = (n) => usd(n, 2);
export const fmtPerLb = (n) => (n == null ? null : `${usd(n, 4)}/lb`);
export const fmtPerM = (n) => (n == null ? null : `${usd(n, 2)}/M`);
export const fmtQty = (n) => (n == null ? null : Number(n).toLocaleString('en-US'));

// The unit an item is compared on, straight from v_sku_pricing (never computed
// here): $/lb for ingredients, $/1,000 for packaging (per piece if the SKU
// isn't counted in thousands).
export const unitPrice = (kind, b) =>
  kind === 'ingredient' ? b.price_per_lb : b.price_per_thousand ?? b.price_per_unit;
export const fmtUnit = (kind, b) =>
  kind === 'ingredient' ? fmtPerLb(b.price_per_lb)
    : b.price_per_thousand != null ? fmtPerM(b.price_per_thousand)
      : b.price_per_unit != null ? `${usd(b.price_per_unit, 4)} ea` : null;
// Assumed / actual cost are per item in the item's comparison unit.
export const fmtCost = (kind, v) => (v == null ? null : kind === 'ingredient' ? fmtPerLb(v) : fmtPerM(v));
export const fmtPct = (v) => (v == null ? null : `${v > 0 ? '+' : ''}${(Number(v) * 100).toFixed(1)}%`);
// PO/invoice prices read black, quoted prices grey.
export const priceTone = (q) => (q && isActual(q) ? 'text-dk' : 'text-gr');

// Dates arrive as 'YYYY-MM-DD'; parse as local dates so they don't shift a day.
const parseDate = (d) => {
  const [y, m, day] = String(d).split('-').map(Number);
  return new Date(y, m - 1, day);
};
export const fmtDate = (d) =>
  d ? parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
export const daysSince = (d) => (d ? Math.floor((Date.now() - parseDate(d).getTime()) / 86400000) : null);

// Age badge, same thresholds as the dc-supplies catalogue: green < 60 days,
// amber 60–90, red > 90 or past a stated valid-until date.
export function DocDate({ date, validUntil }) {
  if (!date) return <Empty label="— date not on file" />;
  const days = daysSince(date);
  const lapsed = validUntil && daysSince(validUntil) > 0;
  const tone = lapsed || days > 90 ? 'text-red-600' : days > 60 ? 'text-amber-600' : 'text-emerald-700';
  return (
    <span className="whitespace-nowrap">
      {fmtDate(date)} <span className={`text-[9px] font-semibold ${tone}`}>· {days}d{lapsed ? ' · lapsed' : ''}</span>
    </span>
  );
}

// ── chips ───────────────────────────────────────────────────────────────────
const QUOTE_STATUS = {
  active: ['Active', 'bg-emerald-100 text-emerald-700'],
  on_po: ['On PO', 'bg-sky-100 text-sky-700'],
  preliminary: ['Preliminary', 'bg-amber-100 text-amber-700'],
  expired: ['Expired', 'bg-red-100 text-red-700'],
  closed: ['Closed', 'bg-gray-100 text-gray-500'],
};
export function QuoteStatus({ v }) {
  const [label, cls] = QUOTE_STATUS[v] || [v, 'bg-gray-100 text-gray-500'];
  return v ? <span className={`inline-block px-1.5 py-px rounded text-[9px] font-bold uppercase ${cls}`}>{label}</span> : <Empty />;
}

const DOC_TYPE = { quote: 'Quote', invoice: 'Invoice', po: 'PO', verbal: 'Verbal' };
export const docTypeLabel = (t) => DOC_TYPE[t] || t;
// 'PO · SP028-2026' style label; skips the type when the ref already says it
// ('PO SP026-2026', 'Proforma …' still gets 'Invoice ·').
export const docLabel = (q) => {
  const type = docTypeLabel(q.doc_type);
  if (!q.doc_ref) return type;
  return q.doc_ref.toLowerCase().startsWith(type.toLowerCase()) ? q.doc_ref : `${type} · ${q.doc_ref}`;
};

const VENDOR_STATUS = {
  active: 'bg-emerald-100 text-emerald-700',
  prospect: 'bg-amber-100 text-amber-700',
  closed: 'bg-gray-100 text-gray-500',
};
export function VendorStatus({ v }) {
  return <span className={`inline-block px-1.5 py-px rounded text-[9px] font-bold uppercase ${VENDOR_STATUS[v] || ''}`}>{v}</span>;
}

export function VendorLink({ vendor }) {
  if (!vendor) return <Empty label="— vendor pending" />;
  return (
    <Link to={`/supplies?tab=vendors&vendor=${vendor.id}`} className="font-semibold text-pk hover:underline" onDoubleClick={(e) => e.stopPropagation()}>
      {vendor.name}
    </Link>
  );
}

// ── contact popover (double-click a contact name) ───────────────────────────
export function ContactName({ contact }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const rows = [
    ['Role', contact.role],
    ['Office', contact.phone_office],
    ['Cell', contact.phone_cell],
    ['Email', contact.email && <a href={`mailto:${contact.email}`} className="text-pk hover:underline">{contact.email}</a>],
  ].filter(([, v]) => v);

  return (
    <span ref={ref} className="relative inline-block">
      <span
        title="Double-click for contact details"
        className="underline decoration-dotted decoration-gr underline-offset-2 cursor-pointer"
        onDoubleClick={(e) => {
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          setOpen((v) => !v);
        }}
      >
        {contact.name}
      </span>
      {open && (
        <div className="absolute left-0 top-5 z-30 bg-cd border border-lt rounded-lg shadow-lg p-3 min-w-[230px] text-left font-normal normal-case tracking-normal">
          <div className="text-[11px] font-bold text-dk mb-1">
            {contact.name}
            {contact.is_primary && <span className="ml-1.5 text-[8px] font-bold uppercase text-pk">primary</span>}
          </div>
          {rows.length === 0 ? (
            <div className="text-[10px] text-gr italic">No contact details on file.</div>
          ) : (
            rows.map(([k, v]) => (
              <div key={k} className="flex gap-2 text-[10px] py-px">
                <span className="w-[42px] text-gr uppercase text-[8px] font-bold pt-px">{k}</span>
                <span className="text-dk">{v}</span>
              </div>
            ))
          )}
        </div>
      )}
    </span>
  );
}
