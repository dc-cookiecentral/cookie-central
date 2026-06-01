import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useDotInventory } from '../hooks/useDotInventory';
import { useAssemblersInventory } from '../hooks/useAssemblersInventory';

// Inventory > Product view (BUILD_PLAN 5.1). Three sections — Finished Goods
// (dot_inventory) / Raw Materials / Packaging (both from raw_materials) —
// listed flat; click a row → detail with location breakdown + inline
// Adjust Inventory form (5.2).

const TH = 'px-2 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

const ADJ_REASONS = ['shrink', 'expired', 'damaged', 'disposed', 'other'];
const ADJ_LABEL = {
  shrink: 'Shrink',
  expired: 'Expired',
  damaged: 'Damaged',
  disposed: 'Disposed',
  other: 'Other',
};

function GroupHeader({ title }) {
  return (
    <div className="bg-dk px-3 py-1.5">
      <div className="text-[10px] font-extrabold uppercase text-white">{title}</div>
    </div>
  );
}

function ItemRow({ item, onClick }) {
  return (
    <tr onClick={onClick} className="border-b border-bg cursor-pointer hover:bg-pc">
      <td className="px-3 py-2 font-semibold">
        {item.name}
        <div className="text-[8px] text-gr font-mono">{item.code}</div>
      </td>
      <td className="px-3 py-2 text-right font-extrabold text-[12px]">
        {Number(item.total ?? 0).toLocaleString()}
        {item.unit && <span className="text-[8px] text-gr ml-1">{item.unit}</span>}
      </td>
      <td className="px-3 py-2 text-right text-pk text-[10px]">detail &gt;</td>
    </tr>
  );
}

