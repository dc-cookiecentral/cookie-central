// Unit tests for the ShipStation Custom Store pure helpers.
//
//   deno test supabase/functions/_shared/shipstation_test.ts
//
// Everything in `shipstation.ts` is pure string/date/XML plumbing — no DB, no
// network — so it is all directly testable. That matters more than usual here:
// the Custom Store is a **pull** model, so a malformed export produces no error
// anywhere. A wrong serviceCode, a missing required element, or a truncated
// notes field just silently mis-ships. These tests are the only place that
// catches it before ShipStation does.

import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  buildOrderXml,
  rushFlag,
  thirdPartyBilling,
  cdata,
  checkBasicAuth,
  fmtDate,
  internalNotes,
  customerNotes,
  ordersDocument,
  parseAmount,
  parseSSDate,
  NO_EXPORT_STATUSES,
  ssStatus,
  syncedStatus,
  tagValue,
  validState,
  validZip,
  type Shipment,
} from './shipstation.ts';

// ── Fixtures ────────────────────────────────────────────────────────────────
const basicAuth = (u: string, p: string) =>
  new Request('https://example.test/', { headers: { authorization: `Basic ${btoa(`${u}:${p}`)}` } });

function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    shipment_no: 'SMP-1044',
    status: 'submitted',
    account: 'Kroger Co.',
    rush: false,
    third_party_billing: false,
    tp_carrier: null,
    tp_account: null,
    tp_postal_code: null,
    temp: 'Ambient',
    temp_override: null,
    required_by: '2026-08-01',
    collateral: ['Line sheet'],
    notes: 'First meeting, keep it classic.',
    created_at: '2026-07-27T10:05:00Z',
    updated_at: '2026-07-27T11:30:00Z',
    salesperson: { email: 'alex@cortinafoods.com', full_name: 'Alex Morgan' },
    address: {
      contact_name: 'Dana Buyer',
      company: 'Kroger Co.',
      street: '1014 Vine St',
      city: 'Cincinnati',
      state: 'OH',
      zip: '45202',
    },
    sample_shipment_items: [
      { product_code: 'CC-2OZ-BAK-G', custom: false, custom_spec: null, project_no: null, qty: 12, description: 'Gourmet Chocolate Chip — 2oz, Baked' },
    ],
    ...overrides,
  };
}
const el = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? null;

// ── checkBasicAuth ──────────────────────────────────────────────────────────
Deno.test('checkBasicAuth: accepts matching credentials', () => {
  assert(checkBasicAuth(basicAuth('ss-user', 'ss-pass'), 'ss-user', 'ss-pass'));
});
Deno.test('checkBasicAuth: rejects a wrong username', () => {
  assertFalse(checkBasicAuth(basicAuth('nope', 'ss-pass'), 'ss-user', 'ss-pass'));
});
Deno.test('checkBasicAuth: rejects a wrong password', () => {
  assertFalse(checkBasicAuth(basicAuth('ss-user', 'nope'), 'ss-user', 'ss-pass'));
});
Deno.test('checkBasicAuth: rejects a missing Authorization header', () => {
  assertFalse(checkBasicAuth(new Request('https://example.test/'), 'ss-user', 'ss-pass'));
});
Deno.test('checkBasicAuth: rejects a non-Basic scheme', () => {
  const req = new Request('https://example.test/', { headers: { authorization: 'Bearer abc123' } });
  assertFalse(checkBasicAuth(req, 'ss-user', 'ss-pass'));
});
Deno.test('checkBasicAuth: rejects undecodable base64 without throwing', () => {
  const req = new Request('https://example.test/', { headers: { authorization: 'Basic !!!not-base64!!!' } });
  assertFalse(checkBasicAuth(req, 'ss-user', 'ss-pass'));
});
Deno.test('checkBasicAuth: rejects a payload with no colon separator', () => {
  const req = new Request('https://example.test/', { headers: { authorization: `Basic ${btoa('useronly')}` } });
  assertFalse(checkBasicAuth(req, 'ss-user', 'ss-pass'));
});
Deno.test('checkBasicAuth: matches the scheme case-insensitively', () => {
  const req = new Request('https://example.test/', { headers: { authorization: `basic ${btoa('ss-user:ss-pass')}` } });
  assert(checkBasicAuth(req, 'ss-user', 'ss-pass'));
});
Deno.test('checkBasicAuth: splits on the FIRST colon so passwords may contain colons', () => {
  assert(checkBasicAuth(basicAuth('ss-user', 'p:a:s:s'), 'ss-user', 'p:a:s:s'));
});
Deno.test('checkBasicAuth: rejects an empty credential pair', () => {
  assertFalse(checkBasicAuth(basicAuth('', ''), 'ss-user', 'ss-pass'));
});

