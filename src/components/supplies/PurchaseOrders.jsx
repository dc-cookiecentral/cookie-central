import { useState } from 'react';
import { Link } from 'react-router-dom';
import SpecTable from '../specsheet/SpecTable';
import { Empty } from '../specsheet/pills';
import { openSupplyDoc, deletePurchaseOrder } from '../../hooks/useSupplies';
import { fmtMoney, fmtQty, fmtDate, fmtCost, VendorLink, QuoteStatus, docLabel } from './supplyUi';

// POs tab: every supply purchase order, newest first. Double-click a PO for
// its lines (item, qty, price, landed cost) — each item links to its row on
// the Supplies tab. While the edit lock is open: + New PO, Edit PO (pickup /
// delivered, freight, packing slip) and Delete PO.

export default function PurchaseOrders({ data, maps, editing, setModal, onChanged }) {
  const [openId, setOpenId] = useState(null);

  const linesByPo = new Map();
  data.quotes.forEach((q) => {
    if (!q.po_id) return;
    if (!linesByPo.has(q.po_id)) linesByPo.set(q.po_id, []);
    linesByPo.get(q.po_id).push(q);
  });

  const lineTotal = (q) => (maps.breaksByQuote.get(q.id) || []).reduce((s, b) => s + Number(b.price_per_order_qty || 0), 0);

  const rows = (data.pos || [])
    .map((po) => {
      const lines = linesByPo.get(po.id) || [];
      return {
        ...po,
        vendor: maps.vendorsById.get(po.vendor_id) || null,
        lines,
        total: lines.reduce((s, q) => s + lineTotal(q), 0),
        docPath: lines.find((q) => q.doc_path)?.doc_path || null,
      };
    })
    .sort((a, b) => String(b.po_date || '').localeCompare(String(a.po_date || '')) || a.po_number.localeCompare(b.po_number));

  const remove = async (po) => {
    const n = po.lines.length;
    if (!window.confirm(`Delete PO ${po.po_number}${n ? ` and its ${n} price line${n > 1 ? 's' : ''}` : ''}? This cannot be undone.`)) return;
    const { error } = await deletePurchaseOrder(po, data.quotes);
    if (error) window.alert(`Couldn't delete: ${error.message}`);
    else {
      setOpenId(null);
      onChanged();
    }
  };

  const cols = [
    { key: 'po_number', label: 'PO', render: (r) => <span className="font-mono font-semibold text-dk">{r.po_number}</span> },
    { key: 'vendor', label: 'Vendor', value: (r) => r.vendor?.name || '', render: (r) => <VendorLink vendor={r.vendor} /> },
    { key: 'po_date', label: 'Date', render: (r) => fmtDate(r.po_date) || <Empty /> },
    {
      key: 'items', label: 'Items', sortable: false,
      render: (r) =>
        r.lines.length ? (
          <div className="space-y-0.5">
            {r.lines.map((q) => {
              const item = maps.itemsById.get(maps.skusById.get(q.sku_id)?.item_id);
              return <div key={q.id} className="whitespace-nowrap">{item?.name || 'item?'}</div>;
            })}
          </div>
        ) : <Empty label="— no lines" />,
    },
    { key: 'total', label: 'Total', render: (r) => (r.total ? <span className="font-semibold text-dk">{fmtMoney(r.total)}</span> : <Empty label="— not priced" />) },
    {
      key: 'fulfillment', label: 'Pickup / freight', value: (r) => r.fulfillment || '',
      render: (r) => (
        <div className="text-[10px]">
          {r.fulfillment ? (r.fulfillment === 'pickup' ? '🚚 Picked up' : '📦 Delivered') : <Pending>pickup / delivered not set</Pending>}
          <div>{r.freight_cost != null ? <>freight {fmtMoney(r.freight_cost)}</> : r.fulfillment && <Pending>freight pending</Pending>}</div>
        </div>
      ),
    },
    {
      key: 'doc', label: 'File', sortable: false,
      render: (r) => r.docPath ? (
        <button
          onClick={(e) => { e.stopPropagation(); openSupplyDoc(r.docPath); }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="text-[10px] font-semibold text-pk hover:underline"
        >
          📄 Open
        </button>
      ) : <Empty />,
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <div className="text-[11px] text-gr">
          Every purchase order for ingredients and packaging. Saving a PO updates each item’s last PO price, last order date and actual landed cost, and the vendor’s card.
          {!editing && ' Unlock editing to add a PO.'}
        </div>
        {editing && (
          <button onClick={() => setModal({ kind: 'newPo' })} className="px-3 py-1.5 rounded text-[11px] font-bold bg-pk text-white hover:opacity-90">
            + New PO
          </button>
        )}
      </div>
      <SpecTable
        columns={cols}
        rows={rows}
        bandLabel={`Purchase orders — ${rows.length} · double-click a PO for its lines`}
        bandColor="#7A5BA0"
        emptyNote="No purchase orders yet."
        onRowDoubleClick={(r) => setOpenId(r.id === openId ? null : r.id)}
        isRowSelected={(r) => r.id === openId}
        renderRowDetail={(r) => r.id === openId && (
          <PoDetail po={r} maps={maps} editing={editing} onClose={() => setOpenId(null)} onDelete={() => remove(r)}
            onEdit={() => setModal({ kind: 'po', po: r, quote: r.lines[0] || null })} />
        )}
      />
    </div>
  );
}

const Pending = ({ children }) => (
  <span className="inline-block px-1.5 py-px rounded text-[9px] font-bold bg-amber-100 text-amber-700">⚑ {children}</span>
);

function PoDetail({ po, maps, editing, onClose, onEdit, onDelete }) {
  return (
    <div className="bg-cd border border-lt rounded-xl p-3">
      <div className="flex justify-between items-start mb-2 gap-2 flex-wrap">
        <div>
          <div className="text-[12px] font-bold text-dk">PO {po.po_number} · {po.vendor?.name || 'vendor pending'}</div>
          <div className="text-[10px] text-md">
            {[fmtDate(po.po_date), po.packing_slip_ref && `packing slip ${po.packing_slip_ref}`, po.ship_date && `ships ${fmtDate(po.ship_date)}`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="flex gap-1.5 items-center">
          {editing && (
            <>
              <button onClick={onEdit} className="px-2 py-0.5 rounded text-[10px] border border-lt text-pk hover:bg-pc">Edit PO</button>
              <button onClick={onDelete} className="px-2 py-0.5 rounded text-[10px] border border-red-200 text-red-600 hover:bg-red-50">Delete PO</button>
            </>
          )}
          <button onClick={onClose} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-lt text-gr hover:text-pk">✕</button>
        </div>
      </div>
      {po.lines.length ? (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[8px] font-bold uppercase tracking-wider text-gr">
              <th className="py-1 pr-3">Item</th><th className="py-1 pr-3">SKU / order unit</th><th className="py-1 pr-3">Qty</th>
              <th className="py-1 pr-3">Line total</th><th className="py-1 pr-3">Price</th><th className="py-1 pr-3">Landed</th><th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((q) => {
              const sku = maps.skusById.get(q.sku_id);
              const item = maps.itemsById.get(sku?.item_id);
              const breaks = maps.breaksByQuote.get(q.id) || [];
              const c = maps.lineCostByQuote.get(q.id);
              const ing = item?.kind === 'ingredient';
              return (
                <tr key={q.id} className="border-t border-lt align-top">
                  <td className="py-1 pr-3">
                    {item ? <Link to={`/supplies?item=${item.id}`} className="font-semibold text-pk hover:underline">{item.name}</Link> : <Empty />}
                    <div className="text-[9px] text-gr">{docLabel(q)}</div>
                  </td>
                  <td className="py-1 pr-3 text-md">{[sku?.brand_name, sku?.order_unit].filter(Boolean).join(' · ') || <Empty />}</td>
                  <td className="py-1 pr-3">{breaks.length ? breaks.map((b) => <div key={b.break_id}>{fmtQty(b.qty)}</div>) : <Empty />}</td>
                  <td className="py-1 pr-3">{breaks.length ? breaks.map((b) => <div key={b.break_id}>{fmtMoney(b.price_per_order_qty)}</div>) : <Empty />}</td>
                  <td className="py-1 pr-3">{c ? fmtCost(item?.kind, ing ? c.price_per_lb : c.price_per_thousand) || <Empty /> : <Empty />}</td>
                  <td className="py-1 pr-3">
                    {c ? fmtCost(item?.kind, ing ? c.landed_per_lb : c.landed_per_thousand) || <Empty /> : <Empty />}
                    {c && c.freight_share == null && <div className="text-[9px] text-gr">freight not in yet</div>}
                  </td>
                  <td className="py-1"><QuoteStatus v={q.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <div className="text-[11px] text-gr italic">No price lines filed under this PO.</div>}
      {po.notes && <div className="text-[11px] text-md mt-2">{po.notes}</div>}
    </div>
  );
}
