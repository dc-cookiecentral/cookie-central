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
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
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

// box_spec intent → order tag. 'Custom / Branded' → custom-box, else dc-box.
export function boxTag(boxSpec: string | null | undefined): string {
  if (!boxSpec) return '';
  return /custom|brand/i.test(boxSpec) ? 'custom-box' : 'dc-box';
}

// State must be 2 letters, zip 5 or 5-4; ShipStation silently rejects malformed
// values, so the export validates and skips+logs a bad row instead.
export const validState = (s: string | null | undefined) => !!s && /^[A-Za-z]{2}$/.test(s.trim());
export const validZip = (z: string | null | undefined) => !!z && /^\d{5}(-\d{4})?$/.test(z.trim());

// Collateral + notes + required-by + handling snapshot + custom-line specs, all
// into the 1000-char InternalNotes (never the 100-char CustomFields).
export function internalNotes(s: Shipment): string {
  const parts: string[] = [];
  if (s.collateral?.length) parts.push(`Collateral: ${s.collateral.join(', ')}`);
  if (s.temp) parts.push(`Handling: ${s.temp}${s.temp_override ? ' (override)' : ''}`);
  if (s.required_by) parts.push(`Required by: ${s.required_by}`);
  if (s.notes) parts.push(`Notes: ${s.notes}`);
  for (const i of s.sample_shipment_items ?? []) {
    if (i.custom) parts.push(`Custom: ${i.custom_spec ?? ''}${i.project_no ? ` (proj ${i.project_no})` : ''}`.trim());
  }
  return parts.join(' | ').slice(0, 1000);
}

// ── Order XML ───────────────────────────────────────────────────────────────
// One <Order>. Assumes the caller has already validated ship-to State/zip.
// Real product lines only (custom lines have no SKU — they ride InternalNotes
// + CustomField2). Country is not exported (US-only; store default). Samples
// are unpriced (UnitPrice 0.00).
export function buildOrderXml(s: Shipment): string {
  const addr = s.address ?? {};
  const items = (s.sample_shipment_items ?? []).filter((i) => i.product_code);
  const hasCustom = (s.sample_shipment_items ?? []).some((i) => i.custom);
  const itemsXml = items
    .map(
      (i) =>
        `      <Item>\n` +
        `        <SKU>${xmlEscape(i.product_code)}</SKU>\n` +
        `        <Name>${cdata(i.description ?? i.product_code)}</Name>\n` +
        `        <Quantity>${Number(i.qty) || 1}</Quantity>\n` +
        `        <UnitPrice>0.00</UnitPrice>\n` +
        `      </Item>`,
    )
    .join('\n');

  return (
    `  <Order>\n` +
    `    <OrderID>${xmlEscape(s.id)}</OrderID>\n` +
    `    <OrderNumber>${xmlEscape(s.shipment_no)}</OrderNumber>\n` +
    `    <OrderDate>${fmtDate(s.created_at)}</OrderDate>\n` +
    `    <OrderStatus>${ssStatus(s.status)}</OrderStatus>\n` +
    `    <LastModified>${fmtDate(s.updated_at)}</LastModified>\n` +
    `    <ShippingMethod>${xmlEscape(s.requested_service)}</ShippingMethod>\n` +
    `    <CustomField1>${xmlEscape(boxTag(s.box_spec))}</CustomField1>\n` +
    `    <CustomField2>${hasCustom ? 'custom-request' : ''}</CustomField2>\n` +
    `    <CustomField3></CustomField3>\n` +
    `    <InternalNotes>${cdata(internalNotes(s))}</InternalNotes>\n` +
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
  requested_service: string | null;
  box_spec: string | null;
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
