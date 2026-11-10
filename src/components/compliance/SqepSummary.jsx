import { useState } from "react";
import { F, Stat, weekEndingNumeric, wkIndex } from "../../pages/DemandPlanner";

// ── SQEP — Walmart's Supplier Quality Excellence Program (Nov 9 2026) ──────
// From the SQEP Total Compliance Table export (upload cards 10–11): one row per
// defect, PROJECTED (not yet billed, still disputable) or INVOICED (on the
// monthly SQEP bill). Supplier One's scorecard shows six cards, each scored
// against 100%. The export lists only the DEFECTS, not everything Walmart
// checked, so the score itself cannot be computed here: the cards show defects
// and charges, the same two lines Supplier One prints under each score.
// Each defect is joined to DOT by Walmart PO (padded to 10 digits) for SKU and
// ship date.
export const SQEP_CARDS = [
  { key: "asn", label: "Advance shipment notice (ASN) compliance", test: c => /ASN/i.test(c) },
  { key: "poline", label: "PO line accuracy", test: c => /PO\s*(LINE\s*)?ACCURACY|LINE\s*ACCURACY/i.test(c) },
  { key: "case", label: "Case compliance", test: c => /CASE/i.test(c) },
  { key: "pack", label: "Packaging compliance", test: c => /PACKAG/i.test(c) },
  { key: "pallet", label: "Pallet compliance", test: c => /PALLET/i.test(c) },
  { key: "load", label: "Load compliance", test: c => /LOAD/i.test(c) },
];
export const sqepCard = cat => SQEP_CARDS.find(c => c.test(cat || "")) ?? { key: "other:" + cat, label: cat || "Other" };
export const usd2 = v => (v == null ? "—" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const wmtWk = wk => "Wk " + String(wk).slice(4) + " · " + weekEndingNumeric(wk);

// Supplier One counts ONE defect per PO × ticket within a category; the export
// can list several sub-defects under one ticket (wk 37: three barcode problems
// on PO 1935234281, ticket …4679-0000 — 4 rows, Supplier One says 2 defects,
// same $372.60). Counted the same way here so the cards match the scorecard.
export const sqepDefectKey = r => r.category + "|" + r.po + "|" + (r.ticket || "");
export const countDefects = xs => new Set(xs.map(sqepDefectKey)).size;
// Walmart's own flag: "Applicable for Charge" = N → counted against the score,
// not billed. Mar–mid-Sep 2026 invoices are all N; charging began wk 202634.
export const notCharged = r => r.chargeable === false;
// Inverse of wkIndex (defined with the Tracker helpers): 1 → 202601.
const weekFromIndex = i => (2026 + Math.floor((i - 1) / 52)) * 100 + (((i - 1) % 52) + 52) % 52 + 1;

export function SqepHealth({ sqep }) {
  const hasProjected = (sqep ?? []).some(r => r.status === "projected");
  const [view, setView] = useState(null);
  const [allWeeks, setAllWeeks] = useState(false);
  const status = view ?? (hasProjected ? "projected" : "invoiced");
  const thead = "text-[11px] uppercase tracking-wider opacity-60 font-normal";

  if (!sqep?.length) {
    return (
      <p className="text-[11px] opacity-60">
        Upload Walmart's "SQEP Total Compliance Table" export at Uploads &rarr; 10 (projected) or 11 (invoiced).
      </p>
    );
  }
  const sum = xs => xs.reduce((a, r) => a + (r.charge ?? 0), 0);
  const rows = sqep.filter(r => r.status === status);
  const billed = rows.filter(r => !notCharged(r));
  const free = rows.filter(notCharged);
  const wks = [...new Set(rows.map(r => r.wk))].sort((a, b) => a - b);
  const span = wks.length ? (wks.length > 1 ? wmtWk(wks[0]) + " – " + wmtWk(wks.at(-1)) : wmtWk(wks[0])) : "—";

  // When charging started, and the stretch Walmart scored without billing —
  // across both statuses, from Walmart's own flag.
  const allFree = sqep.filter(notCharged);
  const firstBilledWk = Math.min(...sqep.filter(r => !notCharged(r) && (r.charge ?? 0) > 0).map(r => r.wk));
  const freeWks = allFree.map(r => r.wk);
  const freeMonths = [...new Set(allFree.sort((a, b) => a.wk - b.wk).map(r => (r.month || "").split(" ")[0]).filter(Boolean))];

  // Cards: Supplier One's six, plus any category the export adds.
  const cards = SQEP_CARDS.map(c => ({ ...c, rows: [] }));
  for (const r of rows) {
    const c = sqepCard(r.category);
    let card = cards.find(x => x.key === c.key);
    if (!card) { card = { ...c, rows: [] }; cards.push(card); }
    card.rows.push(r);
  }

  // Weekly roll-up, every Walmart week from the first to the last loaded, so a
  // week with no defects shows as a row rather than disappearing. That can mean
  // Walmart recorded none (May 2026, wk 14–17: Caroline's export came back
  // header-only; wk 33) or that a month was not pulled.
  const byWkMap = sqep.reduce((m, r) => {
    const a = m.get(r.wk) || { wk: r.wk, month: r.month, projected: [], invoiced: [] };
    a[r.status].push(r);
    m.set(r.wk, a);
    return m;
  }, new Map());
  const allWks = [...byWkMap.keys()].sort((a, b) => a - b);
  const byWk = [];
  for (let i = wkIndex(allWks.at(-1)); i >= wkIndex(allWks[0]); i--) {
    const wk = allWks.find(w => wkIndex(w) === i) ?? weekFromIndex(i);
    byWk.push(byWkMap.get(wk) ?? { wk, gap: true });
  }

  const types = [...billed.reduce((m, r) => m.set(r.type, (m.get(r.type) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
  const top = types[0];
  const suppliers = [...new Set(rows.map(r => r.supplier).filter(Boolean))];
  const amber = "#B87514";

  return (
    <div>
      {allFree.length > 0 && Number.isFinite(firstBilledWk) && (
        <div className="rounded-lg px-3 py-2 mb-3 text-[11px]" style={{ background: "#FFF7EA", border: "1px solid #F1D9AE" }}>
          <b>Scored but not charged:</b> Walmart recorded <b>{F.int(countDefects(allFree))}</b> SQEP defects in
          {" "}{wmtWk(Math.min(...freeWks))} – {wmtWk(Math.max(...freeWks))}
          {freeMonths.length ? <> (billing months {freeMonths.join(", ")})</> : null} and marked every one
          "Applicable for Charge = N" — they count against the score but were not billed.
          Charging starts in <b>{wmtWk(firstBilledWk)}</b>; every defect since is billed.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {["projected", "invoiced"].map(k => {
          const n = countDefects(sqep.filter(r => r.status === k));
          return (
            <button key={k} onClick={() => setView(k)} disabled={!n}
              className="text-[11px] px-3 py-1 rounded-full border disabled:opacity-40"
              style={{ borderColor: status === k ? "#2D2235" : "#E5D9DE", background: status === k ? "#2D2235" : "white", color: status === k ? "white" : "#2D2235" }}>
              {k === "projected" ? "Projected" : "Invoiced"} ({n})
            </button>
          );
        })}
        <span className="text-[11px] opacity-60">
          {status === "projected" ? "Not billed yet — can still be disputed." : "From Walmart's monthly SQEP invoices."} Walmart weeks loaded: {span}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3 max-w-2xl">
        <Stat label={status === "projected" ? "Projected charges" : "Invoiced charges"} value={usd2(sum(billed))} tone={sum(billed) > 0 ? "bad" : undefined}
          src={status === "projected" ? "potential, not yet invoiced" : "billed"} />
        <Stat label="Defects charged" value={F.int(countDefects(billed))} tone={billed.length ? "bad" : undefined}
          src={"one per PO × ticket, as Supplier One counts"} />
        <Stat label="Scored, not charged" value={F.int(countDefects(free))} tone={free.length ? "warn" : undefined}
          src={'"Applicable for Charge" = N'} />
      </div>

      <div className="grid gap-2 mb-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {cards.map(c => {
          const $ = sum(c.rows.filter(r => !notCharged(r)));
          const nFree = countDefects(c.rows.filter(notCharged));
          return (
            <div key={c.key} className="rounded-lg border p-3 min-w-0" style={{ borderColor: "#E5D9DE" }}>
              <div className="text-[11px] font-semibold leading-tight mb-1" style={{ minHeight: "2.4em" }}>{c.label}</div>
              <div className="text-[11px] tabular-nums">Targeted score: 100%</div>
              <div className="text-[11px] tabular-nums">Defects: <b>{F.int(countDefects(c.rows))}</b></div>
              <div className="text-[11px] tabular-nums">Total charges: <b style={{ color: $ > 0 ? "#C2185B" : "#3E8E5A" }}>{usd2($)}</b></div>
              {nFree > 0 && <div className="text-[11px] tabular-nums" style={{ color: amber }}>Not charged: <b>{F.int(nFree)}</b></div>}
            </div>
          );
        })}
      </div>

      {top && (
        <p className="text-[11px] mb-3">
          <b>{F.int(top[1])} of {F.int(billed.length)}</b> charged {status} defect lines are <b>{top[0]}</b>
          {billed.length ? <> · average <b>{usd2(sum(billed) / countDefects(billed))}</b> per defect</> : null}
          {suppliers.length > 0 && <> · Walmart supplier on these POs: <b>{suppliers.join(", ")}</b></>}
        </p>
      )}

      <div className="overflow-x-auto mb-3">
        <table className="w-full text-[11px] tabular-nums">
          <thead><tr className="text-left">
            <th className={thead}>Walmart week</th><th className={thead}>Billing month</th>
            <th className={thead + " text-right"}>Projected defects</th><th className={thead + " text-right"}>Projected $</th>
            <th className={thead + " text-right"}>Invoiced defects</th><th className={thead + " text-right"}>Invoiced $</th>
            <th className={thead + " text-right"}>Scored, not charged</th>
          </tr></thead>
          <tbody>
            {(allWeeks ? byWk : byWk.slice(0, 8)).map(w => {
              if (w.gap) return (
                <tr key={w.wk} style={{ borderTop: "1px solid #F1E7EC" }} className="opacity-50">
                  <td className="py-1 pr-2">{wmtWk(w.wk)}</td>
                  <td className="py-1 pr-2 italic" colSpan={6}>no defects in the files loaded</td>
                </tr>
              );
              const pB = w.projected.filter(r => !notCharged(r)), iB = w.invoiced.filter(r => !notCharged(r));
              const nFree = countDefects([...w.projected, ...w.invoiced].filter(notCharged));
              return (
                <tr key={w.wk} style={{ borderTop: "1px solid #F1E7EC" }}>
                  <td className="py-1 pr-2">{wmtWk(w.wk)}</td>
                  <td className="py-1 pr-2 opacity-70">{w.month ?? "—"}</td>
                  <td className="py-1 text-right">{pB.length ? F.int(countDefects(pB)) : "—"}</td>
                  <td className="py-1 text-right">{pB.length ? usd2(sum(pB)) : "—"}</td>
                  <td className="py-1 text-right">{iB.length ? F.int(countDefects(iB)) : "—"}</td>
                  <td className="py-1 text-right font-bold">{iB.length ? usd2(sum(iB)) : "—"}</td>
                  <td className="py-1 text-right" style={{ color: nFree ? amber : undefined }}>{nFree ? F.int(nFree) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {byWk.length > 8 && (
        <button onClick={() => setAllWeeks(v => !v)} className="text-[11px] px-3 py-1 rounded-full border -mt-1 mb-3" style={{ borderColor: "#E5D9DE" }}>
          {allWeeks ? "Show the last 8 weeks" : "Show all " + byWk.length + " weeks"}
        </button>
      )}


      <p className="text-[11px] opacity-60 mt-2">
        Source: Walmart's SQEP Total Compliance Table (projected and invoiced exports). Defects are counted one per PO ×
        ticket, as Supplier One counts them; the export can list several sub-defects under one ticket. The export lists
        defects only, not everything Walmart graded, so Supplier One's score % is not computed here. "Scored, not charged"
        is Walmart's own "Applicable for Charge = N". SKU and ship date come from DOT; DOT's records start in March, so
        older POs may show as not in DOT.
      </p>
    </div>
  );
}

