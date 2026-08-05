// Sample Central helpers — ported from prototype/sample_central_prototype.html.
// Catalog rows are `products WHERE sample_eligible = true`; fields follow the DB
// spine (description, outer_cookie, dough_oz), not the prototype's CATALOG array.

export const flavorFamily = (p) =>
  p.stuffing ? `${p.outer_cookie} / ${p.stuffing}` : p.outer_cookie || p.description;

// Ship temp derives from the cart: any Raw (frozen) item => Cold chain, else Ambient.
export function derivedTemp(cart, productByCode) {
  const anyRaw = cart.some((it) => {
    const p = productByCode.get(it.code);
    return p && String(p.prep || '').toLowerCase() === 'raw';
  });
  return anyRaw ? 'Cold' : 'Ambient';
}
export const effectiveTemp = (override, cart, productByCode) =>
  override || derivedTemp(cart, productByCode);

// Prep -> Tier -> Size grouping for the catalog. Returns
// [{ prep, storage, count, tiers: [{ tier, items:[...] }] }].
const PREP_ORDER = ['Baked', 'Raw'];
const TIER_ORDER = ['Gourmet', 'Classic'];
export function groupCatalog(products) {
  return PREP_ORDER.filter((prep) => products.some((p) => (p.prep || 'Baked') === prep)).map((prep) => {
    const prepItems = products.filter((p) => (p.prep || 'Baked') === prep);
    const tiers = TIER_ORDER.filter((t) => prepItems.some((p) => p.tier === t)).map((tier) => ({
      tier,
      items: prepItems
        .filter((p) => p.tier === tier)
        .sort((a, b) => (parseFloat(a.dough_oz) - parseFloat(b.dough_oz)) || flavorFamily(a).localeCompare(flavorFamily(b))),
    }));
    return {
      prep,
      storage: String(prep).toLowerCase() === 'raw' ? '❄️ ships frozen' : '🌡 ships ambient',
      count: prepItems.length,
      tiers,
    };
  });
}

// ── Test mode ───────────────────────────────────────────────────────────────
// Set VITE_SAMPLE_TEST_MODE=true to prefix generated shipment numbers with
// TEST-, so orders made during internal stress testing are self-labelling in the
// co-man's ShipStation queue (SMP-TEST-1044) and trivially greppable when you
// purge before launch: `delete from sample_shipments where shipment_no like
// 'SMP-TEST-%'`.
//
// Unlike VITE_AUTH_BYPASS this is deliberately NOT gated on import.meta.env.DEV
// — the whole point is to apply to the deployed build the team is testing.
// It is a build-time flag, so flipping it means redeploying. Clear it (or set it
// to `false`) before launch; the checklist has this as a go-live step.
//
// Parsed leniently on purpose. This value is typed into a hosting dashboard by a
// human, and a strict `=== 'true'` silently ignored `TRUE`, a stray quote or a
// trailing space — with no error anywhere, since a false flag compiles the banner
// out of the bundle entirely. Accepts true/1/yes in any case, trimmed.
const TEST_MODE_FLAG = String(import.meta.env.VITE_SAMPLE_TEST_MODE ?? '')
  .trim().toLowerCase().replace(/^["']|["']$/g, '');
export const TEST_MODE = ['true', '1', 'yes', 'on'].includes(TEST_MODE_FLAG);
export const SHIPMENT_PREFIX = TEST_MODE ? 'SMP-TEST-' : 'SMP-';

// Next shipment number from existing shipment_no values (seed starts at 1044).
// The optional TEST- segment is stripped when reading the high-water mark, so
// test and real orders share ONE counter. That is intentional: shipment_no is
// UNIQUE, and separate counters would collide the moment test mode flips off
// with test rows still in the table.
export function nextShipmentNo(existing) {
  const max = existing.reduce((m, s) => {
    const n = parseInt(String(s.shipment_no || '').replace(/^SMP-(TEST-)?/, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 1043);
  return `${SHIPMENT_PREFIX}${max + 1}`;
}

// The linear pipeline. Order matters — the shipment card renders it as a
// progress stepper and indexes into it.
export const SHIP_STATUSES = ['submitted', 'processing', 'shipped', 'delivered'];

// Off-pipeline states ShipStation can put an order into. They are NOT stages:
// an order does not progress *through* on_hold, it sits outside the flow until
// released. Keep them out of SHIP_STATUSES or the stepper renders them as
// steps and `indexOf` on a cancelled order returns -1, greying every dot.
// Written by the shipstation-deliverby sweep; reversible.
export const EXCEPTION_STATUSES = ['on_hold', 'cancelled'];
// Collateral the co-man can actually pack. Each maps to a synthetic SKU so it
// exports as a real <Item> line and prints on the ShipStation packing slip,
// rather than riding InternalNotes as free text. Keep COLLATERAL_SKUS in
// lockstep — an option without a SKU would silently drop out of the export.
export const COLLATERAL_OPTIONS = [
  'Warming instructions',
  'Cookie shot flyer',
];
export const COLLATERAL_SKUS = {
  'Warming instructions': 'COLL-WARMING',
  'Cookie shot flyer': 'COLL-SHOT-FLYER',
};
// Rush — an internal urgency flag, NOT a shipping service. It exports as
// CustomField1 and is the trigger for the team notification. Deliberately
// distinct from how fast the parcel travels: a 2-day order can be urgent and an
// overnight one routine, and the co-man picks the actual service in ShipStation.
// (Box spec and the shipping-speed tiers were retired by migration
// 20260728130000 — box choice lives in ShipStation now.)
export const RUSH_NOTICE = 'Flags the order as urgent and emails the team.';

// Third-party shipping billing. ShipStation's Custom Store XML has no billing
// fields, so these ride CustomField3 + InternalNotes as text — the co-man keys
// them in at label purchase. Nothing bills automatically; see ADR-032.
export const TP_CARRIERS = ['FedEx', 'UPS', 'USPS', 'DHL'];
export const TP_NOTICE =
  'The co-man enters these when buying the label — ShipStation cannot bill the account automatically.';
// All three are needed for the co-man to actually bill the account, so an
// incomplete set is worse than none: it looks configured but cannot be used.
export const tpComplete = (h) =>
  !h.third_party_billing || !!(h.tp_carrier && String(h.tp_account || '').trim() && String(h.tp_postal_code || '').trim());

