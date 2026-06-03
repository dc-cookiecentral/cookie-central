import { useState } from 'react';
import UploadPipeline from '../components/UploadPipeline';
import UploadLog from '../components/UploadLog';
import InboxCard from '../components/InboxCard';
import { getParser } from '../parsers';

// Uploads grouped by data origin. Built parsers render as live upload cards;
// types we expect but haven't received a format for yet render as muted
// "awaiting format" placeholders so the page mirrors the full intended set.
//
// `type` → has a parser in src/parsers; `planned: true` → placeholder only.
const SECTIONS = [
  {
    origin: 'Cortina',
    note: 'POs flow through Cortina (NetSuite), enriched by Retail Link performance + NOVA edits. Cortina-paid status (Cortina → Dirty Cookie) is tracked from these feeds.',
    items: [
      { type: 'cortina_po', title: 'Cortina PO (PDF)', note: 'Temporary — upload PO PDFs from Cortina until the NetSuite API is connected. Creates the purchase_orders record; parked systems@ email data auto-links on import.' },
      { type: 'netsuite', title: 'NetSuite POs', note: 'Retail Link + NOVA' },
      { type: 'dot', title: 'DOT Reports' },
    ],
  },
  {
    origin: 'Assemblers',
    note: 'One workbook covers Production / Reject / Inventory / Shipment + per-Job consumption — lot code is the join key across all sheets. Raw-ingredient landing/BOL is captured separately via Inventory → Reorder.',
    items: [
      { type: 'production', title: 'Assemblers Report', note: 'Production runs + raw-lot consumption + inventory + outbound shipments — one multi-sheet upload. Also auto-ingested when emailed to systems@.' },
    ],
  },
  {
    origin: 'QuickBooks',
    items: [
      { type: 'qbo', title: 'Payments', note: 'Invoices + payments, matched by invoice #' },
      { planned: true, title: 'Inventory', note: 'TBD' },
    ],
  },
];

function PlannedCard({ title, note }) {
  return (
    <div className="bg-cd border border-dashed border-lt rounded-xl p-4 opacity-70">
      <div className="flex items-center justify-between mb-1">
        <div className="font-bold text-dk text-sm">{title}</div>
        <span className="text-[9px] font-semibold uppercase text-gr bg-bg px-2 py-[2px] rounded-full">
          Awaiting format
        </span>
      </div>
      {note && <div className="text-[10px] text-gr">{note}</div>}
    </div>
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
        <section key={section.origin} className="mb-6">
          <div className="mb-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-pk">
              {section.origin}
            </div>
            {section.note && <div className="text-[10px] text-gr mt-0.5 max-w-2xl">{section.note}</div>}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {section.items.map((item) => {
              if (item.planned) {
                return <PlannedCard key={item.title} title={item.title} note={item.note} />;
              }
              const parser = getParser(item.type);
              if (!parser) return null;
              return (
                <UploadPipeline
                  key={item.type}
                  parser={parser}
                  title={item.title}
                  note={item.note}
                  onComplete={bumpLog}
                />
              );
            })}
          </div>
        </section>
      ))}

      <UploadLog refreshKey={refreshKey} />
    </div>
  );
}
