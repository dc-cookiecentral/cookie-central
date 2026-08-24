import { useState } from 'react';
import UploadPipeline from '../components/UploadPipeline';
import UploadLog from '../components/UploadLog';
import InboxCard from '../components/InboxCard';
import { getParser } from '../parsers';

// Uploads grouped by data origin. Every card is a live drop zone — the
// "awaiting format" placeholders are gone, along with the two speculative
// parsers that never saw a real file (Cortina PO PDF, NetSuite POs).
//
// The six exports that are actually uploaded, in the order Caroline listed them
// (Aug 24 2026), followed by everything else demoted to a collapsed group.
//
// `type` → a parser in src/parsers. Two cards may share a `type`: the 1-week and
// 3-week OTIF exports are the same format and go through the same parser, but
// they arrive as two separate downloads, so the page shows two drop zones and
// the weekly routine reads as a checklist. Cards are keyed by `title` for that
// reason — keying by `type` would collide.
const SECTIONS = [
  {
    origin: 'Weekly — Retail Link (Walmart)',
    note: 'Downloaded from Retail Link. These four are the demand planner\'s entire demand side. All of them UPSERT — Walmart restates POS after the fact, so re-uploading a file whose weeks you already have is how the numbers stay correct, not a mistake.',
    items: [
      { type: 'retail_link_supply_plan', title: '1 · Dirty Cookie Supply Plan WK#', note: 'Walmart\'s forward ORDER plan — the POs it intends to place on us, by order-place date, bucketed to Walmart weeks. Reads the workbook\'s `Data` sheet (the `Supply Plan` tab is a monthly pivot and is ignored). ⚠️ Not the same as the store forecast below: this is what Walmart plans to ORDER, that is what it expects shoppers to BUY. Adding them together double-counts.' },
      { type: 'retail_link', title: '2 · Dirty Cookie WK#', note: 'The main weekly workbook. Reads All Item Detail (POS units/$, in-stock, traited stores and true demand for EVERY week of the year — one upload backfills the whole history), the Forecast sheet (Walmart\'s store forecast, stamped with this file\'s week so accuracy can be scored later), and Sales Summary for current store/warehouse on-hand.' },
      { type: 'retail_link_otif', title: '3 · OTIF Store Performance — 1 week', note: 'In Time and In Full. One row per PO — cases ordered / in time / late / unfilled by Walmart week. Feeds the Service health panel and cut recovery.' },
      { type: 'retail_link_otif', title: '4 · OTIF Store Performance — 3 weeks', note: 'Same format, wider window. It overlaps the 1-week file on purpose; the same PO in both files updates rather than duplicates, so upload both.' },
    ],
  },
  {
    origin: 'Weekly — Cortina & DOT',
    items: [
      { type: 'dot_order_history', title: '5 · DOT Report (Order History)', note: 'The DOT `Order History (N).xlsx` outbound export — one row per DOT order to a Walmart GDC, with ordered vs cut cases. Drives the cut-recovery panel: this is the volume DOT failed to ship, which NetSuite never sees. Validated against a real export — bucketed by delivery date it reproduces the planner\'s existing DOT figures exactly. Upserts on DOT order number.' },
      { type: 'walmart_orders', title: '6 · Walmart Report (NetSuite)', note: 'The Cortina/NetSuite Walmart Orders export — the primary source for Product Orders and Payments. Also auto-ingested nightly from systems@, so a manual upload here is a top-up or a backfill. Upserts on SO number, so re-uploading the full history is safe.' },
    ],
  },
  {
    origin: 'Legacy & occasional',
    collapsed: true,
    note: 'Not part of the weekly routine. Kept because they still feed live pages — Assemblers underpins Inventory and Lot Trace, Ingredient Master underpins Reference — and because the Assemblers workbook also arrives by email. (There is no DOT on-hand card: no such report exists — Caroline, Aug 24 2026. `src/parsers/dot.js` is retained but unreachable.)',
    items: [
      { type: 'production', title: 'Assemblers Report', note: 'Production runs + raw-lot consumption + inventory + outbound shipments — one multi-sheet upload. Normally auto-ingested when emailed to systems@; this card is the manual fallback.' },
      { type: 'qbo', title: 'QuickBooks Payments', note: 'Invoices + payments, matched by invoice #. Feeds the Payments page, currently hidden pending rework.' },
      { type: 'ingredient_master', title: 'Ingredient Master', note: 'Bulk import: one CSV of every ingredient × distributor × brand sourcing option. Builds ingredient_catalog + ingredient_suppliers. Changes rarely; no email path.' },
    ],
  },
];

// One origin group. `collapsed: true` starts closed — the legacy feeds are not
// part of the weekly routine and showing three full drop zones for them buries
// the six that are.
function UploadSection({ section, onComplete }) {
  const [open, setOpen] = useState(!section.collapsed);
  return (
    <section className="mb-6">
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-pk">
            {section.origin}
          </div>
          {section.collapsed && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[10px] px-2 py-0.5 rounded-full border text-gr"
              style={{ borderColor: '#E5D9DE' }}
            >
              {open ? 'Hide' : `Show ${section.items.length}`}
            </button>
          )}
        </div>
        {section.note && <div className="text-[10px] text-gr mt-0.5 max-w-2xl">{section.note}</div>}
      </div>

      {open && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {section.items.map((item) => {
            const parser = getParser(item.type);
            if (!parser) return null;
            return (
              <UploadPipeline
                key={item.title}
                parser={parser}
                title={item.title}
                note={item.note}
                onComplete={onComplete}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function Uploads() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpLog = () => setRefreshKey((k) => k + 1);

  return (
    <div>
      <h1 className="text-xl font-bold text-dk mb-1">Uploads</h1>
      <div className="text-[10px] uppercase tracking-wider text-gr mb-4">By data origin</div>

      <InboxCard onPolled={bumpLog} />

      {SECTIONS.map((section) => (
        <UploadSection key={section.origin} section={section} onComplete={bumpLog} />
      ))}

      <UploadLog refreshKey={refreshKey} />
    </div>
  );
}
