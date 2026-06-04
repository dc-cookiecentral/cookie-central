import { useState } from 'react';
import { useRawMaterials } from '../hooks/useRawMaterials';
import { createRawMaterialOrders } from '../hooks/useRawMaterialOrders';

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) =>
  n == null ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Open a print-ready PO in a new window (Save as PDF from the print dialog).
// No PDF lib is bundled, so this is the lightest reliable "PDF export".
function exportOrderPdf(group) {
  const today = new Date().toLocaleDateString();
  const rows = group.items
    .map(
      (it) => `<tr>
        <td>${esc(it.name)} <span class="code">${esc(it.code || '')}</span></td>
        <td class="r">${Number(it.quantity).toLocaleString()} ${esc(it.unit || '')}</td>
        <td class="r">${it.cost_per_unit != null ? money(it.cost_per_unit) : '—'}</td>
        <td class="r">${it.cost_per_unit != null ? money(it.quantity * it.cost_per_unit) : '—'}</td>
      </tr>`
    )
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>PO — ${esc(group.distributor || '—')}${group.brand ? ' / ' + esc(group.brand) : ''}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2D2235;margin:32px;}
      h1{font-size:20px;margin:0 0 2px;} .sub{color:#5C526A;font-size:12px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}
      th,td{padding:7px 8px;border-bottom:1px solid #E8E0F0;text-align:left;}
      th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#9990A8;}
      td.r,th.r{text-align:right;} .code{color:#9990A8;font-size:9px;}
      tfoot td{font-weight:700;border-top:2px solid #C2185B;border-bottom:none;}
      .brand{color:#C2185B;font-weight:800;}
    </style></head><body>
    <h1>Purchase Order — <span class="brand">${esc(group.distributor || '—')}</span></h1>
    <div class="sub">
      ${group.brand ? 'Brand: ' + esc(group.brand) + ' · ' : ''}Ordered ${esc(today)}
      ${group.maxLead ? ' · Expected in ~' + group.maxLead + ' days' : ''} · Cookie Central
    </div>
    <table>
      <thead><tr><th>Ingredient</th><th class="r">Qty</th><th class="r">Cost / unit</th><th class="r">Line total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3" class="r">Order total</td><td class="r">${money(group.total)}</td></tr></tfoot>
    </table>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// Raw-ingredient reorder (BUILD_PLAN 5.3-5.5). Preview/manual mode: Marc picks
// a distributor/brand and enters an order qty per ingredient, then confirms to
// create pending orders. Velocity-based suggested qty is stubbed until the
// Assemblers production report gives us real consumption rates.
export default function ReorderView({ onOrdersCreated }) {
  const { materials, loading, error, refresh } = useRawMaterials();
  const [draft, setDraft] = useState({}); // id -> { supplierId, qty }
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const setRow = (id, patch) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const supplierFor = (m, supplierId) =>
    (m.raw_material_suppliers ?? []).find((s) => s.id === supplierId) ||
    (m.raw_material_suppliers ?? [])[0] ||
    null;

  const pending = materials
    .map((m) => {
      const row = draft[m.id] || {};
      const qty = Number(row.qty) || 0;
      if (qty <= 0) return null;
      const sup = supplierFor(m, row.supplierId);
      return {
        raw_material_id: m.id,
        name: m.name,
        code: m.code,
        unit: m.unit,
        supplier_id: sup?.id ?? null,
        distributor: sup?.distributor ?? null,
        brand: sup?.brand ?? null,
        cost_per_unit: sup?.cost_per_unit ?? null,
        lead_time_days: sup?.lead_time_days ?? m.default_lead_days ?? null,
        quantity: qty,
      };
    })
    .filter(Boolean);

  const confirm = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Group the confirmed line items by distributor + brand → one formal PO
      // per combo (shared order_group_id).
      const byCombo = new Map();
      for (const item of pending) {
        const key = `${item.distributor ?? '—'}||${item.brand ?? '—'}`;
        if (!byCombo.has(key)) {
          byCombo.set(key, {
            groupId: crypto.randomUUID(),
            distributor: item.distributor,
            brand: item.brand,
            items: [],
          });
        }
        byCombo.get(key).items.push(item);
      }
      const groups = [...byCombo.values()].map((g) => ({
        ...g,
        itemCount: g.items.length,
        total: g.items.reduce((s, it) => s + it.quantity * (it.cost_per_unit ?? 0), 0),
        maxLead: g.items.reduce((m, it) => Math.max(m, it.lead_time_days ?? 0), 0),
      }));

      const rows = groups.flatMap((g) =>
        g.items.map((it) => ({ ...it, order_group_id: g.groupId }))
      );
      await createRawMaterialOrders(rows);
      setResult({ groups });
      setDraft({});
      onOrdersCreated?.();
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-sm text-gr py-8 text-center">Loading ingredients…</div>;
  if (error) return <div className="text-sm text-red-600 py-4">{error}</div>;

  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-pink-100 to-violet-100 px-4 py-2">
        <div className="text-[10px] font-bold text-pk">Preview / manual order mode</div>
        <div className="text-[9px] text-md">
          Pick distributor + brand and set a quantity. Suggested qty populates once the
          Assemblers production report provides consumption rates.
        </div>
      </div>

      {materials.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gr">
          No raw-material ingredients yet — upload an Assemblers inventory report first.
        </div>
      ) : (
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-pc">
              <th className={TH}>Ingredient</th>
              <th className={TH}>Distributor / Brand</th>
              <th className={THR}>On-hand</th>
              <th className={THR}>Lead</th>
              <th className={THR}>MOQ</th>
              <th className={THR}>Sugg</th>
              <th className={THR + ' text-pk'}>Order Qty</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const suppliers = m.raw_material_suppliers ?? [];
              const row = draft[m.id] || {};
              const sup = supplierFor(m, row.supplierId);
              const lead = sup?.lead_time_days ?? m.default_lead_days;
              return (
                <tr key={m.id} className="border-b border-bg">
                  <td className="px-3 py-2 font-semibold">
                    {m.name}
                    <div className="text-[8px] text-gr font-mono">{m.code}</div>
                  </td>
                  <td className="px-3 py-2">
                    {suppliers.length ? (
                      <select
                        value={sup?.id ?? ''}
                        onChange={(e) => setRow(m.id, { supplierId: e.target.value })}
                        className="w-full max-w-[180px] border border-lt rounded px-1 py-1 text-[10px]"
                      >
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.distributor} — {s.brand}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gr text-[9px]">no suppliers</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {(m.quantity ?? 0).toLocaleString()}
                    <span className="text-[8px] text-gr ml-0.5">{m.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gr">{lead != null ? `${lead}d` : '--'}</td>
                  <td className="px-3 py-2 text-right text-gr">
                    {sup?.moq ? sup.moq.toLocaleString() : '--'}
                  </td>
                  <td className="px-3 py-2 text-right text-gr">--</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      value={row.qty ?? ''}
                      onChange={(e) => setRow(m.id, { qty: e.target.value })}
                      placeholder="--"
                      className="w-[70px] border border-lt rounded px-1.5 py-1 text-[10px] text-right"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-t border-lt">
        <div className="text-[10px] text-gr">
          {pending.length > 0
            ? `${pending.length} ingredient(s) ready to order`
            : 'Enter quantities to build an order'}
        </div>
        <div className="flex items-center gap-3">
          {submitError && <span className="text-[11px] text-red-600">{submitError}</span>}
          <button
            onClick={confirm}
            disabled={pending.length === 0 || submitting}
            className="text-xs font-semibold bg-pk text-white rounded-lg px-3 py-1.5 hover:bg-pm disabled:opacity-40"
          >
            {submitting ? 'Creating…' : 'Confirm order'}
          </button>
        </div>
      </div>

      {/* Generated-orders summary: one formal PO per distributor/brand, with a
          per-order PDF export. */}
      {result?.groups?.length > 0 && (
        <div className="px-4 pb-4 border-t border-lt pt-3">
          <div className="text-[11px] font-bold text-green-700 mb-2">
            {result.groups.length} order{result.groups.length === 1 ? '' : 's'} generated
          </div>
          <div className="space-y-1.5">
            {result.groups.map((g) => (
              <div
                key={g.groupId}
                className="flex items-center justify-between bg-bg border border-lt rounded-lg px-3 py-2"
              >
                <div className="text-[11px]">
                  <span className="font-bold text-dk">{g.distributor || '—'}</span>
                  {g.brand && <span className="text-gr"> · {g.brand}</span>}
                  <span className="text-md">
                    {' '}
                    ({g.itemCount} item{g.itemCount === 1 ? '' : 's'}, {money(g.total)} total)
                  </span>
                </div>
                <button
                  onClick={() => exportOrderPdf(g)}
                  className="text-[10px] font-semibold text-pk border border-pk rounded px-2 py-1 hover:bg-pink-50"
                >
                  Export PDF
                </button>
              </div>
            ))}
          </div>
          <button onClick={refresh} className="mt-2 text-[10px] text-pk underline">
            Refresh ingredient list
          </button>
        </div>
      )}
    </div>
  );
}
