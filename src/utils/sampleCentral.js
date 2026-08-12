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
// ⚠️ REQUIRED, not cosmetic. The counter is derived from the table, so emptying
// the table resets it — as happened Aug 6 2026 when all 18 orders were purged.
// Without a floor the next order would be SMP-1044 again, reissuing 1044–1061.
//
// Those numbers are still occupied. The orders were **cancelled** in ShipStation,
// not deleted — its UI offers no delete — so the records remain, and ShipStation
// keys Custom Store orders on OrderNumber with a re-import UPDATING the matching
// order (ADR-039). A reissued number would therefore land on the old cancelled
// order and export as `paid`, un-cancelling it into the co-man's queue with the
// new order's data grafted onto the old record. That is the ADR-041 resurrection
// arriving through a different door, and no code elsewhere would prevent it.
//
// Raise this floor whenever the table is purged again — the burnt range only
// ever grows, because cancelling never frees a number.
//
// Burnt so far: 1044–1061 (Aug 6 purge) and 1100–1101 (Aug 11 purge, ahead of
// the end-to-end delivery test). Voiding the LABELS does not free the numbers
// either — a voided label leaves the order record behind, and it is the
// OrderNumber that collides.
//
// ⚠️ BUILD-TIME. This is baked into the bundle, exactly like
// VITE_SAMPLE_TEST_MODE, so raising it here changes nothing until the site is
// REDEPLOYED. Purging the table before that redeploy lands leaves the live
// bundle issuing from 1100 — straight back onto the burnt numbers.
const SHIPMENT_NO_FLOOR = 1200;

