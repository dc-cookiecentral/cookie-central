import { useEffect, useMemo, useState } from "react";
import { useDemandFeeds, padPo } from "../hooks/useDemandFeeds";
import { useComplianceData } from "../hooks/useComplianceData";
import { F, Stat, WMT_OTIF, costPerCase } from "./DemandPlanner";
import { SqepHealth, usd2, wmtWk, countDefects, notCharged } from "../components/compliance/SqepSummary";
import { OtifSummary } from "../components/compliance/OtifSummary";
import { sqepRule, sqepTiming, otifCauses, OWNERS } from "../lib/complianceRules";

/* ─────────────────────────────────────────────────────────────────────────
   Walmart Compliance (Nov 9 2026) — OTIF and SQEP, moved off the Demand
   Planner into a page of their own, plus what the planner never had:
     · every SQEP issue with the Cortina invoice it hit, Walmart's own words
       for the issue, its money (invoiced / projected / scored-not-charged)
       and a suggested action, owner and dispute route (src/lib/complianceRules.js);
     · every PO that missed OTIF, why (joined to DOT), the estimated fine and
       the action;
     · one Actions list across both, grouped by owner and ranked by dollars.
   Internal roles only for now (App.jsx InternalOnly); Caroline plans to open
   it to the cortina login once it is complete.
   ───────────────────────────────────────────────────────────────────────── */

const TABS = [
  { id: "sqep", label: "SQEP" },
  { id: "otif", label: "OTIF" },
  { id: "actions", label: "Actions" },
];
const thead = "text-[11px] uppercase tracking-wider opacity-60 font-normal text-left";
const PAGE = 100;
const amber = "#B87514";

