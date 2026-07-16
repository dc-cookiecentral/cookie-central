// Sample Central helpers — ported from prototype/sample_central_prototype.html.
// Catalog rows are `products WHERE sample_eligible = true`; fields follow the DB
// spine (description, outer_cookie, dough_oz), not the prototype's CATALOG array.

export const familyEmoji = (form) => (form === 'Shot' ? '🥤' : '🍪');

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

// Next SMP-#### number from existing shipment_no values (seed starts at 1044).
export function nextShipmentNo(existing) {
  const max = existing.reduce((m, s) => {
    const n = parseInt(String(s.shipment_no || '').replace(/^SMP-/, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 1043);
  return `SMP-${max + 1}`;
}

export const SHIP_STATUSES = ['submitted', 'processing', 'shipped', 'delivered'];
export const COLLATERAL_OPTIONS = [
  'Warming instructions',
  'Line sheet',
  'Brand story card',
  'Nutrition & allergen sheet',
  'Cookie shot flyer',
  'Reusable tote',
];
export const BOX_OPTIONS = ['Dirty Cookie', 'Custom / Branded'];
