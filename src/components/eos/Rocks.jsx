import { useState } from 'react';
import { useRocks, useRockQuarters, createIssue } from '../../hooks/useEos';
import { quarterOf, currentScorecardWeek } from '../../utils/eosWeek';
import { formatDateOnly } from '../../utils/dates';
import { SectionCard, InlineText, BTN, BTN_PK, StatusToggle } from './bits';

// Rocks — the 3–7 things that must be done by quarter-end.
//
// In the Level 10 a Rock gets exactly one word: on-track or off-track. No
// status reports, no percentages. An off-track Rock drops to the Issues List,
// which is why the ⚑ sits right next to the toggle.

const STATUS_OPTIONS = [
  { value: 'on_track',  label: 'On track',  active: 'bg-emerald-500 text-white' },
  { value: 'off_track', label: 'Off track', active: 'bg-red-500 text-white' },
  { value: 'done',      label: 'Done',      active: 'bg-pk text-white' },
  { value: 'dropped',   label: 'Dropped',   active: 'bg-gr text-white' },
];

function AddRock({ quarter, rocks, onAdd }) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');

  const submit = async () => {
    if (!title.trim()) return;
    const maxSeq = rocks.reduce((m, r) => Math.max(m, r.seq || 0), 0);
    const ok = await onAdd({
      quarter,
      seq: maxSeq + 1,
      title: title.trim(),
      owner: owner.trim() || null,
      sort_order: (maxSeq + 1) * 10,
    });
    if (ok) { setTitle(''); setOwner(''); }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-lt bg-pc/40">
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Rock — specific and measurable by quarter-end…"
        className="flex-1 border border-lt rounded px-2 py-1 text-[11px] outline-none focus:border-pk"
      />
      <input
        value={owner} onChange={(e) => setOwner(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="One owner"
        className="w-28 border border-lt rounded px-2 py-1 text-[11px] outline-none focus:border-pk"
      />
      <button onClick={submit} className={BTN_PK}>Add Rock</button>
    </div>
  );
}

export default function Rocks({ canEdit }) {
  const quarters = useRockQuarters();
  const [quarter, setQuarter] = useState(() => quarterOf());
  const { rocks, loading, error, insert, update, remove } = useRocks(quarter);
  const [dropped, setDropped] = useState({});

  // The quarter picker offers every quarter that has Rocks, plus the current
  // one — so planning next quarter doesn't need a migration or a seed.
  const options = [...new Set([quarterOf(), ...quarters])].sort().reverse();

  const done = rocks.filter((r) => r.status === 'done').length;
  const offTrack = rocks.filter((r) => r.status === 'off_track').length;
  const live = rocks.filter((r) => r.status !== 'dropped').length;

  const dropToIssues = async (rock) => {
    const { error: err } = await createIssue({
      title: `Rock off track — ${rock.title}`,
      detail: `Dropped from the ${rock.quarter} Rock review.${rock.notes ? ` Notes: ${rock.notes}` : ''}`,
      owner: rock.owner,
      raised_week: currentScorecardWeek(),
    });
    if (err) window.alert(err.message);
    else setDropped((d) => ({ ...d, [rock.id]: true }));
  };

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading Rocks…</div>;
  if (error) return <div className="text-sm text-red-600 py-6">{error}</div>;

  return (
    <SectionCard
      title={`Rocks · ${quarter}`}
      subtitle={`${live} live · ${done} done · ${offTrack} off track — the 3–7 most important priorities this quarter, one owner each.`}
      right={
        <select
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          className="border border-lt rounded-md text-[10px] px-2 py-1 bg-cd"
        >
          {options.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {rocks.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-[11px] text-gr">
                  No Rocks set for {quarter} yet.
                </td>
              </tr>
            )}
            {rocks.map((r) => (
              <tr key={r.id} className="border-b border-lt/60 hover:bg-pc/30 align-top">
                <td className="px-3 py-2.5 w-[28px] text-[11px] font-bold text-lt tabular-nums">{r.seq ?? '·'}</td>
                <td className="px-2 py-2.5">
                  <InlineText
                    value={r.title}
                    disabled={!canEdit}
                    onSave={(v) => v && update(r.id, { title: v })}
                    className={`text-[11px] font-semibold block leading-snug ${
                      r.status === 'done' ? 'text-gr line-through' : 'text-dk'
                    }`}
                  />
                  <InlineText
                    value={r.notes}
                    disabled={!canEdit}
                    onSave={(v) => update(r.id, { notes: v })}
                    placeholder="add notes"
                    className="text-[9px] text-gr block leading-snug mt-0.5"
                  />
                </td>
                <td className="px-2 py-2.5 w-[100px]">
                  <InlineText
                    value={r.owner}
                    disabled={!canEdit}
                    onSave={(v) => update(r.id, { owner: v })}
                    placeholder="owner"
                    className="text-[10px]"
                  />
                </td>
                <td className="px-2 py-2.5 w-[92px]">
                  {canEdit ? (
                    <input
                      type="date"
                      defaultValue={r.due_date || ''}
                      onBlur={(e) => update(r.id, { due_date: e.target.value || null })}
                      className="border border-lt rounded px-1 py-0.5 text-[9px] w-full outline-none focus:border-pk"
                    />
                  ) : (
                    <span className="text-[10px] text-md">{r.due_date ? formatDateOnly(r.due_date) : '—'}</span>
                  )}
                </td>
                <td className="px-2 py-2.5 w-[220px]">
                  <div className="flex items-center gap-1.5 justify-end">
                    <StatusToggle
                      value={r.status}
                      options={STATUS_OPTIONS}
                      disabled={!canEdit}
                      onChange={(s) => update(r.id, { status: s })}
                    />
                    {canEdit && r.status === 'off_track' && (
                      <button
                        onClick={() => dropToIssues(r)}
                        disabled={dropped[r.id]}
                        title={dropped[r.id] ? 'Already dropped to the Issues List' : 'Drop to the Issues List'}
                        className={`text-[11px] ${dropped[r.id] ? 'text-emerald-500 cursor-default' : 'text-gr hover:text-pk'}`}
                      >
                        {dropped[r.id] ? '✓' : '⚑'}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => window.confirm(`Delete "${r.title}"?`) && remove(r.id)}
                        className="text-[11px] text-lt hover:text-red-500 px-0.5"
                        title="Delete"
                      >×</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && <AddRock quarter={quarter} rocks={rocks} onAdd={insert} />}
    </SectionCard>
  );
}