function AdjustForm({ item, profile, onClose, onSaved }) {
  const [reason, setReason] = useState('shrink');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    const q = Number(quantity);
    if (!q || q <= 0) {
      setErr('Quantity to remove must be positive.');
      return;
    }
    if (item.kind !== 'rawOrPackaging') {
      setErr('Adjustments are tracked against Assemblers (raw / packaging) items only in Phase 1.');
      return;
    }
    setSaving(true);

    // 1. Insert adjustment row (audit_log fires from the table trigger if present;
    //    we also write directly so the trail is complete regardless).
    const { error: adjErr } = await supabase.from('inventory_adjustments').insert({
      raw_material_id: item.id,
      adjustment_type: reason,
      quantity: q,
      notes: notes || null,
      adjusted_by: profile?.id ?? null,
    });
    if (adjErr) {
      setErr(adjErr.message);
      setSaving(false);
      return;
    }

    // 2. Decrement on-hand so the picture stays consistent until the next upload
    //    refreshes it from source.
    const newQty = Math.max(0, Number(item.total) - q);
    const { error: matErr } = await supabase
      .from('raw_materials')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (matErr) {
      setErr(matErr.message);
      setSaving(false);
      return;
    }

    // 3. Explicit audit_log row — the trigger on raw_materials.UPDATE doesn't
    //    cover this table yet, so write the canonical record ourselves.
    await supabase.from('audit_log').insert({
      user_id: profile?.id ?? null,
      table_name: 'inventory_adjustments',
      record_id: item.id,
      action: 'INSERT',
      field_name: reason,
      old_value: String(item.total),
      new_value: String(newQty),
    });

    setSaving(false);
    onSaved();
  };

  return (
    <div className="bg-bg border border-lt rounded-lg p-3 mt-2">
      <div className="text-[8px] font-bold uppercase text-pk mb-2">Inventory Adjustment</div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <div className="text-[8px] text-gr mb-0.5">Reason</div>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-2 py-1 rounded border border-lt text-[10px]"
          >
            {ADJ_REASONS.map((r) => (
              <option key={r} value={r}>
                {ADJ_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[8px] text-gr mb-0.5">Qty to remove ({item.unit || 'units'})</div>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="w-full px-2 py-1 rounded border border-lt text-[10px] text-right"
          />
        </div>
        <div>
          <div className="text-[8px] text-gr mb-0.5">Notes</div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            className="w-full px-2 py-1 rounded border border-lt text-[10px]"
          />
        </div>
      </div>
      {err && <div className="text-[10px] text-red-600 mb-1.5">{err}</div>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="bg-pk text-white px-3 py-1 rounded text-[10px] font-semibold hover:bg-pm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Confirm Adjustment'}
        </button>
        <button onClick={onClose} className="text-[10px] text-gr hover:text-pk">
          Cancel
        </button>
      </div>
      <div className="mt-1.5 text-[8px] text-gr italic">
        Logged to audit_log + inventory_adjustments. Feeds EOM Snapshot.
      </div>
    </div>
  );
}

function ItemDetail({ item, profile, onBack, onAdjusted }) {
  const [adjusting, setAdjusting] = useState(false);
  return (
    <div className="bg-cd border border-lt rounded-xl p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-lg font-black text-dk">{item.name}</div>
          <div className="text-[9px] text-gr font-mono">{item.code}</div>
        </div>
        <button
          onClick={onBack}
          className="bg-bg border border-lt rounded-md px-3 py-1 text-[10px] font-semibold text-md hover:text-pk"
        >
          Back
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-bg border border-lt rounded-lg p-2.5">
          <div className="text-[8px] font-semibold uppercase text-gr">Total</div>
          <div className="text-lg font-extrabold mt-0.5">
            {Number(item.total ?? 0).toLocaleString()}
            {item.unit && <span className="text-xs text-gr ml-1">{item.unit}</span>}
          </div>
        </div>
        {item.velocity != null ? (
          <div className="bg-bg border border-lt rounded-lg p-2.5">
            <div className="text-[8px] font-semibold uppercase text-gr">Weekly Velocity</div>
            <div className="text-lg font-extrabold mt-0.5">{Number(item.velocity).toLocaleString()}</div>
          </div>
        ) : (
          <div className="bg-bg border border-lt rounded-lg p-2.5">
            <div className="text-[8px] font-semibold uppercase text-gr">Lots</div>
            <div className="text-lg font-extrabold mt-0.5">{item.lots ?? 0}</div>
          </div>
        )}
        {item.allocated ? (
          <div className="bg-amber-50 border border-lt rounded-lg p-2.5">
            <div className="text-[8px] font-semibold uppercase text-gr">Allocated to POs</div>
            <div className="text-lg font-extrabold mt-0.5 text-amber-700">
              {Number(item.allocated).toLocaleString()}
            </div>
          </div>
        ) : (
          <div className="bg-bg border border-lt rounded-lg p-2.5">
            <div className="text-[8px] font-semibold uppercase text-gr">Locations</div>
            <div className="text-lg font-extrabold mt-0.5">{item.locations.length}</div>
          </div>
        )}
      </div>

      <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-1.5 pb-1 border-b-2 border-lt">
        Location Breakdown
      </div>
      <table className="w-full border-collapse text-xs mb-3">
        <thead>
          <tr className="bg-pc">
            <th className={TH}>Location</th>
            <th className={THR}>Quantity</th>
            <th className={THR}>% of Total</th>
          </tr>
        </thead>
        <tbody>
          {item.locations
            .filter((l) => l.qty > 0)
            .map((l, i) => (
              <tr key={i} className="border-b border-bg">
                <td className="px-3 py-2 font-semibold">{l.label}</td>
                <td className="px-3 py-2 text-right font-bold">
                  {Number(l.qty).toLocaleString()}
                  {item.unit && <span className="text-[9px] text-gr ml-1">{item.unit}</span>}
                </td>
                <td className="px-3 py-2 text-right text-gr">
                  {item.total ? ((l.qty / item.total) * 100).toFixed(1) + '%' : '--'}
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {item.kind === 'rawOrPackaging' ? (
        adjusting ? (
          <AdjustForm
            item={item}
            profile={profile}
            onClose={() => setAdjusting(false)}
            onSaved={() => {
              setAdjusting(false);
              onAdjusted();
            }}
          />
        ) : (
          <button
            onClick={() => setAdjusting(true)}
            className="bg-bg border border-lt rounded-md px-3 py-1.5 text-[10px] font-semibold text-pk hover:bg-pc"
          >
            Adjust Inventory (shrink / expired / damaged)
          </button>
        )
      ) : (
        <div className="text-[10px] text-gr italic">
          Finished-goods adjustments flow through Cortina/DOT — not adjusted here.
        </div>
      )}
    </div>
  );
}

export default function ProductView() {
  const { profile } = useAuth();
  const dot = useDotInventory();
  const asm = useAssemblersInventory();
  const [sel, setSel] = useState(null);
  const [bump, setBump] = useState(0);

  if (dot.loading || asm.loading) {
    return <div className="text-sm text-gr py-10 text-center">Loading…</div>;
  }
  if (dot.error || asm.error) {
    return <div className="text-sm text-red-600">{dot.error || asm.error}</div>;
  }

  const fg = dot.rows.map((d) => ({
    kind: 'finished',
    code: d.sku,
    name: d.products?.full_name || d.products?.short_name || d.sku,
    total: d.on_hand ?? 0,
    velocity: d.weekly_velocity,
    allocated: d.allocated ?? 0,
    locations: [{ label: 'DOT Foods', qty: d.on_hand ?? 0 }],
  }));
  const raws = asm.rawMaterials.map((m) => ({
    kind: 'rawOrPackaging',
    id: m.id,
    code: m.code,
    name: m.name,
    unit: m.unit,
    total: m.quantity ?? 0,
    lots: m.lot_count ?? 0,
    locations: [{ label: 'Assemblers', qty: m.quantity ?? 0 }],
  }));
  const pack = asm.packaging.map((m) => ({
    kind: 'rawOrPackaging',
    id: m.id,
    code: m.code,
    name: m.name,
    unit: m.unit,
    total: m.quantity ?? 0,
    lots: m.lot_count ?? 0,
    locations: [{ label: 'Assemblers', qty: m.quantity ?? 0 }],
  }));

  if (sel) {
    return (
      <ItemDetail
        item={sel}
        profile={profile}
        onBack={() => setSel(null)}
        onAdjusted={() => {
          setSel(null);
          setBump((b) => b + 1);
        }}
      />
    );
  }

  const groups = [
    { title: 'Finished Goods', items: fg },
    { title: 'Raw Materials', items: raws },
    { title: 'Packaging', items: pack },
  ];

  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden" key={bump}>
      {groups.map((g) => (
        <div key={g.title}>
          <GroupHeader title={g.title} />
          {g.items.length ? (
            <table className="w-full border-collapse text-xs">
              <tbody>
                {g.items.map((it) => (
                  <ItemRow key={`${g.title}-${it.code}`} item={it} onClick={() => setSel(it)} />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-3 text-[11px] text-gr italic">No items.</div>
          )}
        </div>
      ))}
      <div className="px-3 py-1.5 text-[8px] text-gr italic border-t border-lt">
        Click any item for location breakdown + inventory adjustment.
      </div>
    </div>
  );
}