// ── cdata / xmlEscape ───────────────────────────────────────────────────────
Deno.test('cdata: wraps plain text', () => {
  assertEquals(cdata('Dirty Cookie'), '<![CDATA[Dirty Cookie]]>');
});
Deno.test('cdata: renders null and undefined as an empty section', () => {
  assertEquals(cdata(null), '<![CDATA[]]>');
  assertEquals(cdata(undefined), '<![CDATA[]]>');
});
Deno.test('cdata: splits an embedded ]]> so the section cannot be closed early', () => {
  const raw = 'danger ]]> here';
  const out = cdata(raw);
  assertEquals(out, '<![CDATA[danger ]]]]><![CDATA[> here]]>');
  // The escape works by splitting into two sections. The invariant that matters:
  // no section *body* contains ]]>, and the bodies still concatenate to the input.
  const bodies = [...out.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1]);
  assertEquals(bodies.length, 2);
  for (const b of bodies) assertFalse(b.includes(']]>'));
  assertEquals(bodies.join(''), raw);
});
Deno.test('cdata: stringifies non-string input', () => {
  assertEquals(cdata(42), '<![CDATA[42]]>');
});

// ── fmtDate ─────────────────────────────────────────────────────────────────
Deno.test('fmtDate: formats ISO as UTC MM/dd/yyyy HH:mm', () => {
  assertEquals(fmtDate('2026-07-27T11:30:00Z'), '07/27/2026 11:30');
});
Deno.test('fmtDate: zero-pads month, day, hour and minute', () => {
  assertEquals(fmtDate('2026-01-05T04:07:00Z'), '01/05/2026 04:07');
});
Deno.test('fmtDate: converts a non-UTC offset to UTC', () => {
  assertEquals(fmtDate('2026-07-27T00:30:00-05:00'), '07/27/2026 05:30');
});
Deno.test('fmtDate: returns empty string for null, undefined and empty input', () => {
  assertEquals(fmtDate(null), '');
  assertEquals(fmtDate(undefined), '');
  assertEquals(fmtDate(''), '');
});
Deno.test('fmtDate: returns empty string for an unparseable date', () => {
  assertEquals(fmtDate('not-a-date'), '');
});

// ── parseSSDate ─────────────────────────────────────────────────────────────
Deno.test('parseSSDate: parses a bare MM/dd/yyyy as UTC midnight', () => {
  assertEquals(parseSSDate('07/27/2026'), '2026-07-27T00:00:00.000Z');
});
Deno.test('parseSSDate: parses date + HH:mm', () => {
  assertEquals(parseSSDate('07/27/2026 13:45'), '2026-07-27T13:45:00.000Z');
});
Deno.test('parseSSDate: parses seconds when present', () => {
  assertEquals(parseSSDate('07/27/2026 13:45:30'), '2026-07-27T13:45:30.000Z');
});
Deno.test('parseSSDate: accepts single-digit month and day', () => {
  assertEquals(parseSSDate('7/4/2026'), '2026-07-04T00:00:00.000Z');
});
Deno.test('parseSSDate: converts PM to 24-hour', () => {
  assertEquals(parseSSDate('07/27/2026 1:05 PM'), '2026-07-27T13:05:00.000Z');
});
Deno.test('parseSSDate: leaves AM hours unchanged', () => {
  assertEquals(parseSSDate('07/27/2026 9:15 AM'), '2026-07-27T09:15:00.000Z');
});
Deno.test('parseSSDate: maps 12 AM to hour 0', () => {
  assertEquals(parseSSDate('07/27/2026 12:30 AM'), '2026-07-27T00:30:00.000Z');
});
Deno.test('parseSSDate: keeps 12 PM at hour 12', () => {
  assertEquals(parseSSDate('07/27/2026 12:30 PM'), '2026-07-27T12:30:00.000Z');
});
Deno.test('parseSSDate: accepts lowercase meridiem', () => {
  assertEquals(parseSSDate('07/27/2026 1:05 pm'), '2026-07-27T13:05:00.000Z');
});
Deno.test('parseSSDate: accepts a T separator', () => {
  assertEquals(parseSSDate('07/27/2026T08:00'), '2026-07-27T08:00:00.000Z');
});
Deno.test('parseSSDate: returns null for null, undefined and empty input', () => {
  assertEquals(parseSSDate(null), null);
  assertEquals(parseSSDate(undefined), null);
  assertEquals(parseSSDate(''), null);
});
Deno.test('parseSSDate: returns null for a non-matching format', () => {
  assertEquals(parseSSDate('2026-07-27'), null);
});

