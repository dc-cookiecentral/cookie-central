#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Render smoke test for /demand-planner.
//
//   node scripts/smoke-render.mjs
//
// WHY THIS EXISTS. On Aug 24 2026 the page shipped to production blank — a
// pink screen. The cause was one line:
//
//   const latestDataWk = Math.max(0, ...series.flatMap(...));   // ← above
//   const series = useMemo(...);                                //   `series`
//
// A `const` is hoisted but not initialised, so reading it above its
// declaration is a temporal dead zone error that throws on EVERY render. It
// compiled. It bundled. It passed a string-grep of the deployed artifact —
// the strings were all present, in code that could never run.
//
// The lesson is narrow and worth keeping: verifying that a bundle CONTAINS
// something is not verifying that it RUNS. This renders the component for
// real and fails loudly if it throws.
//
// It stubs `useDemandFeeds` rather than hitting Supabase, and covers every
// tab plus the empty-feed path the page takes before the first upload — the
// TDZ bug was in code common to all of them, but a data-shape bug would not
// be, so all nine combinations are checked (live, live + a DOT on-hand reading, empty — × three tabs).
// ─────────────────────────────────────────────────────────────────────────
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const LIVE_SHAPE = {
  loading: false, error: null,
  pos: [{ wk: 202628, sku: 'WC', units: 4616, dollars: 22414.78, instock: 0.9875,
          traited: 2657, storesSelling: null, oh: 24137, whOh: 500, _wmtFcstDetail: 5416.19 }],
  forecasts: [{ snap: 202628, target: 202630, sku: 'WC', units: 5629, source: 'store' }],
  dotService: [{ wk: 202625, ordered: 84, cut: 42, pos: 2 }],
  dotDeliveries: [{ wk: 202625, sku: 'WC', delivered: 0, ordered: 84, cut: 42 }],
  otif: [{ wk: 202627, ordered: 1155, onTime: 1071, unfilled: 42, pos: 40, otif: 0.9273 }],
  orders: [{ wk: 202628, sku: 'WC', req: 168, dlv: 126, rev: 4656.96, cuts: 0 }],
  sources: { pos: 'live', forecasts: 'live', dotService: 'live', otif: 'live', orders: 'live', dotDeliveries: 'live' },
  asOf: 202628,
};
// Live demand plus a DOT Inventory Snapshot reading — the banner and the
// Tracker's DOT rows take a different branch once `dotOnHand` is present.
const LIVE_DOT_SHAPE = {
  ...LIVE_SHAPE,
  dotOnHand: [
    { wk: 202639, sku: 'WC', cases: 1531, committed: 336, expired: 246, expiring60: 229,
      earliestExpiry: '2026-12-23', casesPerPallet: 189, snapshotDate: '2026-10-27' },
    { wk: 202639, sku: 'BC', cases: 1257, committed: 228, expired: 0, expiring60: 0,
      earliestExpiry: '2027-03-01', casesPerPallet: 96, snapshotDate: '2026-10-27' },
  ],
  // DOT Consignment Sales History, as useDemandFeeds shapes it (per PO × SKU).
  // BC is cut hard (30 of 84) and must raise an action; WC's re-placed PO
  // shipped in full and must not.
  consignment: [
    { po: '0112957696', sku: 'WC', wk: 202639, shipDate: '2026-10-28', ordered: 42, received: 42, lines: 2, cut: 0, replaced: true },
    { po: '0120830468', sku: 'BC', wk: 202639, shipDate: '2026-10-29', ordered: 84, received: 54, lines: 1, cut: 30, replaced: false },
    // Cut before it reached DOT — OTIF-only (useDemandFeeds.shapePreDotCuts).
    { po: '0116160311', sku: 'CCF', wk: 202636, shipDate: '2026-10-06', ordered: 21, received: 0, lines: 0, cut: 21, replaced: false, source: 'otif' },
  ],
  dotService: [{ wk: 202625, ordered: 84, cut: 42, pos: 2, source: 'order_history' },
               { wk: 202639, ordered: 126, cut: 30, pos: 2, source: 'consignment' }],
  dotDeliveries: [{ wk: 202625, sku: 'WC', delivered: 0, ordered: 84, cut: 42, source: 'order_history' },
                  { wk: 202639, sku: 'WC', delivered: 42, ordered: 42, cut: 0, source: 'consignment' },
                  { wk: 202639, sku: 'BC', delivered: 54, ordered: 84, cut: 30, source: 'consignment' }],
  // DOT open orders, as useDemandFeeds.shapeOpenOrders returns them. BC's
  // not-yet-picked 1,100 cs exceed its 1,029 sellable (1,257 − 228) → cut risk.
  openOrders: {
    lastSeen: '2026-11-05T18:00:00Z', shippedSince: 0,
    lines: [
      { order: '1188106', sku: 'BC', po: '3885630856', status: 'Open', wk: 202641, requested: '2026-11-09', dest: 'Walmart/Dry #7036', cases: 1100, pastDue: false, uncommitted: true },
      { order: '155546', sku: 'PBG', po: '0122306679', status: 'Picking', wk: 202641, requested: '2026-11-06', dest: 'Walmart/Gdc #6064', cases: 21, pastDue: false, uncommitted: false },
    ],
  },
  sources: { ...LIVE_SHAPE.sources, dot: 'live', consignment: 'live', openOrders: 'live' },
};
// Everything null — what the page sees before the first upload, when every
// series falls back to SEED.
const EMPTY_SHAPE = {
  loading: false, error: null, pos: null, forecasts: null, dotService: null,
  dotDeliveries: null, otif: null, orders: null,
  sources: { pos: 'seed', forecasts: 'seed', dotService: 'seed', otif: 'seed', orders: 'seed', dotDeliveries: 'seed' },
  asOf: null,
};

