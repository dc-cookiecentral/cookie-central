// ShipStation Custom Store helpers (ADR-028, SHIPSTATION_INTEGRATION.md).
//
// The app speaks ShipStation's Custom Store XML: a GET `action=export` emits an
// <Orders> document; a POST `action=shipnotify` carries a <ShipNotice> we parse
// to write tracking back. Both are Basic-Auth protected (creds in Vault). This
// module is pure string/date/XML plumbing — no DB, no network — so the handler
// stays thin and this stays unit-testable.

// ── Basic Auth ──────────────────────────────────────────────────────────────
// ShipStation sends `Authorization: Basic base64(user:pass)`. Compare against
// the Vault creds; any mismatch (or missing header) → the caller returns 401.
export function checkBasicAuth(req: Request, user: string, pass: string): boolean {
  const header = req.headers.get('authorization') ?? '';
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  let decoded: string;
  try {
    decoded = atob(m[1].trim());
  } catch {
    return false;
  }
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  return decoded.slice(0, idx) === user && decoded.slice(idx + 1) === pass;
}

// ── XML output ──────────────────────────────────────────────────────────────
// Free text (names, notes, item descriptions) is CDATA-wrapped; the nested
// `]]>` split defends against a stray sequence inside the content. Codes and
// numbers use entity escaping.
export const cdata = (s: unknown) =>
  `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

export const xmlEscape = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── Dates ───────────────────────────────────────────────────────────────────
// ShipStation dates are UTC `MM/dd/yyyy HH:mm`.
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// Parse a ShipStation `MM/dd/yyyy[ HH:mm[:ss]]` bound (UTC) → ISO, or null.
export function parseSSDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/);
  if (!m) return null;
  let hh = +(m[4] ?? 0);
  const mer = m[7]?.toUpperCase();
  if (mer === 'PM' && hh < 12) hh += 12;
  if (mer === 'AM' && hh === 12) hh = 0;
  const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], hh, +(m[5] ?? 0), +(m[6] ?? 0)));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Field mapping ───────────────────────────────────────────────────────────
// Export the app's own status verbatim; ShipStation's Marketplace status mapping
// (checklist §1) routes it: submitted/processing -> Awaiting Shipment (the
// co-man's work queue), shipped/delivered -> Shipped. Samples are free, so there
// is no "paid" concept -- the app status IS the routing token. Defaults to
// 'submitted' if unset.
export function ssStatus(status: string | null | undefined): string {
  return status ?? 'submitted';
}

// rush → CustomField1. An internal urgency flag, not a service: the export no
// longer sends <ShippingMethod> at all (the XSD marks it minOccurs="0"), so
// ShipStation owns service selection entirely. CF1 is grid-visible and
// rule-matchable, which is what makes it usable as a notification trigger.
export function rushFlag(rush: boolean | null | undefined): string {
  return rush ? 'rush' : '';
}

// Third-party billing rides InternalNotes ONLY — see internalNotes() below.
// It deliberately does not consume a CustomField: the co-man reads the notes when
// buying the label, and the 100-char CustomFields buy nothing extra for a value
// no automation rule acts on. CustomField3 stays free.
//
// Returns '' unless all three details are present, since a partial set looks
// configured but cannot actually be billed.
export function thirdPartyBilling(s: Shipment): string {
  if (!s.third_party_billing) return '';
  const carrier = (s.tp_carrier ?? '').trim();
  const account = (s.tp_account ?? '').trim();
  const zip = (s.tp_postal_code ?? '').trim();
  if (!carrier || !account || !zip) return '';
  return `BILL THIRD PARTY: ${carrier} acct ${account} (zip ${zip})`;
}

// State must be 2 letters, zip 5 or 5-4; ShipStation silently rejects malformed
// values, so the export validates and skips+logs a bad row instead.
export const validState = (s: string | null | undefined) => !!s && /^[A-Za-z]{2}$/.test(s.trim());
export const validZip = (z: string | null | undefined) => !!z && /^\d{5}(-\d{4})?$/.test(z.trim());

// Notes + deliver-by + handling snapshot + custom-line specs, all into the
// 1000-char InternalNotes (never the 100-char CustomFields).
//
// Collateral is deliberately NOT here: it is emitted as real <Item> lines by
// buildOrderXml, so repeating it as prose would print it twice on a packing
// slip whose template binds a field-replacement token to InternalNotes
// (SHIPSTATION_SETUP_CHECKLIST §6). Custom specs stay — they annotate a line
// item rather than replacing it, and the manual-review rule reads them.
export function internalNotes(s: Shipment): string {
  const parts: string[] = [];
  if (s.temp) parts.push(`Handling: ${s.temp}${s.temp_override ? ' (override)' : ''}`);
  if (s.required_by) parts.push(`Deliver by: ${s.required_by}`);
  const tp = thirdPartyBilling(s);
  if (tp) parts.push(tp);
  if (s.notes) parts.push(`Notes: ${s.notes}`);
  for (const i of s.sample_shipment_items ?? []) {
    if (i.custom) parts.push(`Custom: ${i.custom_spec ?? ''}${i.project_no ? ` (proj ${i.project_no})` : ''}`.trim());
  }
  return parts.join(' | ').slice(0, 1000);
}

// ── Order XML ───────────────────────────────────────────────────────────────

// Synthetic SKUs for the two kinds of line that aren't catalog products.
// They are deliberately STABLE rather than per-order: ShipStation auto-creates
// a product record for every unknown SKU it imports, so `CUSTOM-<project_no>`
// or a hashed spec would silently fill the co-man's catalog with one-off junk.
// One row per collateral type, one row for all custom work, is the tradeoff —
// the per-order detail lives in <Name>, which is what prints on the pick list.
const CUSTOM_SKU = 'CUSTOM';
const collateralSku = (name: string) =>
  `COLLATERAL-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