// ── parseAmount (ShippingCost) ──────────────────────────────────────────────
Deno.test('parseAmount: parses a plain decimal', () => {
  assertEquals(parseAmount('4.95'), 4.95);
});
Deno.test('parseAmount: strips currency symbols and thousands separators', () => {
  assertEquals(parseAmount('$4.95'), 4.95);
  assertEquals(parseAmount('1,234.56'), 1234.56);
});
Deno.test('parseAmount: handles zero and negative values', () => {
  assertEquals(parseAmount('0.00'), 0);
  assertEquals(parseAmount('-3.50'), -3.5);
});
Deno.test('parseAmount: returns null for blank, null and undefined', () => {
  assertEquals(parseAmount(''), null);
  assertEquals(parseAmount('   '), null);
  assertEquals(parseAmount(null), null);
  assertEquals(parseAmount(undefined), null);
});
Deno.test('parseAmount: returns null rather than NaN for junk', () => {
  // A bad cost must not poison a writeback that also carries the tracking number.
  assertEquals(parseAmount('N/A'), null);
  assertEquals(parseAmount('$'), null);
});

// ── ssStatus ────────────────────────────────────────────────────────────────
Deno.test('ssStatus: submitted reaches the work queue (paid), NEVER unpaid', () => {
  // unpaid parks it in Awaiting Payment, where it has no shipment record and
  // the Deliver By sweep cannot reach it. See ADR-039.
  assertEquals(ssStatus('submitted'), 'paid');
});
Deno.test('ssStatus: processing also maps to the work queue', () => {
  assertEquals(ssStatus('processing'), 'paid');
});
Deno.test('ssStatus: shipped and delivered both map to shipped', () => {
  assertEquals(ssStatus('shipped'), 'shipped');
  // The store's mapping has no delivered bucket; unmapped would fall back to
  // Awaiting Shipment and resurrect a finished order into the queue.
  assertEquals(ssStatus('delivered'), 'shipped');
});
Deno.test('ssStatus: cancelled and on_hold map to themselves, NOT to the queue', () => {
  // Regression. These were absent from the map, so both hit the `paid` fallback
  // and an exported cancelled order came back as Awaiting Shipment. The tokens
  // match the store's configured mapping (ShipStation's defaults).
  assertEquals(ssStatus('cancelled'), 'cancelled');
  assertEquals(ssStatus('on_hold'), 'on_hold');
});
Deno.test('NO_EXPORT_STATUSES: exception statuses are never handed back', () => {
  // ShipStation owns fulfilment state; the export must not push it back.
  assertEquals(NO_EXPORT_STATUSES.includes('cancelled'), true);
  assertEquals(NO_EXPORT_STATUSES.includes('on_hold'), true);
  assertEquals(NO_EXPORT_STATUSES.includes('submitted'), false);
  assertEquals(NO_EXPORT_STATUSES.includes('shipped'), false);
});
Deno.test('ssStatus: defaults null and undefined to the work queue', () => {
  assertEquals(ssStatus(null), 'paid');
  assertEquals(ssStatus(undefined), 'paid');
});
Deno.test('ssStatus: an unknown status falls back to the work queue, never limbo', () => {
  assertEquals(ssStatus('something-new'), 'paid');
});

