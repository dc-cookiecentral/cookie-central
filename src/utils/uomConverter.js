// Default subcategory conversion factors (WMT Dough).
// Real app: fetch from `subcategories` table per product subcategory.
// All quantities are stored in CASES internally; convert on display.
export const DEFAULT_SUBCATEGORY = {
  name: 'WMT Dough',
  cookiesPerCU: 4,
  cuPerCase: 12,
  cookiesPerCase: 48,
  ti: 9,
  hi: 21,
  casesPerPallet: 189,
};

export const UOM_OPTIONS = ['Cases', 'CU', 'Cookies', 'Pallets'];

export function convertCases(cases, uom, sc = DEFAULT_SUBCATEGORY) {
  if (cases == null || isNaN(cases)) return cases;
  switch (uom) {
    case 'CU':      return cases * sc.cuPerCase;
    case 'Cookies': return cases * sc.cookiesPerCase;
    case 'Pallets': return cases / sc.casesPerPallet;
    case 'Cases':
    default:        return cases;
  }
}

export function formatCases(cases, uom, sc = DEFAULT_SUBCATEGORY) {
  const v = convertCases(cases, uom, sc);
  if (v == null || isNaN(v)) return '--';
  return uom === 'Pallets' ? v.toFixed(1) : Math.round(v).toLocaleString();
}
