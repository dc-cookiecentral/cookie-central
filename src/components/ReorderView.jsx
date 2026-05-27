import { useState } from 'react';
import { useRawMaterials } from '../hooks/useRawMaterials';
import { createRawMaterialOrders } from '../hooks/useRawMaterialOrders';

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

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
      const res = await createRawMaterialOrders(pending);
      setResult(res);
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
          {result && (
            <span className="text-[11px] text-green-700 font-semibold">
              Created {result.created} pending order(s)
            </span>
          )}
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

      {result && (
        <div className="px-4 pb-3">
          <button onClick={refresh} className="text-[10px] text-pk underline">
            Refresh list
          </button>
        </div>
      )}
    </div>
  );
}