// ── syncedStatus ────────────────────────────────────────────────────────────
Deno.test('syncedStatus: a ShipStation cancel wins over an open order', () => {
  assertEquals(syncedStatus('cancelled', 'submitted'), 'cancelled');
  assertEquals(syncedStatus('cancelled', 'processing'), 'cancelled');
});
Deno.test('syncedStatus: a hold wins over an open order', () => {
  assertEquals(syncedStatus('on_hold', 'submitted'), 'on_hold');
});
Deno.test('syncedStatus: no write when the app already agrees', () => {
  assertEquals(syncedStatus('cancelled', 'cancelled'), null);
  assertEquals(syncedStatus('on_hold', 'on_hold'), null);
  assertEquals(syncedStatus('pending', 'submitted'), null);
});
Deno.test('syncedStatus: NEVER overrides shipped or delivered', () => {
  // shipnotify owns these; a shipped order can still sit in an active bucket.
  for (const b of ['cancelled', 'on_hold', 'pending', 'label_purchased']) {
    assertEquals(syncedStatus(b, 'shipped'), null);
    assertEquals(syncedStatus(b, 'delivered'), null);
  }
});
Deno.test('syncedStatus: releasing a hold returns the order to the queue', () => {
  assertEquals(syncedStatus('pending', 'on_hold'), 'submitted');
  assertEquals(syncedStatus('label_purchased', 'on_hold'), 'submitted');
});
Deno.test('syncedStatus: un-cancelling in ShipStation restores the order', () => {
  assertEquals(syncedStatus('pending', 'cancelled'), 'submitted');
});
Deno.test('syncedStatus: an order absent from ShipStation is left alone', () => {
  // Not yet imported, or purged. Guessing here would fight the export.
  assertEquals(syncedStatus(null, 'submitted'), null);
  assertEquals(syncedStatus(null, 'cancelled'), null);
});

// ── rushFlag (CustomField1) ─────────────────────────────────────────────────
Deno.test('rushFlag: true becomes the literal RUSH token used in InternalNotes', () => {
  assertEquals(rushFlag(true), 'RUSH');
});
Deno.test('rushFlag: false, null and undefined produce an empty field', () => {
  assertEquals(rushFlag(false), '');
  assertEquals(rushFlag(null), '');
  assertEquals(rushFlag(undefined), '');
});

// ── thirdPartyBilling (CustomField3) ────────────────────────────────────────
const TP = { third_party_billing: true, tp_carrier: 'FedEx', tp_account: '123456789', tp_postal_code: '90210' };

Deno.test('thirdPartyBilling: formats carrier, account and zip for the label buyer', () => {
  assertEquals(thirdPartyBilling(shipment(TP)), 'BILL THIRD PARTY: FedEx acct 123456789 (zip 90210)');
});
Deno.test('thirdPartyBilling: empty when the flag is off, even with details present', () => {
  assertEquals(thirdPartyBilling(shipment({ ...TP, third_party_billing: false })), '');
});
Deno.test('thirdPartyBilling: empty when any single detail is missing', () => {
  // A partial set looks configured but cannot be billed — worse than nothing.
  for (const missing of ['tp_carrier', 'tp_account', 'tp_postal_code']) {
    assertEquals(thirdPartyBilling(shipment({ ...TP, [missing]: null })), '', `missing ${missing}`);
    assertEquals(thirdPartyBilling(shipment({ ...TP, [missing]: '   ' })), '', `blank ${missing}`);
  }
});
Deno.test('thirdPartyBilling: trims surrounding whitespace on the details', () => {
  assertEquals(thirdPartyBilling(shipment({ ...TP, tp_account: '  123456789  ' })), 'BILL THIRD PARTY: FedEx acct 123456789 (zip 90210)');
});