// Rendering is not enough for the actions panel (B2): a flag that silently
// stops firing still renders. Each shape's Summary tab must carry these lines.
// None depends on today's date except "Retail Link POS is", which the live
// shapes' week-202628 POS trips on any date after mid-August 2026.
const EXPECT_SUMMARY = {
  live: ['This week’s actions', 'Retail Link POS is', 'No DOT Inventory Snapshot uploaded', 'Case pack is changing'],
  dot: ['Decide what to do with 246 expired cases at DOT (WC 246)',
        'WC: 229 good cases expire within 60 days (15% of good stock, first Dec 23)',
        'BC: DOT cut 30 of 84 cs Walmart ordered (36%), last 4 ship weeks',
        'By SKU · Consignment Sales History',
        'BC: 1,100 cs on open DOT orders not yet picked vs 1,029 sellable at DOT — 71 cs short, cut risk',
        'DOT open orders — what ships next',
        'Includes 1 PO (21 cs) Walmart ordered that never reached DOT'],
  empty: ['This week’s actions', 'No live Retail Link POS', 'No DOT Inventory Snapshot uploaded'],
};

// The bundle must live inside the repo so node_modules resolves.
const dir = mkdtempSync(join(process.cwd(), '.smoke-'));
let failures = 0;
try {
  const page = readFileSync('src/pages/DemandPlanner.jsx', 'utf8');
  writeFileSync(join(dir, 'main.jsx'), `
    import React from 'react';
    import { renderToString } from 'react-dom/server';
    import { writeFileSync } from 'node:fs';
    import P from './page.jsx';
    try {
      const html = renderToString(React.createElement(P));
      writeFileSync(${JSON.stringify(join(dir, 'out.html'))}, html);
      console.log('OK ' + html.length);
    }
    catch (e) { console.log('THREW ' + e.message); process.exitCode = 1; }
  `);

  for (const [shapeName, shape] of [['live', LIVE_SHAPE], ['dot', LIVE_DOT_SHAPE], ['empty', EMPTY_SHAPE]]) {
    for (const tab of ['summary', 'tracker', 'sources']) {
      const stubbed = page
        .replace('import { useDemandFeeds } from "../hooks/useDemandFeeds";',
                 `const __F=${JSON.stringify(shape)};function useDemandFeeds(){return __F;}`)
        .replace('useState("summary")', `useState("${tab}")`)
        // The copy lives in a temp dir, so any other `../x` import must point
        // back at src/ — otherwise adding an import to the page breaks the test.
        .replace(/from "\.\.\//g, `from "${join(process.cwd(), 'src')}/`);
      writeFileSync(join(dir, 'page.jsx'), stubbed);
      execFileSync('npx', ['esbuild', join(dir, 'main.jsx'), '--bundle', '--format=cjs',
        '--platform=node', '--loader:.jsx=jsx', '--jsx=automatic',
        `--outfile=${join(dir, 'out.cjs')}`, '--log-level=error'], { stdio: 'pipe' });
      const out = execFileSync('node', [join(dir, 'out.cjs')], { encoding: 'utf8' }).trim();
      const missing = out.startsWith('OK') && tab === 'summary'
        ? EXPECT_SUMMARY[shapeName].filter(s => !readFileSync(join(dir, 'out.html'), 'utf8').includes(s))
        : [];
      const ok = out.startsWith('OK') && !missing.length;
      if (!ok) failures++;
      console.log(`  ${ok ? '✅' : '❌'} ${shapeName.padEnd(5)} / ${tab.padEnd(8)} ${out}` +
        (missing.length ? `\n      missing: ${missing.join(' | ')}` : ''));
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} render failure(s)` : '\nAll render paths OK');
process.exit(failures ? 1 : 0);
