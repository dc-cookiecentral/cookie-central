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
// be, so all six combinations are checked.
// ─────────────────────────────────────────────────────────────────────────
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const LIVE_SHAPE = {
  loading: false, error: null,
  pos: [{ wk: 202628, sku: 'WC', units: 4616, dollars: 22414.78, instock: 0.9875,
          traited: 2657, storesSelling: null, oh: 24137, _wmtFcstDetail: 5416.19 }],
  forecasts: [{ snap: 202628, target: 202630, sku: 'WC', units: 5629, source: 'store' }],
  dotService: [{ wk: 202625, ordered: 84, cut: 42, pos: 2 }],
  dotDeliveries: [{ wk: 202625, sku: 'WC', delivered: 0, ordered: 84, cut: 42 }],
  otif: [{ wk: 202627, ordered: 1155, onTime: 1071, unfilled: 42, pos: 40, otif: 0.9273 }],
  orders: [{ wk: 202628, sku: 'WC', req: 168, dlv: 126, rev: 4656.96, cuts: 0 }],
  sources: { pos: 'live', forecasts: 'live', dotService: 'live', otif: 'live', orders: 'live', dotDeliveries: 'live' },
  asOf: 202628,
};
// Everything null — what the page sees before the first upload, when every
// series falls back to SEED.
const EMPTY_SHAPE = {
  loading: false, error: null, pos: null, forecasts: null, dotService: null,
  dotDeliveries: null, otif: null, orders: null,
  sources: { pos: 'seed', forecasts: 'seed', dotService: 'seed', otif: 'seed', orders: 'seed', dotDeliveries: 'seed' },
  asOf: null,
};

// The bundle must live inside the repo so node_modules resolves.
const dir = mkdtempSync(join(process.cwd(), '.smoke-'));
let failures = 0;
try {
  const page = readFileSync('src/pages/DemandPlanner.jsx', 'utf8');
  writeFileSync(join(dir, 'main.jsx'), `
    import React from 'react';
    import { renderToString } from 'react-dom/server';
    import P from './page.jsx';
    try { console.log('OK ' + renderToString(React.createElement(P)).length); }
    catch (e) { console.log('THREW ' + e.message); process.exitCode = 1; }
  `);

  for (const [shapeName, shape] of [['live', LIVE_SHAPE], ['empty', EMPTY_SHAPE]]) {
    for (const tab of ['summary', 'tracker', 'sources']) {
      const stubbed = page
        .replace('import { useDemandFeeds } from "../hooks/useDemandFeeds";',
                 `const __F=${JSON.stringify(shape)};function useDemandFeeds(){return __F;}`)
        .replace('useState("summary")', `useState("${tab}")`);
      writeFileSync(join(dir, 'page.jsx'), stubbed);
      execFileSync('npx', ['esbuild', join(dir, 'main.jsx'), '--bundle', '--format=cjs',
        '--platform=node', '--loader:.jsx=jsx', '--jsx=automatic',
        `--outfile=${join(dir, 'out.cjs')}`, '--log-level=error'], { stdio: 'pipe' });
      const out = execFileSync('node', [join(dir, 'out.cjs')], { encoding: 'utf8' }).trim();
      const ok = out.startsWith('OK');
      if (!ok) failures++;
      console.log(`  ${ok ? '✅' : '❌'} ${shapeName.padEnd(5)} / ${tab.padEnd(8)} ${out}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} render failure(s)` : '\nAll render paths OK');
process.exit(failures ? 1 : 0);