function itemXml(sku: string, name: string, qty: number): string {
  return (
    `      <Item>\n` +
    `        <SKU>${xmlEscape(sku)}</SKU>\n` +
    `        <Name>${cdata(name)}</Name>\n` +
    `        <Quantity>${qty}</Quantity>\n` +
    `        <UnitPrice>0.00</UnitPrice>\n` +
    `      </Item>`
  );
}

// One <Order>. Assumes the caller has already validated ship-to State/zip.
// <Items> carries everything the co-man physically puts in the box: catalog
// products, custom-made lines, and collateral — each as a real line item so it
// appears on the order page and the pick list, not just as notes prose.
// Country is not exported (US-only; store default). Samples are unpriced.
export function buildOrderXml(s: Shipment): string {
  const addr = s.address ?? {};
  const all = s.sample_shipment_items ?? [];
  const hasCustom = all.some((i) => i.custom);

  const lines: string[] = [];

  // 1. Catalog products — the only lines whose SKU ShipStation can match to a
  //    product record (and therefore to the cold-chain tag).
  for (const i of all.filter((i) => i.product_code)) {
    lines.push(itemXml(i.product_code as string, i.description ?? (i.product_code as string), Number(i.qty) || 1));
  }

  // 2. Custom-made lines. No catalog SKU exists by definition; the spec and
  //    project number are what the co-man needs to read.
  for (const i of all.filter((i) => i.custom)) {
    const spec = i.custom_spec ?? 'Custom item';
    lines.push(itemXml(CUSTOM_SKU, i.project_no ? `${spec} (proj ${i.project_no})` : spec, Number(i.qty) || 1));
  }

  // 3. Collateral — a checklist, so quantity is always 1 per type.
  for (const c of s.collateral ?? []) {
    lines.push(itemXml(collateralSku(c), c, 1));
  }

  const itemsXml = lines.join('\n');

  return (
    `  <Order>\n` +
    `    <OrderID>${xmlEscape(s.id)}</OrderID>\n` +
    `    <OrderNumber>${xmlEscape(s.shipment_no)}</OrderNumber>\n` +
    `    <OrderDate>${fmtDate(s.created_at)}</OrderDate>\n` +
    `    <OrderStatus>${ssStatus(s.status)}</OrderStatus>\n` +
    `    <LastModified>${fmtDate(s.updated_at)}</LastModified>\n` +
    // <ShippingMethod> is deliberately omitted (XSD minOccurs="0"): the app no
    // longer expresses a service preference — ShipStation owns that choice.
    `    <OrderTotal>0.00</OrderTotal>\n` +   // required by ShipStation; samples are free
    `    <InternalNotes>${cdata(internalNotes(s))}</InternalNotes>\n` +
    `    <CustomField1>${xmlEscape(rushFlag(s.rush))}</CustomField1>\n` +
    `    <CustomField2>${hasCustom ? 'custom-request' : ''}</CustomField2>\n` +
    `    <CustomField3></CustomField3>\n` +   // free/unused — billing rides InternalNotes
    `    <Customer>\n` +
    `      <CustomerCode>${xmlEscape(s.salesperson?.email ?? '')}</CustomerCode>\n` +
    `      <BillTo>\n` +
    `        <Name>${cdata(s.account ?? '')}</Name>\n` +
    `      </BillTo>\n` +
    `      <ShipTo>\n` +
    `        <Name>${cdata(addr.contact_name ?? '')}</Name>\n` +
    `        <Company>${cdata(addr.company ?? '')}</Company>\n` +
    `        <Address1>${cdata(addr.street ?? '')}</Address1>\n` +
    `        <City>${cdata(addr.city ?? '')}</City>\n` +
    `        <State>${xmlEscape((addr.state ?? '').trim().toUpperCase())}</State>\n` +
    `        <PostalCode>${xmlEscape((addr.zip ?? '').trim())}</PostalCode>\n` +
    `        <Country>US</Country>\n` +   // required by ShipStation's ShipTo schema (US-only)
    `      </ShipTo>\n` +
    `    </Customer>\n` +
    `    <Items>\n${itemsXml}\n    </Items>\n` +
    `  </Order>`
  );
}