// ── validState / validZip ───────────────────────────────────────────────────
Deno.test('validState: accepts a 2-letter code in either case', () => {
  assert(validState('OH'));
  assert(validState('oh'));
});
Deno.test('validState: tolerates surrounding whitespace', () => {
  assert(validState(' OH '));
});
Deno.test('validState: rejects full names, 1-letter codes and digits', () => {
  assertFalse(validState('Ohio'));
  assertFalse(validState('O'));
  assertFalse(validState('12'));
});
Deno.test('validState: rejects empty, null and undefined', () => {
  assertFalse(validState(''));
  assertFalse(validState(null));
  assertFalse(validState(undefined));
});
Deno.test('validZip: accepts 5-digit and ZIP+4', () => {
  assert(validZip('45202'));
  assert(validZip('45202-1234'));
});
Deno.test('validZip: tolerates surrounding whitespace', () => {
  assert(validZip(' 45202 '));
});
Deno.test('validZip: rejects short, long and non-numeric zips', () => {
  assertFalse(validZip('4520'));
  assertFalse(validZip('452021'));
  assertFalse(validZip('ABCDE'));
});
Deno.test('validZip: rejects empty, null and undefined', () => {
  assertFalse(validZip(''));
  assertFalse(validZip(null));
  assertFalse(validZip(undefined));
});

// ── internalNotes ───────────────────────────────────────────────────────────
Deno.test('internalNotes: carries only the site note', () => {
  assertEquals(internalNotes(shipment()), 'Notes: First meeting, keep it classic.');
});
Deno.test('internalNotes: omits collateral entirely — it ships as <Item> lines', () => {
  const out = internalNotes(shipment({ collateral: ['Line sheet', 'Warming instructions'] }));
  assertFalse(out.includes('Collateral'));
  assertFalse(out.includes('Line sheet'));
});
Deno.test('internalNotes: omits handling/temp — the cold-chain tag drives packing', () => {
  const out = internalNotes(shipment({ temp: 'Cold', temp_override: 'Cold' }));
  assertFalse(out.includes('Handling'));
});
Deno.test('internalNotes: omits deliver-by — it has a native ShipStation field', () => {
  assertFalse(internalNotes(shipment({ required_by: '2026-08-21' })).includes('Deliver by'));
});
Deno.test('internalNotes: omits custom specs — they are <Item> Names now', () => {
  const out = internalNotes(shipment({
    sample_shipment_items: [
      { product_code: null, custom: true, custom_spec: 'Heart-shaped cookie', project_no: 'P-77', qty: 1, description: null },
    ],
  }));
  assertFalse(out.includes('Custom:'));
  assertFalse(out.includes('Heart-shaped'));
});
Deno.test('internalNotes: leads with RUSH so a contains-rule and a human both catch it', () => {
  const out = internalNotes(shipment({ rush: true }));
  assertEquals(out.startsWith('RUSH'), true);
  assertStringIncludes(out, 'Notes: First meeting, keep it classic.');
});
Deno.test('internalNotes: no RUSH token when the order is not rushed', () => {
  assertFalse(internalNotes(shipment({ rush: false })).includes('RUSH'));
});
Deno.test('internalNotes: third-party billing is NOT here — it is CustomerNotes now', () => {
  assertFalse(internalNotes(shipment(TP)).includes('BILL THIRD PARTY'));
});
Deno.test('customerNotes: carries third-party billing verbatim', () => {
  assertEquals(customerNotes(shipment(TP)), 'BILL THIRD PARTY: FedEx acct 123456789 (zip 90210)');
});
Deno.test('customerNotes: empty when billing is not third-party', () => {
  assertEquals(customerNotes(shipment()), '');
});
Deno.test('internalNotes: ignores non-custom lines', () => {
  assertFalse(internalNotes(shipment()).includes('Custom:'));
});
Deno.test('internalNotes: returns empty string when every part is absent', () => {
  assertEquals(
    internalNotes(shipment({ collateral: [], temp: null, required_by: null, notes: null, sample_shipment_items: [] })),
    '',
  );
});
Deno.test('internalNotes: truncates at the 1000-char ShipStation limit', () => {
  const out = internalNotes(shipment({ notes: 'x'.repeat(2000) }));
  assertEquals(out.length, 1000);
});

