import { F, Stat, ServiceBars, WMT_OTIF, toneVsTarget, barColor, gradeOtif, otifWeeks, costPerCase, fiscalQuarter, weekEndingNumeric } from "../../pages/DemandPlanner";

// OTIF summary, moved from the Demand Planner's Service health (Nov 9 2026):
// last-4-week On-Time / In-Full / OTIF, why cases missed, weekly bars and the
// Walmart-quarter table with the estimated fine. Formulas and targets are the
// Supplier One scorecard's — see the notes in DemandPlanner.jsx (gradeOtif).
export function OtifSummary({ feeds }) {
  // ── OTIF ──
  const weeks = otifWeeks(feeds.otif);
  const l4 = weeks.length ? gradeOtif((feeds.otif ?? []).filter(r => r.ordered > 0).slice(-4)) : null;
  const cpc = costPerCase(feeds.orders);
  const fine = g => (cpc != null ? g.missed * cpc * WMT_OTIF.fineRate : null);
  const quarters = [...(feeds.otif ?? []).filter(r => r.ordered > 0).reduce((m, r) => {
    const { fy, q } = fiscalQuarter(r.wk);
    const k = fy * 10 + q;
    if (!m.has(k)) m.set(k, { k, fy, q, rows: [] });
    m.get(k).rows.push(r);
    return m;
  }, new Map()).values()].sort((a, b) => b.k - a.k).slice(0, 3).map(x => ({ ...x, g: gradeOtif(x.rows) }));
  const why = l4 && l4.missed > 0 ? [
    { l: "Unfilled (cut)", v: l4.unfilled, c: "#C2185B" },
    { l: "Late", v: l4.late, c: "#E8A33D" },
    { l: "Early", v: l4.early, c: "#6B3F8C" },
  ] : [];
  const thead = "text-[11px] uppercase tracking-wider opacity-60 font-normal";
  return (
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "#C2185B" }}>
            OTIF{l4 ? " · last 4 weeks loaded, " + weekEndingNumeric(l4.first) + "–" + weekEndingNumeric(l4.last) : ""}
          </div>
          {l4 ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Stat label="On-Time" value={F.pct(l4.onTimePct)} tone={toneVsTarget(l4.onTimePct, WMT_OTIF.onTime)}
                  src={"target " + F.pct0(WMT_OTIF.onTime) + " · in window ÷ arrived"} />
                <Stat label="In-Full" value={F.pct(l4.inFullPct)} tone={toneVsTarget(l4.inFullPct, WMT_OTIF.inFull)}
                  src={"target " + F.pct0(WMT_OTIF.inFull) + " · received ÷ ordered"} />
                <Stat label="OTIF" value={F.pct(l4.otifPct)}
                  src="on time ÷ ordered (Walmart's OTIF %)" />
              </div>
              {why.length > 0 && (
                <div className="mb-3">
                  <div className="text-[11px] opacity-70 mb-1">
                    <b>{F.int(l4.missed)} of {F.int(l4.ordered)} cs</b> non-compliant
                    {fine(l4) != null && <> · est. fine <b>${F.int(fine(l4))}</b> (3% of ~${cpc.toFixed(2)}/cs)</>}
                  </div>
                  <div className="flex h-2.5 rounded overflow-hidden" style={{ background: "#F1E7EC" }}>
                    {why.filter(w => w.v > 0).map(w => (
                      <div key={w.l} style={{ width: (w.v / l4.missed) * 100 + "%", background: w.c }} title={w.l + ": " + F.int(w.v) + " cs"} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 mt-1 text-[11px]">
                    {why.map(w => (
                      <span key={w.l}><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: w.c }} />
                        {w.l} {F.int(w.v)} cs ({F.pct0(w.v / l4.missed)})</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-[11px] opacity-60 mb-0.5">In-Full by week (target {F.pct0(WMT_OTIF.inFull)})</div>
              <ServiceBars rows={weeks.map(w => ({ wk: w.wk, v: w.inFullPct, note: F.int(w.unfilled) + " cs unfilled of " + F.int(w.ordered) }))}
                bad={WMT_OTIF.inFull} warn={WMT_OTIF.inFull + WMT_OTIF.nearPts} fmt={F.pct} />
              <div className="text-[11px] opacity-60 mb-0.5 mt-3">On-Time by week (target {F.pct0(WMT_OTIF.onTime)})</div>
              <ServiceBars rows={weeks.map(w => ({ wk: w.wk, v: w.onTimePct, note: F.int(w.late) + " cs late, " + F.int(w.early) + " early" }))}
                bad={WMT_OTIF.onTime} warn={WMT_OTIF.onTime + WMT_OTIF.nearPts} fmt={F.pct} />
              {quarters.length > 0 && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-[11px] tabular-nums">
                    <thead><tr className="text-left">
                      <th className={thead}>Walmart quarter</th><th className={thead + " text-right"}>On-Time</th>
                      <th className={thead + " text-right"}>In-Full</th><th className={thead + " text-right"}>OTIF</th>
                      <th className={thead + " text-right"}>Missed cs</th><th className={thead + " text-right"}>Est. fine</th>
                    </tr></thead>
                    <tbody>
                      {quarters.map(x => (
                        <tr key={x.k} style={{ borderTop: "1px solid #F1E7EC" }}>
                          <td className="py-1 pr-2">FY{String(x.fy + 1).slice(2)} Q{x.q} <span className="opacity-50">({weekEndingNumeric(x.g.first)}–{weekEndingNumeric(x.g.last)})</span></td>
                          <td className="py-1 text-right font-bold" style={{ color: barColor(x.g.onTimePct, WMT_OTIF.onTime, WMT_OTIF.onTime + WMT_OTIF.nearPts) }}>{F.pct(x.g.onTimePct)}</td>
                          <td className="py-1 text-right font-bold" style={{ color: barColor(x.g.inFullPct, WMT_OTIF.inFull, WMT_OTIF.inFull + WMT_OTIF.nearPts) }}>{F.pct(x.g.inFullPct)}</td>
                          <td className="py-1 text-right">{F.pct(x.g.otifPct)}</td>
                          <td className="py-1 text-right">{F.int(x.g.missed)}</td>
                          <td className="py-1 text-right">{fine(x.g) != null ? "$" + F.int(fine(x.g)) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] opacity-60 mt-2">
                Same formulas and targets as Walmart's Supplier One scorecard (In full / On time, store) — checked
                to the hundredth of a point on week ending 10/25. Graded per PO, on cases; the export has no item
                number, so OTIF cannot be split by SKU. Walmart's fiscal year starts in February (FY27 = Feb 2026 – Jan 2027).
                The fine is an estimate: 3% of cost of goods per non-compliant case, as supplier guides describe it.
              </p>
            </>
          ) : (
            <p className="text-[11px] opacity-60">
              Upload an "OTIF STORE Performance PO DETAILS" export at Uploads &rarr; Retail Link OTIF.
            </p>
          )}
        </div>
  );
}