export function ordersDocument(orders: string[], pages: number): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<Orders pages="${pages}">\n${orders.join('\n')}\n</Orders>`
  );
}

// ── ShipNotice parsing ──────────────────────────────────────────────────────
// Extract a single tag's text from ShipStation's ShipNotice body, tolerating
// attributes and CDATA. The ShipNotice schema is small and fixed, so a targeted
// tag read is sufficient (and avoids a heavyweight XML-parser dependency).
export function tagValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return null;
  let v = m[1].trim();
  const cd = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cd) v = cd[1];
  v = v.trim();
  return v || null;
}

// <ShippingCost> is xs:decimal, but it arrives as free text and may be blank,
// currency-prefixed or comma-grouped depending on locale. Return null rather than
// NaN on anything unparseable — a bad cost must not poison the whole writeback,
// which also carries the tracking number.
export function parseAmount(s: string | null | undefined): number | null {
  if (s == null) return null;
  const cleaned = String(s).replace(/[^0-9.-]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ── Types (loose; the service-role query returns joined rows) ────────────────
export interface ShipmentItem {
  product_code: string | null;
  custom: boolean;
  custom_spec: string | null;
  project_no: string | null;
  qty: number;
  description: string | null;
}
export interface Address {
  contact_name?: string | null;
  company?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}
export interface Shipment {
  id: string;
  shipment_no: string;
  status: string | null;
  account: string | null;
  rush: boolean | null;
  third_party_billing: boolean | null;
  tp_carrier: string | null;
  tp_account: string | null;
  tp_postal_code: string | null;
  temp: string | null;
  temp_override: string | null;
  required_by: string | null;
  collateral: string[] | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  salesperson?: { email: string | null; full_name: string | null } | null;
  address?: Address | null;
  sample_shipment_items?: ShipmentItem[] | null;
}
