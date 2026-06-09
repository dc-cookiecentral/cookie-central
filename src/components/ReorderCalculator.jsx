import { useMemo, useState } from 'react';
import {
  useScenarios,
  createScenario,
  updateScenarioStatus,
  deleteScenario,
  useScenarioRuns,
  addScenarioRun,
  deleteScenarioRun,
  useBomOverrides,
  saveBomOverride,
  resetBomOverride,
  generateScenarioOrders,
} from '../hooks/useScenarios';
import { useProductionData } from '../hooks/useProductionData';
import { useIngredientInventory } from '../hooks/useIngredientInventory';
import { parseLeadDays } from '../utils/bom';
import { formatDate } from '../utils/dates';

const TH = 'px-2 py-1.5 text-left text-[9px] font-bold text-gr uppercase tracking-wider whitespace-nowrap';
const THR = TH + ' text-right';
const usd = (n, dp = 2) =>
  n == null ? '--' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
const qty = (n, dp = 0) =>
  n == null ? '--' : Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
const todayIso = () => new Date().toISOString().slice(0, 10);
const STATUS = ['draft', 'active', 'completed'];

// Pick the shortest-lead supplier for order generation.
function bestSupplier(suppliers) {
  let best = null;
  let bestLead = Infinity;
  for (const s of suppliers ?? []) {
    const d = parseLeadDays(s.lead_time_text);
    const lead = d == null ? 9999 : d;
    if (lead < bestLead) {
      bestLead = lead;
      best = s;
    }
  }
  return best ?? (suppliers ?? [])[0] ?? null;
}

