// Cookulator resolvers + derivations — ported from prototype/cookulator_prototype.html.
// Pure functions: every resolver takes an explicit `maps` object (built by
// buildMaps) so there are no module globals. Column names follow the DB spine
// (products.code / .dough_oz, eaches.product_code), not the prototype's arrays.
//
// THE ONE RULE: storage + master-case net weight are DERIVED here (and in the
// price_list view), never stored. These helpers are the app-side computation.

export function buildMaps(data) {
  const d = data || {};
  return {
    cookieByCode: new Map((d.products || []).map((c) => [c.code, c])),
    eachBySku: new Map((d.eaches || []).map((e) => [e.each_sku, e])),
    innerBySku: new Map((d.inners || []).map((i) => [i.inner_sku, i])),
    wipByName: new Map((d.wipDoughs || []).map((w) => [w.name, w])),
  };
}

// Mixed / "Stuffed Cookie" both display as "Stuffed"; Shot stays Shot.
export const dispType = (t) => (t === 'Mixed' || t === 'Stuffed Cookie' ? 'Stuffed' : t || '');

// ── Form / Tier inherit from the cookie's production dough (WIP), matching the
// prototype; fall back to the stored product columns if the dough is absent.
export const wipOfCookie = (c, maps) => (c && c.wip_dough ? maps.wipByName.get(c.wip_dough) : null);
export function cookieForm(c, maps) {
  const w = wipOfCookie(c, maps);
  return w ? dispType(w.type) : c?.form || '';
}
export function cookieTier(c, maps) {
  const w = wipOfCookie(c, maps);
  return w ? w.subtype : c?.tier || '';
}

// ── Storage derives from prep: Raw -> Frozen, else Ambient.
export const prepToStorage = (prep) => (!prep ? '' : String(prep).toLowerCase() === 'raw' ? 'Frozen' : 'Ambient');
export const cookieStorage = (c) => (c ? prepToStorage(c.prep) : '');

// ── Composition resolvers (master_case -> inner? -> each? -> cookie).
export const cookieOfEach = (e, maps) => (e && e.product_code ? maps.cookieByCode.get(e.product_code) : null);
export const eachOfCase = (mc, maps) => (mc.composed_of === 'eaches' ? maps.eachBySku.get(mc.unit_ref) || null : null);
export const innerOfCase = (mc, maps) => (mc.composed_of === 'inners' ? maps.innerBySku.get(mc.unit_ref) || null : null);
export function cookieOfCase(mc, maps) {
  if (mc.composed_of === 'cookies') return maps.cookieByCode.get(mc.unit_ref) || null;
  if (mc.composed_of === 'eaches') {
    const e = maps.eachBySku.get(mc.unit_ref);
    return e ? cookieOfEach(e, maps) : null;
  }
  if (mc.composed_of === 'inners') {
    const i = maps.innerBySku.get(mc.unit_ref);
    const e = i ? maps.eachBySku.get(i.each_sku) : null;
    return e ? cookieOfEach(e, maps) : null;
  }
  return null;
}
export function caseStorage(mc, maps) {
  if (mc.storage_override) return mc.storage_override;
  const c = cookieOfCase(mc, maps);
  return c ? prepToStorage(c.prep) : '';
}
export function caseBrand(mc, maps) {
  if (mc.composed_of === 'cookies') return 'Dirty Cookie';
  if (mc.composed_of === 'eaches') return maps.eachBySku.get(mc.unit_ref)?.brand || '';
  if (mc.composed_of === 'inners') {
    const i = maps.innerBySku.get(mc.unit_ref);
    const e = i ? maps.eachBySku.get(i.each_sku) : null;
    return e?.brand || '';
  }
  return '';
}

// ── Net weight: rolls down to cookie dough_oz. Returns oz (null if incomplete).
export function eachNetOz(e, maps) {
  const c = cookieOfEach(e, maps);
  if (!c) return null;
  const oz = parseFloat(c.dough_oz);
  const n = parseFloat(e.cookies_per_each);
  return isNaN(oz) || isNaN(n) ? null : oz * n;
}
export function caseNetOz(mc, maps) {
  const q = parseFloat(mc.unit_qty);
  if (isNaN(q)) return null;
  if (mc.composed_of === 'cookies') {
    const c = maps.cookieByCode.get(mc.unit_ref);
    const oz = c ? parseFloat(c.dough_oz) : NaN;
    return isNaN(oz) ? null : oz * q;
  }
  if (mc.composed_of === 'eaches') {
    const e = maps.eachBySku.get(mc.unit_ref);
    const en = e ? eachNetOz(e, maps) : null;
    return en == null ? null : en * q;
  }
  if (mc.composed_of === 'inners') {
    const i = maps.innerBySku.get(mc.unit_ref);
    const e = i ? maps.eachBySku.get(i.each_sku) : null;
    const en = e ? eachNetOz(e, maps) : null;
    const per = i ? parseFloat(i.eaches_per_inner) : NaN;
    return en == null || isNaN(per) ? null : en * per * q;
  }
  return null;
}
export const ozToLb = (oz) => (oz == null ? null : oz / 16);

// cases-per-pallet: stored value, else Ti x Hi.
export function casesPerPallet(mc) {
  if (mc.cases_per_pallet != null && mc.cases_per_pallet !== '') return Number(mc.cases_per_pallet);
  const ti = parseFloat(mc.ti);
  const hi = parseFloat(mc.hi);
  return isNaN(ti) || isNaN(hi) ? null : ti * hi;
}
