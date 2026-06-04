import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePoLots, addPoLot } from '../hooks/usePurchaseOrders';

const TH = 'px-2 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';
const norm = (s) => String(s ?? '').trim().toUpperCase();

const SOURCE = {
  email: ['Email', 'bg-violet-100 text-violet-700'],
  manual: ['Manual', 'bg-slate-100 text-slate-600'],
  dot_report: ['DOT', 'bg-blue-100 text-blue-700'],
};
function SourceBadge({ source }) {
  const [label, cls] = SOURCE[source] || [source || '—', 'bg-bg text-gr'];
  return <span className={`ml-1.5 px-1 py-0.5 rounded-full text-[7px] font-semibold ${cls}`}>{label}</span>;
}

// Line Items with finished-good lot entry inline per SKU. Each lot identifies
// which production batch the cookies shipping to DOT/retailers came from. Lots
// save to po_lot_numbers (po_id, sku, lot_number, quantity_cases). A subtle
// warning shows when a SKU's lot cases don't add up to its ordered quantity.
export default function PoLineItemsLots({ poId, lines, revPerCase }) {
  const { lots, refresh } = usePoLots(poId);
  const [drafts, setDrafts] = useState({}); // sku -> [{ lot_number, quantity_cases }]
  const [busy, setBusy] = useState(null); // `${sku}-${i}` while saving
  const [err, setErr] = useState(null);

  const lotsFor = (sku) => lots.filter((l) => norm(l.sku) === norm(sku));
  const draftsFor = (sku) => drafts[sku] ?? [];

  const addDraft = (sku) =>
    setDrafts((d) => ({ ...d, [sku]: [...(d[sku] ?? []), { lot_number: '', quantity_cases: '' }] }));
  const patchDraft = (sku, i, patch) =>
    setDrafts((d) => ({ ...d, [sku]: d[sku].map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const removeDraft = (sku, i) =>
    setDrafts((d) => ({ ...d, [sku]: d[sku].filter((_, idx) => idx !== i) }));

  const saveDraft = async (sku, i) => {
    const row = drafts[sku][i];
    if (!row.lot_number.trim()) return;
    setBusy(`${sku}-${i}`);
    const { error } = await addPoLot(poId, {
      lot_number: row.lot_number.trim(),
      sku,
      quantity_cases: row.quantity_cases ? Number(row.quantity_cases) : null,
      received_date: '',
    });
    setBusy(null);
    if (error) setErr(error.message);
    else {
      setErr(null);
      removeDraft(sku, i);
      refresh();
    }
  };

  const inputCls = 'border border-lt rounded px-1.5 py-1 text-[10px] bg-cd';

  return (
    <div className="px-[18px] pb-3">
      <div className="text-[8px] font-bold text-pk uppercase mb-1.5 pb-1 border-b-2 border-lt">
        Line Items &amp; Finished-Good Lots
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-pc">
            <th className={TH}>SKU</th>
            <th className={THR}>Cases</th>
            <th className={THR}>Rev/cs</th>
            <th className={THR}>Line Total</th>
            <th className={THR}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const ordered = line.quantity_cases ?? 0;
            const saved = lotsFor(line.sku);
            const dfts = draftsFor(line.sku);
            const lotSum =
              saved.reduce((s, l) => s + (Number(l.quantity_cases) || 0), 0) +
              dfts.reduce((s, r) => s + (Number(r.quantity_cases) || 0), 0);
            const hasLots = saved.length > 0 || dfts.some((r) => r.quantity_cases);
            const mismatch = hasLots && lotSum !== ordered;

            return (
              <Fragment key={line.id}>
                <tr className="border-b border-bg">
                  <td className="px-2 py-1.5 font-bold">{line.sku}</td>
                  <td className="px-2 py-1.5 text-right">{ordered.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right text-gr">
                    {revPerCase != null ? `$${Number(revPerCase).toFixed(2)}` : '--'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">
                    {line.line_total != null
                      ? `$${Number(line.line_total).toLocaleString()}`
                      : revPerCase != null
                      ? `$${(ordered * revPerCase).toLocaleString()}`
                      : '--'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => addDraft(line.sku)}
                      className="text-[10px] font-semibold text-pk hover:text-pm"
                    >
                      + Lot
                    </button>
                  </td>
                </tr>

                {/* Saved lots */}
                {saved.map((l) => (
                  <tr key={l.id} className="border-b border-bg bg-[#FFF5FA]">
                    <td className="pl-6 pr-2 py-1 text-[10px]">
                      <span className="font-mono font-semibold text-dk">{l.lot_number}</span>
                      <SourceBadge source={l.source} />
                    </td>
                    <td className="px-2 py-1 text-right text-[10px] text-md">
                      {l.quantity_cases != null ? `${l.quantity_cases.toLocaleString()} cs` : '—'}
                    </td>
                    <td />
                    <td />
                    <td className="px-2 py-1 text-right">
                      <Link
                        to={`/trace?lot=${encodeURIComponent(l.lot_number)}`}
                        className="text-[9px] text-pk underline underline-offset-2 whitespace-nowrap"
                      >
                        Trace ↗
                      </Link>
                    </td>
                  </tr>
                ))}

                {/* Draft (unsaved) lot rows */}
                {dfts.map((row, i) => (
                  <tr key={`d-${i}`} className="border-b border-bg bg-bg">
                    <td className="pl-6 pr-2 py-1">
                      <input
                        autoFocus
                        value={row.lot_number}
                        onChange={(e) => patchDraft(line.sku, i, { lot_number: e.target.value })}
                        placeholder="Lot # (e.g. 6147AM)"
                        className={inputCls + ' w-[150px]'}
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        min="0"
                        value={row.quantity_cases}
                        onChange={(e) => patchDraft(line.sku, i, { quantity_cases: e.target.value })}
                        placeholder="Cases"
                        className={inputCls + ' w-[80px] text-right'}
                      />
                    </td>
                    <td />
                    <td />
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <button
                        onClick={() => saveDraft(line.sku, i)}
                        disabled={!row.lot_number.trim() || busy === `${line.sku}-${i}`}
                        className="text-[10px] font-semibold text-pk hover:text-pm disabled:opacity-40"
                      >
                        {busy === `${line.sku}-${i}` ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => removeDraft(line.sku, i)}
                        className="ml-2 text-[10px] text-gr hover:text-red-600"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Validation: lot cases vs ordered cases */}
                {mismatch && (
                  <tr>
                    <td colSpan={5} className="pl-6 pr-2 py-1 text-[9px] text-amber-700 bg-amber-50">
                      ⚠ Lot cases ({lotSum.toLocaleString()}) don&apos;t add up to the ordered
                      {' '}quantity ({ordered.toLocaleString()}) for {line.sku}.
                    </td>
                  </tr>
                )}
                {hasLots && !mismatch && (
                  <tr>
                    <td colSpan={5} className="pl-6 pr-2 py-0.5 text-[9px] text-emerald-700">
                      ✓ {lotSum.toLocaleString()} cases across {saved.length} lot
                      {saved.length === 1 ? '' : 's'} — matches the ordered quantity.
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {err && <div className="mt-1.5 text-[9px] text-red-600">{err}</div>}

      <div className="mt-2 text-[8px] text-gr italic">
        Lot numbers identify the finished-good production batch shipped to DOT/retailers — the
        traceability key for recalls. (Inbound raw-material BOLs are captured at Inventory →
        Reorder / Landing, not here.)
      </div>
    </div>
  );
}