function Select({ id, label, value, onChange, options }) {
  return (
    <label htmlFor={id} className="flex items-center gap-1 text-[11px]">
      <span className="opacity-60">{label}</span>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}
        className="text-[11px] border rounded px-1.5 py-0.5 bg-white max-w-[220px]" style={{ borderColor: "#E5D9DE" }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const uniq = xs => [...new Set(xs.filter(Boolean))];
// The row tables show the action's first sentence; the full text is in the
// by-issue / by-cause table above them (and in the cell's tooltip).
const firstSentence = t => { const m = (t || "").match(/^.*?[.!?](\s|$)/); return m ? m[0].trim() : t; };

// Charged $ over the last 4 Walmart weeks that carry a charge, per week.
function runRate(rows) {
  const charged = rows.filter(r => !notCharged(r) && (r.charge ?? 0) > 0);
  if (!charged.length) return { perWk: 0, last: null };
  const last = Math.max(...charged.map(r => r.wk));
  const recent = charged.filter(r => last - r.wk < 4 && Math.floor(last / 100) === Math.floor(r.wk / 100));
  return { perWk: recent.reduce((a, r) => a + r.charge, 0) / 4, last };
}

/* ── SQEP: every issue, with invoice, money and action ─────────────────── */
function SqepIssues({ rows }) {
  const [status, setStatus] = useState("charged");
  const [issue, setIssue] = useState("");
  const [owner, setOwner] = useState("");
  const [sku, setSku] = useState("");
  const [month, setMonth] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const shown = rows.filter(r =>
    (status === "all" ? true
      : status === "charged" ? !notCharged(r)
      : status === "free" ? notCharged(r)
      : r.status === status && !notCharged(r)) &&
    (!issue || r.rule.key === issue) && (!owner || r.rule.owner === owner) &&
    (!sku || r.sku === sku) && (!month || r.month === month));
  const sum = xs => xs.reduce((a, r) => a + (notCharged(r) ? 0 : r.charge ?? 0), 0);

  // Where the money goes, by issue — over the filtered rows.
  const byIssue = [...shown.reduce((m, r) => {
    const a = m.get(r.rule.key) || { rule: r.rule, rows: [] };
    a.rows.push(r); m.set(r.rule.key, a); return m;
  }, new Map()).values()].map(a => ({
    ...a,
    defects: countDefects(a.rows),
    inv: sum(a.rows.filter(r => r.status === "invoiced")),
    proj: sum(a.rows.filter(r => r.status === "projected")),
    free: countDefects(a.rows.filter(notCharged)),
    rate: runRate(a.rows).perWk,
  })).sort((a, b) => b.inv + b.proj - (a.inv + a.proj) || b.defects - a.defects);

  const issueOpts = uniq(rows.map(r => r.rule.key)).map(k => ({ value: k, label: rows.find(r => r.rule.key === k).rule.issue }));
  const ownerOpts = uniq(rows.map(r => r.rule.owner)).map(k => ({ value: k, label: OWNERS[k] }));
  const months = uniq([...rows].sort((a, b) => b.wk - a.wk).map(r => r.month));

  return (
    <div className="mt-6">
      <h3 className="cc-serif text-base mb-1">Every SQEP issue — invoice, money and what to do</h3>
      <p className="text-[11px] opacity-60 mb-3 max-w-3xl">
        One line per defect Walmart recorded, in Walmart's own words, joined to the Cortina sales order and invoice for the
        PO and to DOT for SKU and ship date. The suggested action, owner and dispute route come from the rules in
        <span className="cc-mono"> src/lib/complianceRules.js</span> — tell Claude where they are wrong.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Select id="sq-status" label="Show" value={status} onChange={v => { setStatus(v); setLimit(PAGE); }} options={[
          { value: "charged", label: "Charged (invoiced + projected)" },
          { value: "invoiced", label: "Invoiced" },
          { value: "projected", label: "Projected" },
          { value: "free", label: "Scored, not charged" },
          { value: "all", label: "Everything" },
        ]} />
        <Select id="sq-issue" label="Issue" value={issue} onChange={v => { setIssue(v); setLimit(PAGE); }} options={[{ value: "", label: "All issues" }, ...issueOpts]} />
        <Select id="sq-owner" label="Owner" value={owner} onChange={v => { setOwner(v); setLimit(PAGE); }} options={[{ value: "", label: "All owners" }, ...ownerOpts]} />
        <Select id="sq-sku" label="SKU" value={sku} onChange={v => { setSku(v); setLimit(PAGE); }} options={[{ value: "", label: "All SKUs" }, ...uniq(rows.map(r => r.sku)).sort().map(s => ({ value: s, label: s }))]} />
        <Select id="sq-month" label="Billing month" value={month} onChange={v => { setMonth(v); setLimit(PAGE); }} options={[{ value: "", label: "All months" }, ...months.map(m => ({ value: m, label: m }))]} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 max-w-3xl">
        <Stat label="Defects" value={F.int(countDefects(shown))} src="one per PO × ticket" />
        <Stat label="Invoiced" value={usd2(sum(shown.filter(r => r.status === "invoiced")))} tone="bad" src="billed by Walmart" />
        <Stat label="Projected" value={usd2(sum(shown.filter(r => r.status === "projected")))} tone="bad" src="not yet invoiced" />
        <Stat label="Scored, not charged" value={F.int(countDefects(shown.filter(notCharged)))} tone={shown.some(notCharged) ? "warn" : undefined} src={'"Applicable for Charge" = N'} />
      </div>

      <div className="overflow-x-auto mb-4">
        <table className="w-full text-[11px] tabular-nums">
          <thead><tr>
            <th className={thead}>Issue (Walmart's words)</th><th className={thead}>Owner</th>
            <th className={thead + " text-right"}>Defects</th><th className={thead + " text-right"}>Invoiced</th>
            <th className={thead + " text-right"}>Projected</th><th className={thead + " text-right"}>Not charged</th>
            <th className={thead + " text-right"}>Recent $/wk</th><th className={thead}>Suggested action</th>
          </tr></thead>
          <tbody>
            {byIssue.map(a => (
              <tr key={a.rule.key} style={{ borderTop: "1px solid #F1E7EC" }} className="align-top">
                <td className="py-1.5 pr-2 font-semibold">{a.rule.issue}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">{a.rule.ownerLabel}</td>
                <td className="py-1.5 pr-2 text-right">{F.int(a.defects)}</td>
                <td className="py-1.5 pr-2 text-right">{a.inv ? usd2(a.inv) : "—"}</td>
                <td className="py-1.5 pr-2 text-right">{a.proj ? usd2(a.proj) : "—"}</td>
                <td className="py-1.5 pr-2 text-right" style={{ color: a.free ? amber : undefined }}>{a.free ? F.int(a.free) : "—"}</td>
                <td className="py-1.5 pr-2 text-right">{a.rate ? usd2(a.rate) : "—"}</td>
                <td className="py-1.5 min-w-[260px] whitespace-normal">{a.rule.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead><tr>
            <th className={thead}>Wk</th><th className={thead}>PO</th><th className={thead}>Cortina SO / invoice</th>
            <th className={thead}>SKU · DC</th><th className={thead}>Walmart's issue</th>
            <th className={thead + " text-right"}>Impact</th><th className={thead}>Owner</th><th className={thead}>Suggested action</th>
          </tr></thead>
          <tbody>
            {shown.slice(0, limit).map((r, i) => {
              const t = sqepTiming(r);
              return (
                <tr key={r.po + "|" + r.type + "|" + r.ticket + "|" + i} style={{ borderTop: "1px solid #F1E7EC" }} className="align-top">
                  <td className="py-1.5 pr-2 whitespace-nowrap" title={"processed " + (r.processed ?? "—")}>{String(r.wk).slice(4)}<div className="opacity-50">{r.month}</div></td>
                  <td className="py-1.5 pr-2 cc-mono whitespace-nowrap">{r.po}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {r.inv ? <>
                      <div className="cc-mono">{r.inv.so ?? "—"} · {r.inv.invoice ?? "no invoice"}</div>
                      <div className="opacity-60">{r.inv.amount != null ? usd2(r.inv.amount) : ""}{r.inv.paidDate ? " · paid " + r.inv.paidDate : r.inv.invoice ? " · unpaid" : ""}</div>
                    </> : <span className="opacity-50">not in NetSuite</span>}
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{r.sku ?? <span className="opacity-50">—</span>} · {r.network} {r.dc}
                    <div className="opacity-50">{r.shipDate ? "DOT ship " + r.shipDate : r.dotStatus ?? ""}</div></td>
                  <td className="py-1.5 pr-2 min-w-[200px] whitespace-normal">{[r.category, r.type, r.subType].filter(Boolean).join(" · ")}
                    {r.ticket && <div className="opacity-50 cc-mono">ticket {r.ticket}</div>}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                    <div className="font-bold" style={{ color: notCharged(r) ? amber : "#C2185B" }}>{notCharged(r) ? "$0" : usd2(r.charge)}</div>
                    <div className="opacity-60" title={t.note}>{t.label}</div>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{r.rule.ownerLabel}</td>
                  <td className="py-1.5 min-w-[220px] max-w-[320px] whitespace-normal" title={r.rule.action}>{firstSentence(r.rule.action)}
                    <div className="opacity-60 mt-0.5">{t.note}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <button onClick={() => setLimit(l => l + PAGE * 3)} className="mt-2 text-[11px] px-3 py-1 rounded-full border" style={{ borderColor: "#E5D9DE" }}>
          Show more ({F.int(shown.length - limit)} not shown)
        </button>
      )}
    </div>
  );
}

/* ── OTIF: every PO that missed, why, the fine and the action ──────────── */
function OtifIssues({ rows, cpc }) {
  const [span, setSpan] = useState("13");
  const [cause, setCause] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const lastWk = rows.length ? Math.max(...rows.map(r => r.wk)) : null;
  const inWindow = r => span === "all" || (Math.floor(lastWk / 100) * 52 + (lastWk % 100)) - (Math.floor(r.wk / 100) * 52 + (r.wk % 100)) < Number(span);
  const shown = rows.filter(r => inWindow(r) && (!cause || r.causes.some(c => c.key === cause)));
  const fine = cases => (cpc != null ? cases * cpc * WMT_OTIF.fineRate : null);

  const byCause = [...shown.flatMap(r => r.causes.map(c => ({ ...c, po: r.po }))).reduce((m, c) => {
    const a = m.get(c.key) || { ...c, pos: new Set(), cases: 0 };
    a.pos.add(c.po); a.cases += c.cases; m.set(c.key, a); return m;
  }, new Map()).values()].sort((a, b) => b.cases - a.cases);
  const causeOpts = uniq(rows.flatMap(r => r.causes.map(c => c.key))).map(k => ({ value: k, label: rows.flatMap(r => r.causes).find(c => c.key === k).cause }));

  return (
    <div className="mt-6">
      <h3 className="cc-serif text-base mb-1">Every PO that missed OTIF — why, the fine and what to do</h3>
      <p className="text-[11px] opacity-60 mb-3 max-w-3xl">
        From Walmart's OTIF PO details joined to DOT's shipments. "Late" compares DOT's ship date with the PO's must-arrive-by
        date. The fine is an estimate (3% of ~{cpc != null ? "$" + cpc.toFixed(2) : "—"}/cs on every non-compliant case); OTIF
        fines are billed separately from SQEP.
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Select id="ot-window" label="Weeks" value={span} onChange={v => { setSpan(v); setLimit(PAGE); }} options={[
          { value: "4", label: "Last 4 OTIF weeks" }, { value: "13", label: "Last 13 (a quarter)" }, { value: "all", label: "All loaded" }]} />
        <Select id="ot-cause" label="Cause" value={cause} onChange={v => { setCause(v); setLimit(PAGE); }} options={[{ value: "", label: "All causes" }, ...causeOpts]} />
      </div>

      <div className="overflow-x-auto mb-4">
        <table className="w-full text-[11px] tabular-nums">
          <thead><tr>
            <th className={thead}>Cause</th><th className={thead}>Owner</th><th className={thead + " text-right"}>POs</th>
            <th className={thead + " text-right"}>Cases</th><th className={thead + " text-right"}>Est. fine</th><th className={thead}>Suggested action</th>
          </tr></thead>
          <tbody>
            {byCause.map(c => (
              <tr key={c.key} style={{ borderTop: "1px solid #F1E7EC" }} className="align-top">
                <td className="py-1.5 pr-2 font-semibold">{c.cause}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">{c.ownerLabel}</td>
                <td className="py-1.5 pr-2 text-right">{F.int(c.pos.size)}</td>
                <td className="py-1.5 pr-2 text-right">{F.int(c.cases)}</td>
                <td className="py-1.5 pr-2 text-right">{fine(c.cases) != null ? usd2(fine(c.cases)) : "—"}</td>
                <td className="py-1.5 min-w-[260px] whitespace-normal">{c.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead><tr>
            <th className={thead}>Wk</th><th className={thead}>PO</th><th className={thead}>Cortina SO / invoice</th>
            <th className={thead}>MABD · DOT ship</th><th className={thead}>SKU</th>
            <th className={thead + " text-right"}>Ordered</th><th className={thead + " text-right"}>Cut</th>
            <th className={thead + " text-right"}>Late</th><th className={thead + " text-right"}>Early</th>
            <th className={thead + " text-right"}>Est. fine</th><th className={thead}>Why · owner · action</th>
          </tr></thead>
          <tbody>
            {shown.slice(0, limit).map(r => (
              <tr key={r.wk + "|" + r.po} style={{ borderTop: "1px solid #F1E7EC" }} className="align-top">
                <td className="py-1.5 pr-2">{String(r.wk).slice(4)}</td>
                <td className="py-1.5 pr-2 cc-mono whitespace-nowrap">{r.po}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">{r.inv ? <span className="cc-mono">{r.inv.so ?? "—"} · {r.inv.invoice ?? "no invoice"}</span> : <span className="opacity-50">not in NetSuite</span>}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">{r.mabd ?? "—"} · {r.dot?.shipDate || <span className="opacity-50">no DOT record</span>}</td>
                <td className="py-1.5 pr-2">{r.dot?.skus || "—"}</td>
                <td className="py-1.5 pr-2 text-right">{F.int(r.ordered)}</td>
                <td className="py-1.5 pr-2 text-right">{r.unfilled ? F.int(r.unfilled) : "—"}</td>
                <td className="py-1.5 pr-2 text-right">{r.late ? F.int(r.late) : "—"}</td>
                <td className="py-1.5 pr-2 text-right">{r.early ? F.int(r.early) : "—"}</td>
                <td className="py-1.5 pr-2 text-right">{fine(r.missed) != null ? usd2(fine(r.missed)) : "—"}</td>
                <td className="py-1.5 min-w-[220px] max-w-[340px] whitespace-normal">
                  {r.causes.map(c => <div key={c.key} title={c.action}><b>{c.cause}</b> · {c.ownerLabel} — {firstSentence(c.action)}</div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <button onClick={() => setLimit(l => l + PAGE * 3)} className="mt-2 text-[11px] px-3 py-1 rounded-full border" style={{ borderColor: "#E5D9DE" }}>
          Show more ({F.int(shown.length - limit)} not shown)
        </button>
      )}
    </div>
  );
}

/* ── Actions: SQEP + OTIF, grouped by owner, ranked by dollars ─────────── */
function ActionsTab({ sqepRows, otifRows, cpc }) {
  const items = [];
  // SQEP: one item per issue rule — charged dollars and the recent weekly rate.
  for (const [key, rs] of sqepRows.reduce((m, r) => m.set(r.rule.key, [...(m.get(r.rule.key) || []), r]), new Map())) {
    const charged = rs.filter(r => !notCharged(r));
    const inv = charged.filter(r => r.status === "invoiced").reduce((a, r) => a + (r.charge ?? 0), 0);
    const proj = charged.filter(r => r.status === "projected").reduce((a, r) => a + (r.charge ?? 0), 0);
    const rate = runRate(rs).perWk;
    if (!charged.length) continue;
    items.push({ src: "SQEP", key, owner: rs[0].rule.owner, title: rs[0].rule.issue, action: rs[0].rule.action, dispute: rs[0].rule.dispute,
      dollars: inv + proj, detail: `${F.int(countDefects(charged))} charged defects · ${usd2(inv)} invoiced · ${usd2(proj)} projected` + (rate ? ` · ~${usd2(rate)}/wk lately` : ""),
      projected: proj });
  }
  // OTIF: last 13 OTIF weeks, one item per cause.
  const lastWk = otifRows.length ? Math.max(...otifRows.map(r => r.wk)) : null;
  const idx = w => Math.floor(w / 100) * 52 + (w % 100);
  const recent = otifRows.filter(r => idx(lastWk) - idx(r.wk) < 13);
  for (const [key, cs] of recent.flatMap(r => r.causes.map(c => ({ ...c, po: r.po }))).reduce((m, c) => m.set(c.key, [...(m.get(c.key) || []), c]), new Map())) {
    const cases = cs.reduce((a, c) => a + c.cases, 0);
    items.push({ src: "OTIF", key, owner: cs[0].owner, title: cs[0].cause, action: cs[0].action,
      dollars: cpc != null ? cases * cpc * WMT_OTIF.fineRate : 0,
      detail: `${F.int(new Set(cs.map(c => c.po)).size)} POs · ${F.int(cases)} cases · last 13 OTIF weeks · est. fine` });
  }
  const owners = [...items.reduce((m, it) => m.set(it.owner, [...(m.get(it.owner) || []), it]), new Map())]
    .map(([owner, its]) => ({ owner, its: its.sort((a, b) => b.dollars - a.dollars), total: its.reduce((a, i) => a + i.dollars, 0) }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="grid gap-4">
      <p className="text-[11px] opacity-60 max-w-3xl">
        Everything that is costing money, grouped by who can fix it and ranked by dollars. SQEP dollars are Walmart's
        (invoiced + projected, all loaded weeks); OTIF dollars are an estimate over the last 13 OTIF weeks. Issues Walmart
        scored but did not charge are left out here — they are on the SQEP tab.
      </p>
      {owners.map(o => (
        <section key={o.owner} className="rounded-xl border p-4" style={{ borderColor: "#E5D9DE" }}>
          <div className="flex flex-wrap items-baseline gap-3 mb-2">
            <h3 className="cc-serif text-base">{OWNERS[o.owner]}</h3>
            <span className="text-[11px] opacity-60">{usd2(o.total)} at stake</span>
          </div>
          <ol className="grid gap-2 list-decimal pl-5">
            {o.its.map(it => (
              <li key={it.src + it.key} className="text-[12px]">
                <span className="text-[10px] px-1.5 py-0.5 rounded mr-1.5" style={{ background: "#F7F1F4" }}>{it.src}</span>
                <b>{it.title}</b> — <b style={{ color: "#C2185B" }}>{usd2(it.dollars)}</b>
                <div className="text-[11px] opacity-70">{it.detail}</div>
                <div className="text-[11px] mt-0.5">{it.action}</div>
                {it.dispute && <div className="text-[11px] opacity-60">Dispute: {it.dispute}{it.projected ? ` — ${usd2(it.projected)} is still projected, so dispute before Walmart's monthly invoice.` : ""}</div>}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {!owners.length && <p className="text-[11px] opacity-60">No charged SQEP defects or OTIF misses loaded.</p>}
    </div>
  );
}

export default function WalmartCompliance() {
  const feeds = useDemandFeeds();
  const extra = useComplianceData();
  const [tab, setTab] = useState(() => (TABS.some(t => "#" + t.id === window.location.hash) ? window.location.hash.slice(1) : "sqep"));
  useEffect(() => { if (window.location.hash.slice(1) !== tab) window.history.replaceState(null, "", "#" + tab); }, [tab]);

  const cpc = useMemo(() => costPerCase(feeds.orders), [feeds.orders]);

  const sqepRows = useMemo(() => (feeds.sqep ?? []).map(r => ({
    ...r,
    rule: sqepRule(r),
    inv: extra.invoiceByPo.get(padPo(r.po)) ?? extra.invoiceByPo.get(padPo(r.oms)) ?? null,
  })), [feeds.sqep, extra.invoiceByPo]);

  const otifRows = useMemo(() => {
    const dot = new Map();
    for (const c of feeds.consignment ?? []) {
      if (c.source !== "consignment") continue;
      const k = padPo(c.po);
      const a = dot.get(k) || { ordered: 0, received: 0, shipDate: "", skus: [] };
      a.ordered += c.ordered; a.received += c.received;
      if ((c.shipDate || "") > a.shipDate) a.shipDate = c.shipDate;
      if (c.sku && !a.skus.includes(c.sku)) a.skus.push(c.sku);
      dot.set(k, a);
    }
    return extra.otifPos
      .filter(o => o.early + o.late + o.unfilled > 0)
      .map(o => {
        const d = dot.get(padPo(o.po)) ?? null;
        const dd = d ? { ...d, skus: d.skus.join("/") } : null;
        return { ...o, missed: o.early + o.late + o.unfilled, dot: dd, causes: otifCauses(o, dd), inv: extra.invoiceByPo.get(padPo(o.po)) ?? null };
      })
      .sort((a, b) => b.wk - a.wk || b.missed - a.missed);
  }, [extra.otifPos, extra.invoiceByPo, feeds.consignment]);

  const loading = feeds.loading || extra.loading;

  return (
    <div className="p-5 cc-sans">
      <header className="mb-4">
        <h1 className="cc-serif text-2xl">Walmart Compliance</h1>
        <p className="text-xs opacity-60 max-w-3xl">
          How Walmart grades and charges us — SQEP (Supplier Quality Excellence Program) charges and OTIF (On-Time In-Full) —
          with every issue tied to its PO and Cortina invoice, Walmart's own reason, the money, and a suggested action.
          Sources: SQEP Total Compliance Table (Uploads 10–11), Retail Link OTIF PO details (Uploads 3–4), DOT Consignment
          Sales History (8), NetSuite / Cortina orders and invoices.
        </p>
      </header>

      <nav className="flex gap-4 border-b mb-4" style={{ borderColor: "#E5D9DE" }} role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className="pb-2 text-sm font-semibold" style={{ borderBottom: tab === t.id ? "3px solid #C2185B" : "3px solid transparent", color: tab === t.id ? "#2D2235" : "#8C7F87" }}>
            {t.label}
          </button>
        ))}
      </nav>

      {loading ? <p className="text-[12px] opacity-60">Loading…</p> : (
        <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#E5D9DE" }}>
          {tab === "sqep" && <>
            <SqepHealth sqep={feeds.sqep} />
            {sqepRows.length > 0 && <SqepIssues rows={sqepRows} />}
          </>}
          {tab === "otif" && <>
            <OtifSummary feeds={feeds} />
            <OtifIssues rows={otifRows} cpc={cpc} />
          </>}
          {tab === "actions" && <ActionsTab sqepRows={sqepRows} otifRows={otifRows} cpc={cpc} />}
        </section>
      )}
      {extra.errors?.length > 0 && <p className="text-[11px] mt-2" style={{ color: "#C2185B" }}>Some data did not load: {extra.errors.join("; ")}</p>}
    </div>
  );
}
