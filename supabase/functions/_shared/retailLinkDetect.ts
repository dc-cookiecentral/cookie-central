// Which Retail Link upload card a workbook belongs to, read from what is INSIDE
// it — the same sheets and headers each parser keys on — never its filename.
// Bentonville Merchants' weekly email carries the files for cards 1–4, and
// their names and number may change (Caroline, Nov 5 2026).
//
//   retail_link_supply_plan — a sheet named "Data" with a `wm_item_nbr` header
//   retail_link             — an "All Item Detail" sheet (Dirty Cookie WK##)
//   retail_link_otif        — a "Host PO Nbr" header cell (1- and 3-week alike)
//
// Returns null for anything else. `XLSX` is the SheetJS module, `wb` a workbook.
export type RetailLinkType = 'retail_link_supply_plan' | 'retail_link' | 'retail_link_otif';

const cellIs = (rows: unknown[][], want: string) =>
  rows.some((r) => (r || []).some((c) => String(c ?? '').trim().toLowerCase() === want));

// deno-lint-ignore no-explicit-any
export function detectRetailLink(XLSX: any, wb: any): RetailLinkType | null {
  const names: string[] = wb.SheetNames;
  const rowsOf = (n: string) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null }) as unknown[][];
  const data = names.find((n) => n.trim().toLowerCase() === 'data');
  if (data && cellIs(rowsOf(data), 'wm_item_nbr')) return 'retail_link_supply_plan';
  if (names.some((n) => n.trim().toLowerCase() === 'all item detail')) return 'retail_link';
  if (names.some((n) => cellIs(rowsOf(n), 'host po nbr'))) return 'retail_link_otif';
  return null;
}