export default function ReorderCalculator() {
  const { scenarios, loading, refresh } = useScenarios();
  const [selectedId, setSelectedId] = useState(null);

  const onNew = async () => {
    const name = window.prompt('Scenario name?', `Production plan ${todayIso()}`);
    if (name == null) return;
    const id = await createScenario(name);
    await refresh();
    setSelectedId(id);
  };

  const selected = scenarios.find((s) => s.id === selectedId) || null;

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* Scenario list */}
      <div className="bg-cd border border-lt rounded-xl p-3 h-fit">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[8px] font-bold uppercase tracking-wider text-pk">Scenarios</div>
          <button onClick={onNew} className="text-[9px] font-semibold bg-pk text-white rounded px-2 py-0.5 hover:bg-pm">
            + New Scenario
          </button>
        </div>
        {loading ? (
          <div className="text-[10px] text-gr py-4 text-center">Loading…</div>
        ) : scenarios.length === 0 ? (
          <div className="text-[10px] text-gr py-4 text-center">No scenarios yet.</div>
        ) : (
          <div className="space-y-1">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left px-2 py-1.5 rounded border text-[10px] ${
                  s.id === selectedId ? 'border-pk bg-pink-50' : 'border-lt bg-bg hover:bg-pc'
                }`}
              >
                <div className="font-semibold text-dk truncate">{s.name}</div>
                <div className="text-[8px] text-gr flex justify-between">
                  <span>{formatDate(s.created_at)}</span>
                  <span className="uppercase">{s.status}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail */}
      <div>
        {selected ? (
          <ScenarioDetail scenario={selected} onChanged={refresh} onDeleted={() => { setSelectedId(null); refresh(); }} />
        ) : (
          <div className="bg-cd border border-lt rounded-xl p-8 text-center text-sm text-gr">
            Select a scenario, or create one to start planning.
          </div>
        )}
      </div>
    </div>
  );
}

function ScenarioDetail({ scenario, onChanged, onDeleted }) {
  const { runs, refresh: refreshRuns } = useScenarioRuns(scenario.id);
  const prod = useProductionData();
  const inv = useIngredientInventory();
  const { overrides, map: overrideMap, refresh: refreshOverrides } = useBomOverrides();

  const [sku, setSku] = useState('');
  const [cases, setCases] = useState('');
  const [runDate, setRunDate] = useState(todayIso());
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showBoms, setShowBoms] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Effective BOM for a SKU = derived lines (override qty if set) + manual-only overrides.
  const effectiveBom = useMemo(() => {
    return (skuName) => {
      const derived = prod.deriveBomFor(skuName);
      const byCode = new Map();
      for (const l of derived.lines) {
        const ov = overrideMap.get(`${skuName}::${l.code}`);
        byCode.set(String(l.code), {
          ...l,
          derivedPerCase: l.perCase,
          perCase: ov ? Number(ov.quantity_per_case) : l.perCase,
          overridden: !!ov,
        });
      }
      for (const ov of overrides) {
        if (ov.product_sku !== skuName || byCode.has(String(ov.ingredient_code))) continue;
        byCode.set(String(ov.ingredient_code), {
          key: `man:${ov.ingredient_code}`,
          code: ov.ingredient_code,
          name: ov.ingredient_name || ov.ingredient_code,
          unit: ov.unit,
          perCase: Number(ov.quantity_per_case),
          derivedPerCase: null,
          overridden: true,
          rejectPct: 0,
          yieldFactor: ov.yield_factor ?? 1,
          jobs: [],
          linked: false,
        });
      }
      return { lines: [...byCode.values()], found: derived.found, jobs: derived.jobs };
    };
  }, [prod, overrideMap, overrides]);

  const distinctSkus = useMemo(() => [...new Set(runs.map((r) => r.product_sku))], [runs]);
  const earliestRun = useMemo(
    () => (runs.length ? runs.reduce((m, r) => (r.run_date < m ? r.run_date : m), runs[0].run_date) : null),
    [runs]
  );

  // ── Ingredient explosion ──────────────────────────────────────────────────
  const explosion = useMemo(() => {
    const byIng = new Map();
    for (const run of runs) {
      const bom = effectiveBom(run.product_sku);
      for (const line of bom.lines) {
        const need = line.perCase * (Number(run.quantity_cases) || 0);
        if (!need) continue;
        const e =
          byIng.get(line.key) ??
          { key: line.key, code: line.code, name: line.name, unit: line.unit, required: 0, breakdown: [], earliest: null };
        e.required += need;
        e.breakdown.push({ sku: run.product_sku, cases: run.quantity_cases, qty: need });
        if (!e.earliest || run.run_date < e.earliest) e.earliest = run.run_date;
        byIng.set(line.key, e);
      }
    }

    const rows = [...byIng.values()].map((e) => {
      const iv = inv.byKey.get(e.key);
      const onHand = iv?.onHand ?? 0;
      const earliest = e.earliest;
      let expiringBeforeRun = 0;
      const expiringLots = [];
      for (const lot of iv?.lots ?? []) {
        if (lot.expiry_date && earliest && new Date(lot.expiry_date) < new Date(earliest)) {
          expiringBeforeRun += lot.quantity;
          expiringLots.push(lot);
        }
      }
      const available = onHand - expiringBeforeRun;
      const surplus = available - e.required;
      const leadDays = iv?.leadDays ?? null;
      let orderBy = null;
      if (earliest && leadDays != null) {
        const d = new Date(earliest);
        d.setDate(d.getDate() - leadDays);
        orderBy = d.toISOString().slice(0, 10);
      }
      // Recommended: cover the deficit; a light buffer when surplus is tight.
      let recommended = 0;
      if (surplus < 0) recommended = Math.ceil(-surplus);
      else if (e.required > 0 && surplus < e.required * 0.15) recommended = Math.ceil(e.required * 0.25);

      const sup = bestSupplier(iv?.suppliers);
      return {
        ...e,
        onHand,
        expiringBeforeRun,
        expiringLots,
        available,
        surplus,
        leadDays,
        orderBy,
        recommended,
        rawMaterialId: iv?.rawMaterialId ?? null,
        supplier: sup,
        suppliers: iv?.suppliers ?? [],
      };
    });
    rows.sort((a, b) => a.surplus - b.surplus); // worst first
    return rows;
  }, [runs, effectiveBom, inv]);

  const deficits = explosion.filter((r) => r.recommended > 0);

  const addRun = async () => {
    if (!sku || !cases || !runDate) {
      setMsg('SKU, cases and run date are required.');
      return;
    }
    setBusy(true);
    try {
      await addScenarioRun(scenario.id, { product_sku: sku, quantity_cases: cases, run_date: runDate });
      setSku('');
      setCases('');
      await refreshRuns();
      setMsg(null);
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  };

  const onGenerate = async () => {
    setBusy(true);
    try {
      const lines = deficits
        .filter((r) => r.rawMaterialId)
        .map((r) => ({
          rawMaterialId: r.rawMaterialId,
          supplierId: r.supplier?.id ?? null,
          distributor: r.supplier?.distributor ?? null,
          brand: r.supplier?.brand ?? null,
          costPerUnit: r.supplier?.cost_per_unit ?? null,
          leadDays: r.leadDays ?? null,
          quantity: r.recommended,
        }));
      const res = await generateScenarioOrders(lines);
      const skippedNoInv = deficits.length - lines.length;
      setMsg(
        `Created ${res.created} order line(s).` +
          (skippedNoInv > 0 ? ` ${skippedNoInv} deficit ingredient(s) skipped (no inventory record to attach an order to).` : '')
      );
      await updateScenarioStatus(scenario.id, 'active');
      onChanged?.();
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  };

  const today = todayIso();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-cd border border-lt rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-black text-dk">{scenario.name}</div>
          <div className="text-[9px] text-gr">Created {formatDate(scenario.created_at)}</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={scenario.status}
            onChange={async (e) => {
              await updateScenarioStatus(scenario.id, e.target.value);
              onChanged?.();
            }}
            className="text-[10px] border border-lt rounded px-2 py-1"
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (window.confirm('Delete this scenario?')) {
                await deleteScenario(scenario.id);
                onDeleted?.();
              }
            }}
            className="text-[10px] text-gr hover:text-red-600"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Runs */}
      <div className="bg-cd border border-lt rounded-xl p-4">
        <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-2">Production Runs</div>
        {runs.length > 0 && (
          <table className="w-full border-collapse text-[11px] mb-2">
            <thead>
              <tr className="bg-pc">
                <th className={TH}>SKU</th>
                <th className={THR}>Cases</th>
                <th className={TH}>Run Date</th>
                <th className={TH}>BOM Source</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const bom = effectiveBom(r.product_sku);
                return (
                  <tr key={r.id} className="border-b border-bg">
                    <td className="px-2 py-1.5 font-semibold">{r.product_sku}</td>
                    <td className="px-2 py-1.5 text-right">{qty(r.quantity_cases)}</td>
                    <td className="px-2 py-1.5">{formatDate(r.run_date)}</td>
                    <td className="px-2 py-1.5 text-[9px] text-gr">
                      {bom.found ? `Job ${bom.jobs.join(' + ')}` : 'New — no production history, manual BOM'}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={async () => {
                          await deleteScenarioRun(r.id);
                          refreshRuns();
                        }}
                        className="text-[9px] text-gr hover:text-red-600"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap gap-1.5 items-end">
          <div>
            <div className="text-[7px] text-gr mb-0.5">SKU (pick or type new)</div>
            <input
              list="sku-options"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="123006 or new SKU"
              className="px-2 py-1 rounded border border-lt text-[10px] w-56"
            />
            <datalist id="sku-options">
              {prod.skuOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </datalist>
          </div>
          <div>
            <div className="text-[7px] text-gr mb-0.5">Cases</div>
            <input
              type="number"
              value={cases}
              onChange={(e) => setCases(e.target.value)}
              placeholder="500"
              className="px-2 py-1 rounded border border-lt text-[10px] w-20 text-right"
            />
          </div>
          <div>
            <div className="text-[7px] text-gr mb-0.5">Run Date</div>
            <input
              type="date"
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
              className="px-2 py-1 rounded border border-lt text-[10px]"
            />
          </div>
          <button
            onClick={addRun}
            disabled={busy}
            className="text-[10px] font-semibold bg-pk text-white rounded px-3 py-1 hover:bg-pm disabled:opacity-50"
          >
            + Add Run
          </button>
        </div>
      </div>

      {/* Editable BOMs */}
      {distinctSkus.length > 0 && (
        <div className="bg-cd border border-lt rounded-xl p-4">
          <button
            onClick={() => setShowBoms((v) => !v)}
            className="text-[8px] font-bold uppercase tracking-wider text-pk mb-2"
          >
            {showBoms ? '▾' : '▸'} Bills of Material (editable per case)
          </button>
          {showBoms &&
            distinctSkus.map((s) => {
              const bom = effectiveBom(s);
              return (
                <div key={s} className="mb-3">
                  <div className="text-[10px] font-bold text-dk mb-1">
                    {s}{' '}
                    <span className="text-[8px] font-normal text-gr">
                      {bom.found ? `· derived from Job ${bom.jobs.join(' + ')}` : '· manual (no production history)'}
                    </span>
                  </div>
                  <table className="w-full border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-pc">
                        <th className={TH}>Ingredient</th>
                        <th className={THR}>Derived/case</th>
                        <th className={THR}>Reject</th>
                        <th className={THR}>Per case (used)</th>
                        <th className={TH}>Unit</th>
                        <th className={TH}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bom.lines.map((l) => (
                        <BomLineRow key={l.key} sku={s} line={l} onSaved={refreshOverrides} />
                      ))}
                      <tr>
                        <td colSpan={6} className="pt-1">
                          <ManualIngredientAdd sku={s} onSaved={refreshOverrides} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
        </div>
      )}

      {/* Ingredient explosion */}
      {explosion.length > 0 && (
        <div className="bg-cd border border-lt rounded-xl overflow-hidden">
          <div className="px-3 py-2 text-[8px] font-semibold uppercase text-pk border-b border-lt flex items-center justify-between">
            <span>Ingredient Requirements</span>
            <button
              onClick={onGenerate}
              disabled={busy || !deficits.length}
              className="text-[9px] font-semibold bg-pk text-white rounded px-2.5 py-1 hover:bg-pm disabled:opacity-40"
            >
              Generate Orders ({deficits.length})
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px] whitespace-nowrap">
              <thead>
                <tr className="bg-pc">
                  <th className={TH}>Ingredient</th>
                  <th className={THR}>Required</th>
                  <th className={TH}>Breakdown</th>
                  <th className={THR}>On Hand</th>
                  <th className={THR}>Exp. Before Run</th>
                  <th className={THR}>Available</th>
                  <th className={THR}>Surplus/Deficit</th>
                  <th className={THR}>Lead</th>
                  <th className={TH}>Order By</th>
                  <th className={THR}>Rec. Qty</th>
                </tr>
              </thead>
              <tbody>
                {explosion.map((r) => {
                  const orderLate = r.orderBy && r.orderBy < today;
                  return (
                    <tr key={r.key} className="border-b border-bg">
                      <td className="px-2 py-1.5 font-semibold">{r.name}</td>
                      <td className="px-2 py-1.5 text-right font-bold">
                        {qty(r.required, 1)}
                        <span className="text-[8px] text-gr ml-0.5">{r.unit}</span>
                      </td>
                      <td className="px-2 py-1.5 text-[9px] text-gr whitespace-normal max-w-[220px]">
                        {r.breakdown.map((b) => `${b.sku} ${qty(b.cases)}cs = ${qty(b.qty, 1)}`).join(', ')}
                      </td>
                      <td className="px-2 py-1.5 text-right">{qty(r.onHand)}</td>
                      <td className={`px-2 py-1.5 text-right ${r.expiringBeforeRun > 0 ? 'text-amber-700' : 'text-gr'}`}>
                        {r.expiringBeforeRun > 0 ? qty(r.expiringBeforeRun) : '--'}
                      </td>
                      <td className="px-2 py-1.5 text-right">{qty(r.available)}</td>
                      <td
                        className={`px-2 py-1.5 text-right font-bold ${
                          r.surplus < 0 ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {r.surplus >= 0 ? '+' : ''}
                        {qty(r.surplus, 1)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gr">{r.leadDays != null ? `${r.leadDays}d` : '--'}</td>
                      <td className={`px-2 py-1.5 ${orderLate ? 'text-red-700 font-bold' : 'text-gr'}`}>
                        {r.orderBy ? (orderLate ? `${formatDate(r.orderBy)} · NOW` : formatDate(r.orderBy)) : '--'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold">
                        {r.recommended > 0 ? qty(r.recommended) : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {msg && (
        <div className="text-[10px] text-md bg-bg border border-lt rounded-lg px-3 py-2">{msg}</div>
      )}

      {/* Assumptions */}
      {explosion.length > 0 && (
        <div className="bg-cd border border-lt rounded-xl p-4">
          <button
            onClick={() => setShowAssumptions((v) => !v)}
            className="text-[8px] font-bold uppercase tracking-wider text-pk"
          >
            {showAssumptions ? '▾' : '▸'} Assumptions &amp; sources
          </button>
          {showAssumptions && (
            <div className="mt-2 space-y-3 text-[10px] text-md">
              <div>
                <div className="font-bold text-dk mb-0.5">BOM per SKU</div>
                {distinctSkus.map((s) => {
                  const bom = effectiveBom(s);
                  return (
                    <div key={s} className="mb-1">
                      <span className="font-semibold">{s}</span>{' '}
                      <span className="text-gr">
                        {bom.found ? `derived from Job ${bom.jobs.join(' + ')}` : 'manual override (no production history)'}
                      </span>
                      <ul className="ml-3 list-disc text-[9px] text-gr">
                        {bom.lines.map((l) => (
                          <li key={l.key}>
                            {l.name}: {qty(l.perCase, 4)} {l.unit}/case
                            {l.overridden && <span className="text-pk font-semibold"> (override)</span>}
                            {l.rejectPct > 0 && <span> · {l.rejectPct.toFixed(1)}% reject (yield ×{l.yieldFactor.toFixed(2)})</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <div>
                <div className="font-bold text-dk mb-0.5">Expiring lots before earliest run ({formatDate(earliestRun)})</div>
                {explosion.flatMap((r) => r.expiringLots.map((l) => ({ ...l, name: r.name }))).length ? (
                  <ul className="ml-3 list-disc text-[9px] text-gr">
                    {explosion.flatMap((r) =>
                      r.expiringLots.map((l, i) => (
                        <li key={`${r.key}-${i}`}>
                          {r.name} · lot {l.lot_number || '(none)'} · {qty(l.quantity)} · expires {formatDate(l.expiry_date)}
                        </li>
                      ))
                    )}
                  </ul>
                ) : (
                  <div className="text-[9px] text-gr ml-3">None.</div>
                )}
              </div>
              <div>
                <div className="font-bold text-dk mb-0.5">Lead times (shortest distributor used)</div>
                <ul className="ml-3 list-disc text-[9px] text-gr">
                  {explosion.map((r) => (
                    <li key={r.key}>
                      {r.name}: {r.leadDays != null ? `${r.leadDays}d` : '--'}
                      {r.supplier ? ` · ${r.supplier.distributor ?? ''} ${r.supplier.brand ?? ''}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-[9px] text-gr italic">
                On-hand and lots are the latest Assemblers inventory snapshot. Recommended qty covers the deficit; a light
                buffer is suggested when surplus is tight (&lt;15% of need).
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One editable derived-BOM row — override qty persists to bom_overrides.
function BomLineRow({ sku, line, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await saveBomOverride({
        product_sku: sku,
        ingredient_code: line.code,
        ingredient_name: line.name,
        quantity_per_case: Number(val),
        unit: line.unit ?? 'ea',
        yield_factor: line.yieldFactor ?? 1,
        derived_from_jobs: line.jobs ?? null,
      });
      setEditing(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    try {
      await resetBomOverride(sku, line.code);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-bg">
      <td className="px-2 py-1 font-semibold">{line.name}</td>
      <td className="px-2 py-1 text-right text-gr">{line.derivedPerCase != null ? qty(line.derivedPerCase, 4) : '--'}</td>
      <td className="px-2 py-1 text-right text-gr">{line.rejectPct ? `${line.rejectPct.toFixed(1)}%` : '--'}</td>
      <td className="px-2 py-1 text-right">
        {editing ? (
          <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-20 px-1 py-0.5 border border-pk rounded text-right text-[10px]"
            autoFocus
          />
        ) : (
          <span className={line.overridden ? 'font-bold text-dk' : 'text-md'}>{qty(line.perCase, 4)}</span>
        )}
      </td>
      <td className="px-2 py-1 text-gr">{line.unit}</td>
      <td className="px-2 py-1 text-right whitespace-nowrap">
        {editing ? (
          <>
            <button onClick={save} disabled={busy} className="text-[9px] text-pk font-semibold mr-1">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-[9px] text-gr">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setVal(String(line.perCase));
                setEditing(true);
              }}
              className="text-[9px] text-pk mr-1"
            >
              Edit
            </button>
            {line.overridden && (
              <button onClick={reset} disabled={busy} className="text-[9px] text-gr hover:text-dk">
                Reset to actual
              </button>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

// Add a manual ingredient line to a SKU's BOM (for new SKUs / extra items).
function ManualIngredientAdd({ sku, onSaved }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [perCase, setPerCase] = useState('');
  const [unit, setUnit] = useState('lbs');
  const [busy, setBusy] = useState(false);

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-[9px] text-pk hover:text-pm">
        + Add ingredient
      </button>
    );

  const save = async () => {
    if (!name || !perCase) return;
    setBusy(true);
    try {
      await saveBomOverride({
        product_sku: sku,
        ingredient_code: name.trim(),
        ingredient_name: name.trim(),
        quantity_per_case: Number(perCase),
        unit,
      });
      setName('');
      setPerCase('');
      setOpen(false);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-1 items-center">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ingredient name"
        className="px-2 py-0.5 border border-lt rounded text-[10px] w-40"
      />
      <input
        type="number"
        value={perCase}
        onChange={(e) => setPerCase(e.target.value)}
        placeholder="qty/case"
        className="px-2 py-0.5 border border-lt rounded text-[10px] w-20 text-right"
      />
      <input
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        className="px-2 py-0.5 border border-lt rounded text-[10px] w-14"
      />
      <button onClick={save} disabled={busy} className="text-[9px] text-pk font-semibold">
        Add
      </button>
      <button onClick={() => setOpen(false)} className="text-[9px] text-gr">
        Cancel
      </button>
    </div>
  );
}