// ── buildOrderXml ───────────────────────────────────────────────────────────
Deno.test('buildOrderXml: omits ShippingMethod entirely — ShipStation owns service choice', () => {
  assertFalse(buildOrderXml(shipment()).includes('<ShippingMethod'));
});
Deno.test('buildOrderXml: includes Country US, required by the XSD (StringExactly2)', () => {
  assertEquals(el(buildOrderXml(shipment()), 'Country'), 'US');
});
Deno.test('buildOrderXml: includes OrderTotal 0.00, required by the XSD; samples are free', () => {
  assertEquals(el(buildOrderXml(shipment()), 'OrderTotal'), '0.00');
});
Deno.test('buildOrderXml: keys the order on shipment_no via OrderNumber', () => {
  assertEquals(el(buildOrderXml(shipment()), 'OrderNumber'), 'SMP-1044');
});
Deno.test('buildOrderXml: OrderStatus is the mapped token, not the app status', () => {
  assertEquals(el(buildOrderXml(shipment({ status: 'processing' })), 'OrderStatus'), 'paid');
  assertEquals(el(buildOrderXml(shipment({ status: 'submitted' })), 'OrderStatus'), 'paid');
});
Deno.test('buildOrderXml: uses created_at for OrderDate and updated_at for LastModified', () => {
  const xml = buildOrderXml(shipment());
  assertEquals(el(xml, 'OrderDate'), '07/27/2026 10:05');
  assertEquals(el(xml, 'LastModified'), '07/27/2026 11:30');
});
Deno.test('buildOrderXml: CustomField1 is the salesperson', () => {
  assertEquals(el(buildOrderXml(shipment()), 'CustomField1'), 'Alex Morgan');
});
Deno.test('buildOrderXml: CustomField1 falls back to the email when there is no name', () => {
  const s = shipment({ salesperson: { email: 'alex@cortinafoods.com', full_name: null } });
  assertEquals(el(buildOrderXml(s), 'CustomField1'), 'alex@cortinafoods.com');
});
Deno.test('buildOrderXml: CustomField2 is the account', () => {
  assertEquals(el(buildOrderXml(shipment({ account: 'Kroger' })), 'CustomField2'), 'Kroger');
});
Deno.test('buildOrderXml: CustomField3 carries a manual temp override, and only that', () => {
  assertEquals(el(buildOrderXml(shipment({ temp: 'Cold', temp_override: 'Cold' })), 'CustomField3'), 'Cold');
  // Derived-Cold with no human override must stay blank, so a rule can match non-blank.
  assertEquals(el(buildOrderXml(shipment({ temp: 'Cold', temp_override: null })), 'CustomField3'), '');
});
Deno.test('buildOrderXml: CustomFields truncate at 100 chars rather than silently overflowing', () => {
  const long = 'A'.repeat(150);
  assertEquals((el(buildOrderXml(shipment({ account: long })), 'CustomField2') ?? '').length, 100);
});
Deno.test('buildOrderXml: CustomField3 stays free even with third-party billing set', () => {
  assertEquals(el(buildOrderXml(shipment()), 'CustomField3'), '');
  assertEquals(el(buildOrderXml(shipment(TP)), 'CustomField3'), '');
});
Deno.test('buildOrderXml: third-party billing goes to CustomerNotes (Notes from Buyer)', () => {
  const xml = buildOrderXml(shipment(TP));
  assertStringIncludes(el(xml, 'CustomerNotes') ?? '', 'BILL THIRD PARTY: FedEx acct 123456789 (zip 90210)');
  assertFalse((el(xml, 'InternalNotes') ?? '').includes('BILL THIRD PARTY'));
});
Deno.test('buildOrderXml: CustomerNotes is present but empty for normal billing', () => {
  assertStringIncludes(buildOrderXml(shipment()), '<CustomerNotes>');
  assertEquals(el(buildOrderXml(shipment()), 'CustomerNotes'), '<![CDATA[]]>');
});
Deno.test('buildOrderXml: emits real product lines as Items with UnitPrice 0.00', () => {
  const xml = buildOrderXml(shipment());
  assertEquals(el(xml, 'SKU'), 'CC-2OZ-BAK-G');
  assertEquals(el(xml, 'Quantity'), '12');
  assertEquals(el(xml, 'UnitPrice'), '0.00');
});
Deno.test('buildOrderXml: emits custom lines as Items with an EMPTY sku', () => {
  const xml = buildOrderXml(shipment({
    collateral: [],
    sample_shipment_items: [
      { product_code: null, custom: true, custom_spec: 'Bespoke', project_no: 'P-9', qty: 3, description: null },
    ],
  }));
  // The element is present but empty — ShipStation's own guide shows this shape
  // for non-product lines; omitting it risks a whole-batch rejection.
  assertStringIncludes(xml, '<SKU></SKU>');
  assertFalse(xml.includes('<SKU>CUSTOM</SKU>'));
  assertStringIncludes(xml, 'Bespoke (proj P-9)');
  assertStringIncludes(xml, '<Quantity>3</Quantity>');
  // The spec now lives ONLY on the line item — no longer echoed into notes.
  assertFalse((el(xml, 'InternalNotes') ?? '').includes('Bespoke'));
});
Deno.test('buildOrderXml: a custom line with no spec still gets a usable Name', () => {
  const xml = buildOrderXml(shipment({
    collateral: [],
    sample_shipment_items: [
      { product_code: null, custom: true, custom_spec: null, project_no: null, qty: 1, description: null },
    ],
  }));
  assertStringIncludes(xml, 'Custom item');
});
Deno.test('buildOrderXml: emits each collateral piece as a SKU-less Item, quantity 1', () => {
  const xml = buildOrderXml(shipment({
    collateral: ['Line sheet', 'Warming instructions'],
    sample_shipment_items: [],
  }));
  assertStringIncludes(xml, '<Name><![CDATA[Line sheet]]></Name>');
  assertStringIncludes(xml, '<Name><![CDATA[Warming instructions]]></Name>');
  assertEquals((xml.match(/<SKU><\/SKU>/g) ?? []).length, 2);
  assertFalse(xml.includes('<Quantity>0</Quantity>'));
});
Deno.test('buildOrderXml: no synthetic SKU survives anywhere in the document', () => {
  const xml = buildOrderXml(shipment({
    collateral: ["Rep's one-pager / v2"],
    sample_shipment_items: [
      { product_code: 'CC-2OZ-BAK-G', custom: false, custom_spec: null, project_no: null, qty: 1, description: 'Gourmet CC' },
      { product_code: null, custom: true, custom_spec: 'Bespoke', project_no: null, qty: 1, description: null },
    ],
  }));
  assertFalse(xml.includes('COLLATERAL-'));
  assertFalse(xml.includes('<SKU>CUSTOM</SKU>'));
  // The one real catalog SKU still travels — that is what the cold-chain tag needs.
  assertStringIncludes(xml, '<SKU>CC-2OZ-BAK-G</SKU>');
});
Deno.test('buildOrderXml: products, custom lines and collateral all coexist as Items', () => {
  const xml = buildOrderXml(shipment({
    collateral: ['Line sheet'],
    sample_shipment_items: [
      { product_code: 'CC-2OZ-BAK-G', custom: false, custom_spec: null, project_no: null, qty: 2, description: 'Gourmet CC' },
      { product_code: null, custom: true, custom_spec: 'Bespoke', project_no: null, qty: 1, description: null },
    ],
  }));
  assertEquals((xml.match(/<Item>/g) ?? []).length, 3);
});
Deno.test('buildOrderXml: defaults a missing quantity to 1', () => {
  const xml = buildOrderXml(shipment({
    sample_shipment_items: [
      { product_code: 'CC-2OZ-BAK-G', custom: false, custom_spec: null, project_no: null, qty: 0, description: 'Gourmet CC' },
    ],
  }));
  assertEquals(el(xml, 'Quantity'), '1');
});
Deno.test('buildOrderXml: uses the salesperson email as CustomerCode', () => {
  assertEquals(el(buildOrderXml(shipment()), 'CustomerCode'), 'alex@cortinafoods.com');
});
Deno.test('buildOrderXml: BillTo Email carries the salesperson, not the ordering user', () => {
  // One Cortina login enters orders for many reps, so ShipStation must notify
  // the rep selected on the order — not whoever happened to be signed in.
  assertEquals(el(buildOrderXml(shipment()), 'Email'), 'alex@cortinafoods.com');
});
Deno.test('buildOrderXml: sales_rep wins over the superseded salesperson relation', () => {
  // Reps are a plain list now, not user accounts. The legacy user_profiles
  // relation survives only for orders created before the switch, so when both
  // are present the rep must win — otherwise a corrected rep would be ignored.
  const xml = buildOrderXml(shipment({
    sales_rep: { email: 'rep@cortinafoods.com', full_name: 'Dana Rep' },
  }));
  assertEquals(el(xml, 'Email'), 'rep@cortinafoods.com');
  assertEquals(el(xml, 'CustomerCode'), 'rep@cortinafoods.com');
  assertEquals(el(xml, 'CustomField1'), 'Dana Rep');
});
Deno.test('buildOrderXml: BillTo Email is emitted empty when the salesperson is unknown', () => {
  // Emitted, never omitted — a missing required element rejects the whole batch
  // silently (ADR-029), and the XSD is only documented for Order and ShipTo.
  const xml = buildOrderXml(shipment({ salesperson: null }));
  assertEquals(xml.includes('<Email></Email>'), true);
});
Deno.test('buildOrderXml: uppercases and trims the ship-to state', () => {
  const xml = buildOrderXml(shipment({ address: { ...shipment().address, state: ' oh ' } }));
  assertEquals(el(xml, 'State'), 'OH');
});
Deno.test('buildOrderXml: escapes XML-significant characters in coded fields', () => {
  assertStringIncludes(buildOrderXml(shipment({ shipment_no: 'SMP-1&2' })), '<OrderNumber>SMP-1&amp;2</OrderNumber>');
});
Deno.test('buildOrderXml: CDATA-wraps free text such as the account name', () => {
  assertStringIncludes(buildOrderXml(shipment({ account: 'Ben & Jerry <Co>' })), '<![CDATA[Ben & Jerry <Co>]]>');
});
Deno.test('buildOrderXml: tolerates missing address and items', () => {
  const xml = buildOrderXml(shipment({ address: null, sample_shipment_items: [] }));
  assertStringIncludes(xml, '<Country>US</Country>');
  assertEquals(el(xml, 'State'), '');
});

