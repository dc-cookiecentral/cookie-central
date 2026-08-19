import { useState } from 'react';
import { useSeats } from '../../hooks/useEos';
import { SectionCard, InlineText, OwnerChip, BTN, BTN_PK } from './bits';

// The Accountability Chart — one name accountable per seat.
//
// Not an org chart: it describes the seats the business needs and who is
// accountable for each, which is why 'OPEN' and 'HIRE #1' are first-class
// owners rather than blanks. The unfilled count in the header is the point of
// the whole view.
//
// GWC — Get it, Want it, Capacity to do it — is the EOS test for whether the
// right person is in a seat. Unset is the honest default: nobody has been
// assessed yet, and a grey dot says that where an unticked box would imply "no".

const GWC = [
  { key: 'gwc_get',      short: 'G', label: 'Gets it' },
  { key: 'gwc_want',     short: 'W', label: 'Wants it' },
  { key: 'gwc_capacity', short: 'C', label: 'Capacity to do it' },
];

// Cycles unset → yes → no → unset, so all three states are reachable by clicking.
const nextGwc = (v) => (v == null ? true : v === true ? false : null);

function GwcDots({ seat, canEdit, onChange }) {
  return (
    <div className="inline-flex gap-0.5">
      {GWC.map((g) => {
        const v = seat[g.key];
        const cls = v === true
          ? 'bg-emerald-500 text-white'
          : v === false
          ? 'bg-red-400 text-white'
          : 'bg-bg text-lt';
        return (
          <button
            key={g.key}
            disabled={!canEdit}
            onClick={() => onChange(seat.id, { [g.key]: nextGwc(v) })}
            title={`${g.label}: ${v == null ? 'not assessed' : v ? 'yes' : 'no'}`}
            className={`w-[17px] h-[17px] rounded text-[8px] font-bold ${cls} ${canEdit ? 'hover:opacity-80' : 'cursor-default'}`}
          >
            {g.short}
          </button>
        );
      })}
    </div>
  );
}

function AddSeat({ fn, seats, onAdd }) {
  const [open, setOpen] = useState(false);
  const [seat, setSeat] = useState('');
  const [owner, setOwner] = useState('');

  const submit = async () => {
    if (!seat.trim()) return;
    const max = seats.reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
    const ok = await onAdd({
      major_function: fn, seat: seat.trim(), owner: owner.trim() || 'OPEN', sort_order: max + 10,
    });
    if (ok) { setSeat(''); setOwner(''); setOpen(false); }
  };

  if (!open) {
    return (
      <div className="px-4 py-2 border-t border-lt">
        <button onClick={() => setOpen(true)} className={BTN}>+ Seat</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-lt bg-pc/40">
      <input autoFocus value={seat} onChange={(e) => setSeat(e.target.value)}
             onKeyDown={(e) => e.key === 'Enter' && submit()}
             placeholder="Seat" className="w-40 border border-lt rounded px-2 py-1 text-[11px] outline-none focus:border-pk" />
      <input value={owner} onChange={(e) => setOwner(e.target.value)}
             onKeyDown={(e) => e.key === 'Enter' && submit()}
             placeholder="Owner (or OPEN / HIRE #1)"
             className="flex-1 border border-lt rounded px-2 py-1 text-[11px] outline-none focus:border-pk" />
      <button onClick={submit} className={BTN_PK}>Add</button>
      <button onClick={() => setOpen(false)} className={BTN}>Cancel</button>
    </div>
  );
}

export default function AccountabilityChart({ canEdit }) {
  const { seats, groups, loading, error, insert, update } = useSeats();

  const unfilled = seats.filter((s) => /^(OPEN|HIRE|TBD)/i.test(s.owner || '')).length;

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading the Accountability Chart…</div>;
  if (error) return <div className="text-sm text-red-600 py-6">{error}</div>;

  return (
    <div className="space-y-3">
      <div className="bg-cd border border-lt rounded-xl px-4 py-3">
        <div className="text-[12px] font-bold text-dk">Accountability Chart</div>
        <div className="text-[10px] text-gr mt-0.5 leading-snug">
          {seats.length} seats · <span className="font-semibold text-amber-700">{unfilled} unfilled</span> —
          one name accountable per seat. GWC (Get it · Want it · Capacity) is grey until the seat is assessed;
          click a letter to cycle unset → yes → no.
        </div>
      </div>

      {groups.map(([fn, rows]) => {
        const openSeats = rows.filter((s) => /^(OPEN|HIRE|TBD)/i.test(s.owner || '')).length;
        return (
          <SectionCard
            key={fn}
            title={fn}
            subtitle={`${rows.length} seat${rows.length === 1 ? '' : 's'}${openSeats ? ` · ${openSeats} unfilled` : ''}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-b border-lt/60 hover:bg-pc/30 align-top">
                      <td className="px-3 py-2 w-[150px]">
                        <InlineText
                          value={s.seat}
                          disabled={!canEdit}
                          onSave={(v) => v && update(s.id, { seat: v })}
                          className="text-[11px] font-bold text-dk block leading-snug"
                        />
                      </td>
                      <td className="px-2 py-2 w-[112px]">
                        {canEdit ? (
                          <InlineText
                            value={s.owner}
                            onSave={(v) => update(s.id, { owner: v })}
                            placeholder="OPEN"
                            className="text-[10px]"
                          />
                        ) : (
                          <OwnerChip name={s.owner} />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <InlineText
                          value={s.accountable_for}
                          disabled={!canEdit}
                          multiline
                          onSave={(v) => update(s.id, { accountable_for: v })}
                          placeholder="accountable for…"
                          className="text-[10px] text-md block leading-snug"
                        />
                      </td>
                      <td className="px-2 py-2 w-[64px] text-right">
                        <GwcDots seat={s} canEdit={canEdit} onChange={update} />
                      </td>
                      <td className="px-2 py-2 w-[26px] text-right">
                        {canEdit && (
                          <button
                            onClick={() => window.confirm(`Remove the ${s.seat} seat from the chart?`) && update(s.id, { active: false })}
                            className="text-[11px] text-lt hover:text-red-500"
                            title="Remove seat"
                          >×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && <AddSeat fn={fn} seats={seats} onAdd={insert} />}
          </SectionCard>
        );
      })}
    </div>
  );
}
