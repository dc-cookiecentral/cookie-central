// ⚠️ PostgREST caps a response at 1,000 rows and says NOTHING about it — no
// error, no flag, just a short array. `po_line_items` was already at 1,194 rows
// when the Demand Planner went live, so an unpaged read silently dropped ~16% of
// the order book. By Nov 5 2026 `purchase_orders` (1,502) and `cortina_invoices`
// (1,148) had crossed too. Any read of a whole table goes through here.
//
// `build` must return a fresh query each call, and that query MUST have a
// stable `.order(...)` (a unique column such as `id`): without one Postgres may
// return rows in a different order per page, and the pages overlap and skip.
// Embedded resources (e.g. `po_line_items ( … )`) are not capped; paging the
// parent is enough.
//
// On an error part-way through, returns the rows read so far with the error.
const PAGE = 1000;
export async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { data: out.length ? out : null, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}