// ── ordersDocument ──────────────────────────────────────────────────────────
Deno.test('ordersDocument: emits the XML declaration and pages attribute', () => {
  const doc = ordersDocument([buildOrderXml(shipment())], 3);
  assertStringIncludes(doc, '<?xml version="1.0" encoding="utf-8"?>');
  assertStringIncludes(doc, '<Orders pages="3">');
  assertStringIncludes(doc, '</Orders>');
});
Deno.test('ordersDocument: includes every order it is given', () => {
  const doc = ordersDocument(
    [buildOrderXml(shipment()), buildOrderXml(shipment({ shipment_no: 'SMP-1045' }))],
    1,
  );
  assertStringIncludes(doc, 'SMP-1044');
  assertStringIncludes(doc, 'SMP-1045');
});

// ── tagValue (ShipNotice parsing) ───────────────────────────────────────────
Deno.test('tagValue: reads a plain element', () => {
  assertEquals(tagValue('<ShipNotice><OrderNumber>SMP-1044</OrderNumber></ShipNotice>', 'OrderNumber'), 'SMP-1044');
});
Deno.test('tagValue: unwraps CDATA', () => {
  assertEquals(tagValue('<Carrier><![CDATA[UPS]]></Carrier>', 'Carrier'), 'UPS');
});
Deno.test('tagValue: tolerates attributes on the tag', () => {
  assertEquals(tagValue('<TrackingNumber type="ups">1Z999</TrackingNumber>', 'TrackingNumber'), '1Z999');
});
Deno.test('tagValue: trims surrounding whitespace and newlines', () => {
  assertEquals(tagValue('<Service>\n  ups_ground\n</Service>', 'Service'), 'ups_ground');
});
Deno.test('tagValue: matches the tag name case-insensitively', () => {
  assertEquals(tagValue('<ordernumber>SMP-1044</ordernumber>', 'OrderNumber'), 'SMP-1044');
});
Deno.test('tagValue: returns null for a missing tag', () => {
  assertEquals(tagValue('<ShipNotice></ShipNotice>', 'OrderNumber'), null);
});
Deno.test('tagValue: returns null for an empty element rather than empty string', () => {
  assertEquals(tagValue('<OrderNumber></OrderNumber>', 'OrderNumber'), null);
});