export function nextShipmentNo(existing) {
  const max = existing.reduce((m, s) => {
    const n = parseInt(String(s.shipment_no || '').replace(/^SMP-(TEST-)?/, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, SHIPMENT_NO_FLOOR - 1);
  return `${SHIPMENT_PREFIX}${max + 1}`;
}

// The linear pipeline. Order matters — the shipment card renders it as a
// progress stepper and indexes into it.
//
// `processing` is deliberately NOT here. Nothing has ever written it — shipnotify
// jumps submitted → shipped on label purchase, and the sweep only ever writes
// cancelled/on_hold/submitted. It cannot be honestly sourced either: V2 has a
// `processing` bucket, but that is the LABEL lifecycle (a brief state while a
// label request is processed), not "the co-man is picking this order". Rendering
// it as a stage meant a permanent dead dot AND a lie — the stepper fills every
// dot below the current index, so a shipped order showed `processing` in green
// as though something had observed it.
export const SHIP_STATUSES = ['submitted', 'shipped', 'delivered'];

// Statuses still awaiting fulfilment. `processing` is accepted here because the
// DB CHECK still permits it and ssStatus() treats it as the same queue as
// submitted — so a row holding it stays sane rather than falling off the stepper.
export const OPEN_STATUSES = ['submitted', 'processing'];

// Everything that has physically left. Grouped because the sales team's question
// is "has it gone out", not "which of the two post-label states is it in" —
// especially while `delivered` has no source and every shipped order sits in the
// first of them.
export const SHIPPED_STATUSES = ['shipped', 'delivered'];

// Default window for both sections. Sample orders are a steady trickle, so the
// recent handful is the working set; anything older is looked up by number.
export const RECENT_DAYS = 10;

/** Stepper position. `processing` shares submitted's slot; -1 means off-pipeline. */
export const pipelineIndex = (status) =>
  status === 'processing' ? 0 : SHIP_STATUSES.indexOf(status);

// Deadline pressure for an order still awaiting fulfilment. This is the one
// genuinely informative axis the site has today: nearly every open order carries
// a required_by, and "will it arrive in time" is the question salespeople
// actually ask — unlike "which stage is it in", where there are only two answers.
//
// Parsed as a LOCAL date. `new Date('2026-08-20')` is UTC midnight, which renders
// as the 19th anywhere west of Greenwich — an off-by-one on the exact field the
// whole feature is about.
export function deliverByState(requiredBy, status) {
  if (!requiredBy || !OPEN_STATUSES.includes(status)) return null;
  const [y, m, d] = String(requiredBy).split('-').map(Number);
  if (!y || !m || !d) return null;
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  return {
    days,
    overdue: days < 0,
    dueSoon: days >= 0 && days <= 2,
    label: days < 0
      ? `${-days}d overdue`
      : days === 0 ? 'due today'
      : days === 1 ? 'due tomorrow'
      : `${days}d left`,
  };
}

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

// ── Order guardrails ────────────────────────────────────────────────────────
// A submitted order is UNRECALLABLE from inside this app. Status is owned by
// ShipStation (ADR-032), there is no sandbox, and the Cortina ordering account
// has no ShipStation login — so a mistake here can only be fixed by someone
// else, in another system. These two constants exist to catch the two mistakes
// that cost the most: a mistyped quantity, and a fat-fingered "submit".

// Per-line ceiling. Not a business rule — a typo guard. A sample line is
// normally 6–24 cookies; 999 is far above anything real and far below the
// 100,000 that one stray keypress in a bare text input produces.
export const MAX_LINE_QTY = 999;

// Above this many cookies in one shipment, the confirm step says so out loud.
// It does NOT block: big samples are legitimate (a full-line presentation to a
// national account), they are just worth a second look, because this is real
// COGS and real cold-chain freight leaving the building.
export const LARGE_ORDER_COOKIES = 100;

/** Today as yyyy-mm-dd in the BROWSER's timezone — matches what <input type="date"> means. */
export function todayISO() {
  const d = new Date();
  // toISOString() would be UTC and hands anyone west of Greenwich a `min` of
  // "tomorrow" for part of their day, silently rejecting a valid same-day rush.
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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

// ── Carrier tracking links ──────────────────────────────────────────────────
// `carrier` is written by shipnotify from the ShipNotice's <Carrier> element,
// which sends a DISPLAY NAME — "UPS", not the carrier code "ups" (verified
// against SMP-TEST-1060, whose service also came through decorated as
// "UPS® Ground"). A lookup keyed on ShipStation's API carrier codes would miss
// every time, and it would miss *silently*: the number would just keep
// rendering as plain text and look like the feature was never built.
//
// So match on a normalised substring rather than an exact key. That also
// absorbs the variants the same carrier arrives under — USPS labels bought
// through a reseller report as "Stamps.com" or "Endicia", not "USPS".
const TRACKING_URLS = [
  [/usps|stamps|endicia/, (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`],
  [/fedex/,               (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`],
  [/dhl/,                 (n) => `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`],
  [/ups/,                 (n) => `https://www.ups.com/track?loc=en_US&requester=ST&tracknum=${n}`],
];

// Only UPS and USPS are connected on the account today, but a third-party-billed
// label rides the customer's own account and can be FedEx or DHL (TP_CARRIERS
// offers both), so those are worth carrying rather than discovering later.
//
// When the carrier is missing or unrecognised, fall back to the number's own
// shape — but only for the two shapes that are unambiguous. A wrong guess sends
// a salesperson to a carrier site that reports "not found", which reads as a
// lost parcel; plain text is the safer failure.
export function trackingUrl(carrier, trackingNumber) {
  const n = String(trackingNumber ?? '').trim();
  if (!n) return null;

  const key = String(carrier ?? '').toLowerCase();
  const hit = TRACKING_URLS.find(([re]) => re.test(key));
  if (hit) return hit[1](encodeURIComponent(n));

  if (/^1Z[0-9A-Z]+$/i.test(n)) return TRACKING_URLS[3][1](encodeURIComponent(n));  // UPS
  if (/^\d{20,22}$/.test(n)) return TRACKING_URLS[0][1](encodeURIComponent(n));     // USPS
  return null;
}

