import { useState } from 'react';
import { WEEKLY_REPORTS, ALERTS } from '../data/weeklyReports';

const usd = (n) => (n == null ? '--' : '$' + Math.round(n).toLocaleString());
const qty = (n) => (n == null ? '--' : n.toLocaleString());

// Walmart Retail Link weekly readout (Bentonville Merchants email). Structured
// for EOS Level 10: Scorecard KPIs, Findings, To-Dos, Rocks, Issues List.
// Seed data for now — the email parser (BUILD_PLAN 8.2) will replace it.

function WeekTab({ rpt, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-md text-[11px] font-bold text-left',
        active ? 'border-2 border-pk bg-pink-50 text-pk' : 'border border-lt bg-cd text-dk hover:text-pk',
      ].join(' ')}
    >
      {rpt.wk}
      <div className={`text-[8px] ${active ? 'text-pk' : 'text-gr'}`}>{rpt.dt}</div>
    </button>
  );
}

function SectionLabel({ children, tone = 'pk' }) {
  const color = tone === 'eos' ? 'text-[#6D28D9]' : 'text-pk';
  return (
    <div className={`text-[8px] font-bold uppercase tracking-wider ${color} mb-1.5`}>
      {children}
    </div>
  );
}

// Data pulled from the 3 .xlsx attachments (parsers/weeklyAttachments.js) —
// markdowns, the forward supply plan, and per-PO OTIF detail. None of this is
// in the email body, so it only shows when a week has parsed attachment data.
function AttachmentDetail({ d }) {
  const cell = 'px-1.5 py-1 whitespace-nowrap';
  return (
    <div className="px-[18px] pb-3 space-y-2">
      <SectionLabel>From attachments — parsed</SectionLabel>

      {/* Markdowns */}
      {d.markdown && (
        <div className="bg-bg border border-lt rounded-lg px-3 py-2">
          <div className="flex items-baseline justify-between mb-1 flex-wrap gap-1">
            <span className="text-[10px] font-bold text-dk">Markdowns</span>
            <span className="text-[9px] text-md">
              LW <b className="text-dk">{usd(d.markdown.lwTotal)}</b> · YTD <b className="text-dk">{usd(d.markdown.ytdTotal)}</b>
            </span>
          </div>
          <div className="flex gap-4 flex-wrap text-[9px] text-md">
            {d.markdown.items.map((it) => (
              <span key={it.desc}>
                {it.desc}: {usd(it.lw)} LW / {usd(it.ytd)} YTD
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Forward supply plan */}
      {d.supplyPlan && (
        <div className="bg-bg border border-lt rounded-lg px-3 py-2 overflow-x-auto">
          <div className="text-[10px] font-bold text-dk mb-1">Supply plan — forward orders (cases)</div>
          <table className="w-full text-[9px] border-collapse">
            <thead>
              <tr className="text-gr">
                <th className={cell + ' text-left'}>SKU</th>
                {d.supplyPlan.months.map((m) => (
                  <th key={m} className={cell + ' text-right'}>{m}</th>
                ))}
                <th className={cell + ' text-right'}>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.supplyPlan.items.map((it) => (
                <tr key={it.desc} className="border-t border-lt">
                  <td className={cell + ' text-left font-semibold text-dk'}>{it.desc}</td>
                  {it.byMonth.map((v, i) => (
                    <td key={i} className={cell + ' text-right text-md'}>{qty(v)}</td>
                  ))}
                  <td className={cell + ' text-right font-bold text-dk'}>{qty(it.total)}</td>
                </tr>
              ))}
              {d.supplyPlan.grandTotal && (
                <tr className="border-t border-lt">
                  <td className={cell + ' text-left font-bold text-gr'}>Grand Total</td>
                  {d.supplyPlan.grandTotal.byMonth.map((v, i) => (
                    <td key={i} className={cell + ' text-right text-gr'}>{qty(v)}</td>
                  ))}
                  <td className={cell + ' text-right font-bold text-gr'}>{qty(d.supplyPlan.grandTotal.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* OTIF per-PO late detail */}
      {d.otif && (
        <div className="bg-bg border border-lt rounded-lg px-3 py-2 overflow-x-auto">
          <div className="flex items-baseline justify-between mb-1 flex-wrap gap-1">
            <span className="text-[10px] font-bold text-dk">OTIF {d.otif.label} — late PO detail</span>
            <span className="text-[9px] text-md">
              {qty(d.otif.ordered)} ordered · {qty(d.otif.onTime)} on-time ·{' '}
              <b className="text-red-600">{qty(d.otif.late)} late</b> ({d.otif.pct}%)
            </span>
          </div>
          <table className="w-full text-[9px] border-collapse">
            <thead>
              <tr className="text-gr">
                <th className={cell + ' text-left'}>Host PO</th>
                <th className={cell + ' text-left'}>WM Wk</th>
                <th className={cell + ' text-left'}>MABD</th>
                <th className={cell + ' text-right'}>Cases late</th>
              </tr>
            </thead>
            <tbody>
              {d.otif.latePos.map((p) => (
                <tr key={p.hostPo} className="border-t border-lt">
                  <td className={cell + ' text-left font-mono text-md'}>{p.hostPo}</td>
                  <td className={cell + ' text-left text-md'}>{p.week}</td>
                  <td className={cell + ' text-left text-md'}>{p.mabd}</td>
                  <td className={cell + ' text-right font-bold text-red-600'}>{qty(p.late)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function WeeklyReport() {
  const [wk, setWk] = useState(WEEKLY_REPORTS[0].wk);
  const rpt = WEEKLY_REPORTS.find((r) => r.wk === wk) ?? WEEKLY_REPORTS[0];

  return (
    <div>
      <h1 className="text-xl font-bold text-dk mb-3">Weekly Report</h1>

      {/* Week selector + manual refresh (refresh is live once the email parser ships) */}
      <div className="flex gap-1.5 mb-3 items-stretch">
        {WEEKLY_REPORTS.map((r) => (
          <WeekTab key={r.wk} rpt={r} active={wk === r.wk} onClick={() => setWk(r.wk)} />
        ))}
        <button
          title="Manual refresh — live once the Bentonville Merchants email parser ships (Phase 1, 8.2)"
          className="ml-auto self-center bg-gradient-to-br from-pk to-pm text-white px-3 py-1.5 rounded-md text-[9px] font-bold hover:opacity-90"
        >
          Check for new
        </button>
      </div>

      <div className="bg-cd border border-lt rounded-xl">
        {/* Header */}
        <div className="px-[18px] pt-3.5 pb-2">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="text-xl font-black text-dk">{rpt.wk}</div>
            {rpt.parsed ? (
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-semibold bg-emerald-100 text-emerald-700">
                Parsed from email ✓
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-semibold bg-[#EDE9FE] text-[#6D28D9]">
                Auto from email
              </span>
            )}
            <span className="text-[8px] text-gr">Walmart only. Kroger reporting source TBD.</span>
          </div>
          <div className="text-[8px] text-gr">
            From: {rpt.src} | {rpt.subj} | Mon 9:30 AM CT
          </div>
          <div className="mt-1.5 px-2.5 py-1.5 bg-bg rounded-md text-[11px] font-semibold text-dk">
            {rpt.hl}
          </div>
          {rpt.attachments?.length > 0 && (
            <div className="mt-1.5 text-[8px] text-gr leading-relaxed">
              <span className="font-semibold text-md uppercase tracking-wider">Attached reports</span>
              <span className="italic"> — detail (supply plan, OTIF, SQEP) parsed separately, next step:</span>
              <ul className="mt-0.5 space-y-px">
                {rpt.attachments.map((a) => (
                  <li key={a} className="font-mono text-[8px] text-md">• {a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Scorecard KPIs */}
        <div className="px-[18px] pb-3 flex gap-1.5 flex-wrap">
          {rpt.kpis.map((k, i) => (
            <div key={i} className="bg-cd border border-lt rounded-lg px-3 py-2 flex-1 min-w-[80px]">
              <div className="text-[8px] text-gr font-semibold uppercase">{k.l}</div>
              <div className="text-base font-extrabold text-dk mt-0.5">{k.v}</div>
              {k.d && (
                <div className="text-[9px] font-semibold mt-px" style={{ color: k.c }}>
                  {k.d}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Attachment-derived detail (markdowns, supply plan, OTIF PO detail) */}
        {rpt.detail && <AttachmentDetail d={rpt.detail} />}

        {/* Findings */}
        {rpt.findings.length > 0 && (
          <div className="px-[18px] pb-3">
            <SectionLabel>Findings</SectionLabel>
            {rpt.findings.map((f, i) => (
              <div key={i} className="mb-1.5 bg-bg border border-lt rounded-lg px-3 py-2">
                <div className="flex gap-1.5 mb-0.5">
                  <span className="font-extrabold text-pk font-mono text-[10px]">{f.n}</span>
                  <span className="font-bold text-[11px] text-dk">{f.t}</span>
                </div>
                <div className="text-[10px] text-md mb-1">{f.d}</div>
                <div className="flex gap-1.5 text-[8px] flex-wrap">
                  <span className="bg-cd px-1.5 py-0.5 rounded border border-lt">Action: {f.act}</span>
                  <span className="bg-cd px-1.5 py-0.5 rounded border border-lt">Owner: {f.own}</span>
                  <span className="bg-cd px-1.5 py-0.5 rounded border border-lt text-pk font-bold">Due: {f.due}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* EOS To-Dos */}
        {rpt.todos.length > 0 && (
          <div className="px-[18px] pb-3">
            <SectionLabel>EOS To-Dos</SectionLabel>
            <div className="bg-dk rounded-lg px-3 py-2">
              {rpt.todos.map((td, i) => (
                <div
                  key={i}
                  className={`flex gap-2 py-1 ${i < rpt.todos.length - 1 ? 'border-b border-[#3D2D4D]' : ''}`}
                >
                  <span className="text-[9px] font-bold text-pk min-w-[50px]">{td.dt}</span>
                  <span className="text-[9px] text-[#E8E0F0]">{td.t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The email feed gives the scorecard; Findings/To-Dos are the human/AI L10 layer. */}
        {rpt.findings.length === 0 && rpt.todos.length === 0 && (
          <div className="px-[18px] pb-3">
            <div className="bg-bg border border-dashed border-lt rounded-md px-2.5 py-1.5 text-[9px] text-gr italic">
              Scorecard parsed from the email. Findings &amp; EOS To-Dos are added during the L10
              meeting (or by the Phase-2 AI agent) — they aren&apos;t in the email body.
            </div>
          </div>
        )}

        {/* EOS Rocks (placeholder until quarterly planning) */}
        <div className="px-[18px] pb-2.5">
          <SectionLabel tone="eos">EOS Rocks (placeholder)</SectionLabel>
          <div className="bg-[#FAF5FF] rounded-md px-2.5 py-1.5 border border-[#EDE9FE] text-[#6D28D9] text-[9px]">
            Set during quarterly planning.
          </div>
        </div>

        {/* EOS Issues List (from Alerts engine once live) */}
        <div className="px-[18px] pb-2.5">
          <SectionLabel tone="eos">EOS Issues List</SectionLabel>
          <div className="bg-[#FAF5FF] rounded-md px-2.5 py-1.5 border border-[#EDE9FE] text-[9px]">
            {ALERTS.map((a, i) => (
              <div key={i} className="flex gap-1 py-px text-md">
                <span
                  className="w-1 h-1 rounded-full mt-1 flex-shrink-0"
                  style={{ background: a.s === 'crit' ? '#EF4444' : '#F59E0B' }}
                />
                {a.m}
              </div>
            ))}
            <div className="mt-0.5 text-[8px] text-gr italic">IDS in L10. Top 3. Solved = To-Do.</div>
          </div>
        </div>

        {/* Phase 3 note */}
        <div className="px-[18px] pb-2.5">
          <div className="bg-[#F0F9FF] rounded-md px-2.5 py-1.5 border border-dashed border-[#93C5FD] text-[9px] text-[#1E40AF] flex gap-1.5 items-start">
            <span className="font-bold flex-shrink-0">Phase 3</span>
            <div>
              Slack integration: owners receive notifications on assignments and changes, tied to login
              credentials.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
