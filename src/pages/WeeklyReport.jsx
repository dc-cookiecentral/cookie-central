import { useState, Fragment } from 'react';
import { useWeeklyReports } from '../hooks/useWeeklyReports';
import { useAlerts } from '../hooks/useAlerts';

const usd = (n) => (n == null ? '--' : '$' + Math.round(n).toLocaleString());
const qty = (n) => (n == null ? '--' : n.toLocaleString());

// The Weekly Report is, by definition, the Walmart Retail Link readout from the
// Walmart broker — Bentonville Merchants (Blayn Turner). It is NOT Cortina /
// Harshita data. Attribution is canonical: if a row's source_email isn't a
// Bentonville address (e.g. a mis-tagged agent ingest), we fall back to Blayn's.
const BROKER = {
  org: 'Bentonville Merchants',
  role: 'Walmart Broker',
  contact: 'Blayn Turner',
  email: 'blayn@bentonvillemerchants.com',
};
const brokerEmail = (rpt) => (/bentonville/i.test(rpt?.src || '') ? rpt.src : BROKER.email);

// Per-section provenance chip. tone 'wm' = straight from the Walmart Retail Link
// email/attachments; tone 'cc' = Cookie Central's own derived/analysis layer.
function SourceTag({ children, tone = 'wm' }) {
  const cls =
    tone === 'cc'
      ? 'bg-[#EDE9FE] text-[#6D28D9] border-[#DDD6FE]'
      : 'bg-blue-50 text-blue-700 border-blue-200';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[7px] font-semibold ${cls}`}>
      <span className="opacity-70 uppercase tracking-wider">Source</span> {children}
    </span>
  );
}

// Map a raw attachment filename to a human report name + a one-line summary of
// what it contains, so the page shows meaning instead of just a filename.
function describeAttachment(filename) {
  const f = String(filename).toLowerCase();
  if (/supply plan/.test(f))
    return { name: 'Forward Supply Plan', contents: 'Forward case orders by SKU, by month' };
  if (/otif/.test(f))
    return { name: 'OTIF Store Performance', contents: 'Per-PO on-time / in-full delivery detail' };
  if (/markdown/.test(f))
    return { name: 'Markdown Detail', contents: 'Markdown $ by SKU — last week and YTD' };
  if (/scorecard/.test(f))
    return { name: 'Vendor Scorecard', contents: 'Sales, inventory & margin metrics by period' };
  if (/wk\s*\d|dirty cookie/.test(f))
    return { name: 'Weekly Sales Report', contents: 'POS sales, in-stock %, units/store/week, on-hand by SKU' };
  return { name: String(filename).replace(/\.xlsx?$/i, ''), contents: 'Walmart Retail Link export' };
}

const isImageName = (name) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(name || ''));

// Best-effort label for a Retail Link screenshot. Filenames are usually generic
// (image001.png …), so we fall back to the typical email order; if a name does
// carry a keyword (otif/sqep/sales) we honour it.
function imageLabel(name, i) {
  const n = String(name || '').toLowerCase();
  if (/sqep/.test(n)) return 'SQEP Compliance';
  if (/otif/.test(n) && /(l4w|l4|4\s*w|4wk|last.?4)/.test(n)) return 'OTIF — Last 4 Weeks';
  if (/otif/.test(n)) return 'OTIF Performance';
  if (/(sales|pos|trend|velocity|performance)/.test(n)) return 'Sales Performance';
  const seq = ['OTIF — Week', 'OTIF — Last 4 Weeks', 'SQEP Compliance', 'Sales Performance'];
  return seq[i] || `Retail Link screenshot ${i + 1}`;
}

// Renders the email's Walmart Retail Link screenshots inline (click any to open
// full size). Replaces the old bare-filename listing for image attachments.
function ImageGallery({ images }) {
  return (
    <div className="px-[18px] pb-3">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <SectionLabel>Retail Link screenshots ({images.length})</SectionLabel>
        <SourceTag>Walmart Retail Link via {BROKER.org}</SourceTag>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {images.map((img, i) => (
          <figure key={img.url || img.name || i} className="bg-bg border border-lt rounded-lg overflow-hidden">
            <a href={img.url} target="_blank" rel="noreferrer" title="Click to open full size">
              <img
                src={img.url}
                alt={imageLabel(img.name, i)}
                loading="lazy"
                className="w-full h-auto block bg-white max-h-[420px] object-contain"
              />
            </a>
            <figcaption className="px-2.5 py-1.5 border-t border-lt">
              <div className="text-[10px] font-bold text-dk">{imageLabel(img.name, i)}</div>
              <div className="text-[7px] text-gr font-mono truncate" title={img.name}>{img.name}</div>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="mt-1 text-[7px] text-gr italic">
        Labels are inferred from attachment order — click any image to view full size.
      </div>
    </div>
  );
}

// Format a scorecard value by inferring its kind from the metric label.
function fmtScore(label, v) {
  if (v == null) return '--';
  const l = label.toLowerCase();
  if (l.includes('%') || l.includes('percent') || l.includes('instock'))
    return (v <= 1 ? v * 100 : v).toFixed(2) + '%';
  if (l.includes('units')) return Math.round(v).toLocaleString();
  if (/dollar|sales|cost|inventory|ships|margin \$|aur|mumd dollars|on hand|on order/.test(l)) {
    const dp = Math.abs(v) < 100 && v !== 0 ? 2 : 0;
    return '$' + v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 }); // turns, GMROII, WOS
}

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
  const [scOpen, setScOpen] = useState(false);
  return (
    <div className="px-[18px] pb-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <SectionLabel>From attachments — parsed</SectionLabel>
        <SourceTag>Walmart Retail Link attachments via {BROKER.org}</SourceTag>
      </div>

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

      {/* Vendor scorecard — collapsible (multi-period, many metrics) */}
      {d.scorecard && (
        <div className="bg-bg border border-lt rounded-lg px-3 py-2">
          <button onClick={() => setScOpen((o) => !o)} className="w-full flex items-center justify-between text-left gap-2">
            <span className="text-[10px] font-bold text-dk">
              {scOpen ? '▾' : '▸'} Vendor Scorecard — #{d.scorecard.vendor}
            </span>
            <span className="text-[8px] text-gr">
              {d.scorecard.sections.reduce((n, s) => n + s.metrics.length, 0)} metrics · LY not yet populated (year 1)
            </span>
          </button>
          {scOpen && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[9px] border-collapse">
                <thead>
                  <tr className="text-gr">
                    <th className={cell + ' text-left'}>Metric</th>
                    {d.scorecard.periods.map((p) => (
                      <th key={p} className={cell + ' text-right'}>{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.scorecard.sections.map((s) => (
                    <Fragment key={s.title}>
                      <tr>
                        <td
                          colSpan={d.scorecard.periods.length + 1}
                          className="px-1.5 pt-2 pb-0.5 text-[8px] font-bold uppercase tracking-wider text-pk"
                        >
                          {s.title}
                        </td>
                      </tr>
                      {s.metrics.map((m) => (
                        <tr key={m.label} className="border-t border-lt">
                          <td className={cell + ' text-left text-md'}>{m.label}</td>
                          {m.values.map((v, i) => (
                            <td key={i} className={cell + ' text-right text-dk'}>{fmtScore(m.label, v)}</td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WeeklyReport() {
  const { reports } = useWeeklyReports();
  // `selected` is null until the user clicks a tab, so the view defaults to the
  // newest week (reports[0]) and follows it as the live table loads — WK17 shows
  // on arrival without overriding a manual selection.
  const [selected, setSelected] = useState(null);
  const wk = selected ?? reports[0]?.wk;
  const rpt = reports.find((r) => r.wk === wk) ?? reports[0];
  const { alerts } = useAlerts();

  if (!rpt) return null;

  // Image attachments (with stored URLs) render as a gallery; spreadsheet/file
  // attachments stay as descriptive cards. Image *filenames* with no stored URL
  // yet (a pre-image-support poll) surface as a "pending download" note.
  const images = rpt.images ?? [];
  const fileAttachments = (rpt.attachments ?? []).filter((a) => !isImageName(a));
  const pendingImageFiles =
    images.length === 0 ? (rpt.attachments ?? []).filter(isImageName) : [];

  return (
    <div>
      <h1 className="text-xl font-bold text-dk mb-3">Weekly Report</h1>

      {/* Week selector + manual refresh (refresh is live once the email parser ships) */}
      <div className="flex gap-1.5 mb-3 items-stretch">
        {reports.map((r) => (
          <WeekTab key={r.wk} rpt={r} active={wk === r.wk} onClick={() => setSelected(r.wk)} />
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
            From: <span className="font-semibold text-md">{BROKER.org}</span> ({BROKER.role})
            {' · '}{BROKER.contact} &lt;{brokerEmail(rpt)}&gt; | {rpt.subj} | Mon 9:30 AM CT
          </div>
          <div className="mt-1.5 px-2.5 py-1.5 bg-bg rounded-md text-[11px] font-semibold text-dk">
            {rpt.hl}
          </div>
          {pendingImageFiles.length > 0 && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-[8px] text-amber-800">
              {pendingImageFiles.length} screenshot{pendingImageFiles.length === 1 ? '' : 's'} on this
              email aren&apos;t downloaded yet ({pendingImageFiles.join(', ')}). Re-run the Gmail agent
              on this week to fetch + render them.
            </div>
          )}

          {fileAttachments.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[8px] font-semibold text-md uppercase tracking-wider">
                  Attached reports ({fileAttachments.length})
                </span>
                <SourceTag>Walmart Retail Link via {BROKER.org}</SourceTag>
              </div>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {fileAttachments.map((a) => {
                  const meta = describeAttachment(a);
                  return (
                    <div key={a} className="bg-bg border border-lt rounded-lg px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-dk">{meta.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[7px] font-semibold ${
                            rpt.detail
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-[#EDE9FE] text-[#6D28D9]'
                          }`}
                        >
                          {rpt.detail ? 'Parsed ✓' : 'Pending parse'}
                        </span>
                      </div>
                      <div className="text-[8px] text-md mt-0.5">{meta.contents}</div>
                      <div className="text-[7px] text-gr font-mono mt-0.5 truncate" title={a}>
                        {a}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Scorecard KPIs */}
        <div className="px-[18px] pb-1.5 flex items-center gap-2 flex-wrap">
          <SectionLabel>Scorecard KPIs</SectionLabel>
          <SourceTag>Walmart Retail Link via {BROKER.org}</SourceTag>
        </div>
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

        {/* Retail Link screenshots (OTIF / SQEP / sales charts) rendered inline */}
        {images.length > 0 && <ImageGallery images={images} />}

        {/* Attachment-derived detail (markdowns, supply plan, OTIF PO detail) */}
        {rpt.detail && <AttachmentDetail d={rpt.detail} />}

        {/* Findings */}
        {rpt.findings.length > 0 && (
          <div className="px-[18px] pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <SectionLabel>Findings</SectionLabel>
              <SourceTag tone="cc">Cookie Central — L10 analysis</SourceTag>
            </div>
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
            <div className="flex items-center gap-2 flex-wrap">
              <SectionLabel>EOS To-Dos</SectionLabel>
              <SourceTag tone="cc">Cookie Central — L10 analysis</SourceTag>
            </div>
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
          <div className="flex items-center gap-2 flex-wrap">
            <SectionLabel tone="eos">EOS Issues List</SectionLabel>
            <SourceTag tone="cc">Cookie Central alerts engine</SourceTag>
          </div>
          <div className="bg-[#FAF5FF] rounded-md px-2.5 py-1.5 border border-[#EDE9FE] text-[9px]">
            {alerts.length === 0 && (
              <div className="text-[9px] text-gr italic">No live issues.</div>
            )}
            {alerts.slice(0, 8).map((a) => (
              <div key={a.id} className="flex gap-1 py-px text-md">
                <span
                  className="w-1 h-1 rounded-full mt-1 flex-shrink-0"
                  style={{ background: a.severity === 'crit' ? '#EF4444' : '#F59E0B' }}
                />
                {a.message}
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
