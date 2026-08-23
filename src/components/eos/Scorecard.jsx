import { Fragment, useMemo, useState } from 'react';
import { useScorecard, useMeeting, createIssue, useMetricTodos } from '../../hooks/useEos';
import {
  weekLabel, weekSpanLabel, addWeeks, currentScorecardWeek, meetingDateFor,
  scoreEntry, formatMetricValue, formatGoal,
} from '../../utils/eosWeek';
import { formatDate } from '../../utils/dates';
import { SCORE_CELL, SCORE_DOT, Sparkline, InlineText, SectionCard, BTN, BTN_PK } from './bits';

// The Weekly Scorecard — the reason this page exists.
//
// One table, EOS-shaped: measurables down the left, weeks across the top, the
// most recent closed week on the right and editable. That single layout does
// both jobs at once — entering this week's numbers and seeing the trend behind
// them — which is what a team reads off a screen together in a Level 10.
//
// Entering a number never asks anyone to pick a status. Red/yellow/green comes
// from the metric's current goal (see scoreEntry), so the grid re-colours
// correctly the moment a goal is set after the baseline period.

const WINDOWS = [13, 26, 52];

const TH_CLS = 'px-2 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const TH_STICKY = `${TH_CLS} sticky left-0 bg-cd z-10`;
const TD_STICKY = 'px-2 py-1.5 sticky left-0 bg-cd z-10';

const UNITS = [
  { value: 'number', label: '#' }, { value: 'usd', label: '$' },
  { value: 'percent', label: '%' }, { value: 'days', label: 'days' },
  { value: 'ratio', label: 'ratio' },
];

// One cell in the grid. Editable everywhere — backfilling a missed week is a
// normal thing to need — but only the current column shows as an input by
// default; the rest turn into one on click.
function Cell({ metric, week, entry, isCurrent, onSave, canEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const score = scoreEntry(metric, entry?.value);
  const open = isCurrent || editing;

  const begin = () => {
    if (!canEdit) return;
    setDraft(entry?.value == null ? '' : String(entry.value));
    setEditing(true);
  };
  const commit = (value) => {
    setEditing(false);
    const next = value.trim();
    const before = entry?.value == null ? '' : String(entry.value);
    if (next !== before) onSave(metric.id, week, next);
  };

  if (open && canEdit) {
    const value = editing ? draft : entry?.value == null ? '' : String(entry.value);
    return (
      <td className={`p-0 border ${isCurrent ? 'border-pk/40 bg-pc' : 'border-lt'}`}>
        <input
          value={value}
          autoFocus={editing}
          inputMode="decimal"
          onFocus={() => { if (!editing) begin(); }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setEditing(false); e.currentTarget.blur(); }
          }}
          className={`w-full h-[26px] px-1 text-[10px] text-center bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-pk rounded-sm ${
            SCORE_CELL[score].split(' ').filter((c) => c.startsWith('text-')).join(' ')
          }`}
          placeholder={isCurrent ? '–' : ''}
          title={entry?.note || undefined}
        />
      </td>
    );
  }

  return (
    <td className="p-0">
      <button
        onClick={begin}
        title={entry?.note || (canEdit ? 'Click to enter' : undefined)}
        className={`w-full h-[26px] px-1 text-[10px] text-center border tabular-nums ${SCORE_CELL[score]} ${
          canEdit ? 'hover:border-pk' : 'cursor-default'
        }`}
      >
        {entry?.value == null ? <span className="text-lt">·</span> : formatMetricValue(metric, entry.value)}
      </button>
    </td>
  );
}

// The goal editor, inline in the left rail. Deliberately reachable from the
// grid: goals get set mid-meeting once a metric has a few weeks behind it.
function GoalCell({ metric, onSave, canEdit }) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return <span className="text-[10px] text-md">{formatGoal(metric)}</span>;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`text-[10px] px-1.5 py-0.5 rounded hover:bg-pc ${
          metric.goal_value == null ? 'text-gr italic' : 'text-md font-semibold'
        }`}
        title="Set the weekly goal"
      >
        {formatGoal(metric)}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={metric.goal_direction}
        onChange={(e) => onSave(metric.id, { goal_direction: e.target.value })}
        className="border border-lt rounded text-[9px] px-1 py-0.5 bg-white"
      >
        <option value="gte">≥</option>
        <option value="lte">≤</option>
        <option value="between">between</option>
      </select>
      <input
        defaultValue={metric.goal_value ?? ''}
        inputMode="decimal"
        autoFocus
        onBlur={(e) => {
          const v = e.target.value.trim();
          onSave(metric.id, { goal_value: v === '' ? null : Number(v) });
          setOpen(false);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-14 border border-pk rounded text-[10px] px-1 py-0.5 outline-none"
        placeholder="goal"
      />
      {metric.goal_direction === 'between' && (
        <input
          defaultValue={metric.goal_max ?? ''}
          inputMode="decimal"
          onBlur={(e) => {
            const v = e.target.value.trim();
            onSave(metric.id, { goal_max: v === '' ? null : Number(v) });
          }}
          className="w-14 border border-lt rounded text-[10px] px-1 py-0.5 outline-none"
          placeholder="max"
        />
      )}
    </div>
  );
}

function AddMetric({ onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [unit, setUnit] = useState('number');
  const [isPrimary, setIsPrimary] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    const ok = await onAdd({
      name: name.trim(), owner: owner.trim() || null, unit,
      is_primary: isPrimary, goal_direction: 'gte',
    });
    if (ok) { setName(''); setOwner(''); setIsPrimary(false); onCancel(); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-lt bg-pc/40">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
             onKeyDown={(e) => e.key === 'Enter' && submit()}
             placeholder="Measurable" className="border border-lt rounded px-2 py-1 text-[11px] w-52 outline-none focus:border-pk" />
      <input value={owner} onChange={(e) => setOwner(e.target.value)}
             onKeyDown={(e) => e.key === 'Enter' && submit()}
             placeholder="Owner" className="border border-lt rounded px-2 py-1 text-[11px] w-28 outline-none focus:border-pk" />
      <select value={unit} onChange={(e) => setUnit(e.target.value)}
              className="border border-lt rounded px-2 py-1 text-[11px] bg-white">
        {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
      </select>
      <label className="flex items-center gap-1 text-[10px] text-md">
        <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
        ★ primary
      </label>
      <button onClick={submit} className={BTN_PK}>Add</button>
      <button onClick={onCancel} className={BTN}>Cancel</button>
    </div>
  );
}

// The To-Dos hanging off one measurable, revealed by the disclosure arrow.
// Its own <tr> spanning the grid rather than nested inside the measurable's
// cell: that cell is `sticky` with its own stacking context, and a panel inside
// it would be clipped by the grid's horizontal scroll.
function TodoPanel({ metric, todos, colSpan, canEdit, onToggle, onAdd }) {
  const [draft, setDraft] = useState('');
  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    await onAdd(metric, title);
  };
  return (
    <tr className="border-b border-lt/60 bg-pc/20">
      <td colSpan={colSpan} className="px-4 py-2">
        <div className="text-[9px] uppercase tracking-wider text-gr font-bold mb-1.5">
          To-Dos · {metric.name}
        </div>
        <ul className="space-y-1 mb-2">
          {todos.length === 0 && (
            <li className="text-[10px] text-gr italic">
              Nothing open. Anything added here keeps appearing every week until it is ticked.
            </li>
          )}
          {todos.map((t) => (
            <li key={t.id} className="flex items-baseline gap-2">
              <input
                type="checkbox"
                checked={!!t.done}
                disabled={!canEdit}
                onChange={() => onToggle(t)}
                className="translate-y-[2px]"
                aria-label={`Mark done: ${t.title}`}
              />
              <span className="text-[11px] text-dk flex-1 min-w-0">{t.title}</span>
              {t.owner && <span className="text-[9px] text-gr">{t.owner}</span>}
              {/* The week it was RAISED, not the week being viewed. That is what
                  makes a carried-over item legible as carried over. */}
              {t.metric_week && (
                <span className="text-[9px] text-gr whitespace-nowrap" title="Week this To-Do was raised">
                  from {weekLabel(t.metric_week)}
                </span>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="flex gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Add a To-Do for this measurable…"
              className="flex-1 min-w-0 px-2 py-1 rounded border border-lt text-[11px]"
            />
            <button onClick={submit} className="px-2.5 py-1 rounded border border-lt text-[11px] text-gr hover:text-pk">
              Add
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function Scorecard({ canEdit }) {
  const [endWeek, setEndWeek] = useState(() => currentScorecardWeek());
  const [windowSize, setWindowSize] = useState(13);
  const [adding, setAdding] = useState(false);
  const [dropped, setDropped] = useState({}); // metric.id → true, after "drop to Issues"

  const { metrics, byCell, range, loading, error, saveEntry, updateMetric, addMetric } =
    useScorecard(endWeek, windowSize);
  const { meeting, save: saveMeeting } = useMeeting(endWeek);

  const isLatest = endWeek === currentScorecardWeek();

  // This week's tally, for the strip above the grid.
  const tally = useMemo(() => {
    const t = { green: 0, yellow: 0, red: 0, none: 0, empty: 0 };
    for (const m of metrics) t[scoreEntry(m, byCell.get(`${m.id}|${endWeek}`)?.value)] += 1;
    return t;
  }, [metrics, byCell, endWeek]);

  // "Any issues will get migrated to the Issue List" — this is that move. It
  // records which week and which number sent the issue down, because by the time
  // anyone reads the Issues List the context is gone.
  // Which measurables have their To-Do panel open. Local state, not persisted:
  // it is a reading posture, not a property of the measurable.
  const [openTodos, setOpenTodos] = useState({});
  const { byMetric: todosByMetric, update: updateTodo, insert: insertTodo } = useMetricTodos();

  const toggleTodo = async (t) => {
    await updateTodo(t.id, { done: !t.done, done_at: t.done ? null : new Date().toISOString() });
  };

  // A To-Do raised against a measurable records the week it came from, so a
  // carried-over item can say so. due_week follows the EOS seven-day rule.
  const addTodo = async (metric, title) => {
    // useTable.insert refetches on success, so the panel repaints itself.
    await insertTodo({
      title,
      owner: metric.owner,
      metric_id: metric.id,
      metric_week: endWeek,
      created_week: endWeek,
      due_week: addWeeks(endWeek, 1),
      done: false,
    });
  };

  const dropToIssues = async (metric) => {
    const entry = byCell.get(`${metric.id}|${endWeek}`);
    const shown = entry?.value == null ? 'no number entered' : formatMetricValue(metric, entry.value);
    const { error: err } = await createIssue({
      title: `${metric.name} off track — ${shown} (week of ${weekLabel(endWeek)})`,
      detail: `Dropped from the Weekly Scorecard. Goal: ${formatGoal(metric)}. Actual: ${shown}.`,
      owner: metric.owner,
      raised_week: endWeek,
    });
    if (err) window.alert(err.message);
    else setDropped((d) => ({ ...d, [metric.id]: true }));
  };

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading the scorecard…</div>;
  if (error) {
    return (
      <div className="text-sm text-red-600 py-6">
        {error}
        <div className="text-[11px] text-gr mt-1">
          If the EOS tables are missing, apply <code>20260817120000_eos_foundation.sql</code> and its seed first.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Week navigator + the Level 10 record ─────────────────────────── */}
      <div className="bg-cd border border-lt rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setEndWeek(addWeeks(endWeek, -1))} className={BTN} title="Previous week">◀</button>
          <div>
            <div className="text-[13px] font-bold text-dk leading-tight">Week of {weekSpanLabel(endWeek)}</div>
            <div className="text-[9px] text-gr">
              Level 10 · {formatDate(meetingDateFor(endWeek))}
              {isLatest ? ' · most recent closed week' : ''}
            </div>
          </div>
          <button
            onClick={() => setEndWeek(addWeeks(endWeek, 1))}
            disabled={isLatest}
            className={`${BTN} ${isLatest ? 'opacity-40 cursor-not-allowed' : ''}`}
            title="Next week"
          >▶</button>
          {!isLatest && (
            <button onClick={() => setEndWeek(currentScorecardWeek())} className={BTN}>Today</button>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[10px]">
          {[['green', 'on goal'], ['yellow', 'close'], ['red', 'off goal']].map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1 text-md">
              <span className={`w-2 h-2 rounded-full ${SCORE_DOT[k]}`} />
              <span className="font-semibold tabular-nums">{tally[k]}</span> {label}
            </span>
          ))}
          {tally.none > 0 && (
            <span className="text-gr">· {tally.none} baselining</span>
          )}
          {tally.empty > 0 && (
            <span className="text-gr">· {tally.empty} not entered</span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-[9px] uppercase tracking-wider text-gr">Meeting rating</label>
          <input
            type="number" min="1" max="10" step="0.5"
            defaultValue={meeting?.rating ?? ''}
            key={`rating-${endWeek}-${meeting?.rating ?? ''}`}
            disabled={!canEdit}
            onBlur={(e) => {
              const v = e.target.value.trim();
              saveMeeting({ rating: v === '' ? null : Number(v), held_on: meeting?.held_on ?? meetingDateFor(endWeek) });
            }}
            className="w-14 border border-lt rounded px-2 py-1 text-[11px] text-center outline-none focus:border-pk disabled:bg-bg"
            placeholder="1–10"
          />
          <div className="flex items-center gap-1">
            {WINDOWS.map((w) => (
              <button key={w} onClick={() => setWindowSize(w)}
                      className={w === windowSize
                        ? 'px-2 py-1 rounded-md text-[10px] font-semibold bg-pk text-white'
                        : BTN}>
                {w}w
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── The grid ─────────────────────────────────────────────────────── */}
      <SectionCard
        title="Weekly Scorecard"
        subtitle={`${metrics.length} measurables · ★ = primary metric, leadership reacts first · click any cell to enter or correct a number`}
        right={canEdit && !adding ? (
          <button onClick={() => setAdding(true)} className={BTN}>+ Measurable</button>
        ) : null}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-lt">
                <th className={`${TH_STICKY} w-[190px]`}>Measurable</th>
                <th className={`${TH_CLS} w-[86px]`}>Owner</th>
                <th className={`${TH_CLS} w-[92px]`}>Goal</th>
                <th className={`${TH_CLS} w-[84px] text-center`}>Trend</th>
                {range.map((w) => (
                  <th key={w}
                      className={`px-1 py-2 text-[8px] font-bold uppercase tracking-wide text-center w-[46px] ${
                        w === endWeek ? 'text-pk bg-pc' : 'text-gr'
                      }`}>
                    {weekLabel(w)}
                  </th>
                ))}
                <th className={`${TH_CLS} w-[30px]`} />
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 && (
                <tr>
                  <td colSpan={range.length + 5} className="px-4 py-8 text-center text-[11px] text-gr">
                    No measurables yet. Add the first one to start the scorecard.
                  </td>
                </tr>
              )}
              {metrics.map((m) => {
                const values = range.map((w) => byCell.get(`${m.id}|${w}`)?.value ?? null);
                const current = scoreEntry(m, byCell.get(`${m.id}|${endWeek}`)?.value);
                const offTrack = current === 'red' || current === 'yellow';
                return (
                  <Fragment key={m.id}>
                  <tr className="border-b border-lt/60 hover:bg-pc/30">
                    <td className={`${TD_STICKY}`}>
                      <div className="flex items-start gap-1.5">
                        <button
                          onClick={() => canEdit && updateMetric(m.id, { is_primary: !m.is_primary })}
                          className={`text-[11px] leading-none pt-[3px] ${m.is_primary ? 'text-pk' : 'text-lt hover:text-gr'} ${canEdit ? '' : 'cursor-default'}`}
                          title={m.is_primary ? 'Primary metric' : 'Mark as primary'}
                        >★</button>
                        <div className="min-w-0">
                          <InlineText
                            value={m.name}
                            disabled={!canEdit}
                            onSave={(v) => v && updateMetric(m.id, { name: v })}
                            className="text-[11px] font-semibold text-dk block leading-tight"
                          />
                          {m.notes && <div className="text-[9px] text-gr leading-tight mt-0.5">{m.notes}</div>}
                          {/* Disclosure. Always present, so the count reads as
                              "none open" rather than the control vanishing. */}
                          <button
                            onClick={() => setOpenTodos((o) => ({ ...o, [m.id]: !o[m.id] }))}
                            aria-expanded={!!openTodos[m.id]}
                            className="mt-0.5 flex items-center gap-1 text-[9px] text-gr hover:text-pk"
                            title="To-Dos for this measurable"
                          >
                            <span className={`transition-transform ${openTodos[m.id] ? 'rotate-90' : ''}`}>▸</span>
                            {(todosByMetric.get(m.id)?.length ?? 0) > 0
                              ? `${todosByMetric.get(m.id).length} to-do${todosByMetric.get(m.id).length > 1 ? 's' : ''}`
                              : 'to-dos'}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <InlineText
                        value={m.owner}
                        disabled={!canEdit}
                        onSave={(v) => updateMetric(m.id, { owner: v })}
                        className="text-[10px]"
                        placeholder="owner"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <GoalCell metric={m} onSave={updateMetric} canEdit={canEdit} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Sparkline values={values} />
                    </td>
                    {range.map((w) => (
                      <Cell
                        key={w}
                        metric={m}
                        week={w}
                        entry={byCell.get(`${m.id}|${w}`)}
                        isCurrent={w === endWeek}
                        onSave={saveEntry}
                        canEdit={canEdit}
                      />
                    ))}
                    <td className="px-1 py-1.5 text-center">
                      {canEdit && offTrack && (
                        <button
                          onClick={() => dropToIssues(m)}
                          disabled={dropped[m.id]}
                          title={dropped[m.id] ? 'Already dropped to the Issues List' : 'Drop to the Issues List'}
                          className={`text-[11px] leading-none ${
                            dropped[m.id] ? 'text-emerald-500 cursor-default' : 'text-gr hover:text-pk'
                          }`}
                        >
                          {dropped[m.id] ? '✓' : '⚑'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {openTodos[m.id] && (
                    <TodoPanel
                      metric={m}
                      todos={todosByMetric.get(m.id) || []}
                      colSpan={range.length + 5}
                      canEdit={canEdit}
                      onToggle={toggleTodo}
                      onAdd={addTodo}
                    />
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {adding && <AddMetric onAdd={addMetric} onCancel={() => setAdding(false)} />}
        <div className="px-4 py-2 border-t border-lt text-[9px] text-gr">
          A measurable with no goal shows its number uncoloured — baseline 3–4 weeks before locking a weekly goal.
          Click a goal to set it; every past week re-scores against it immediately.
          {' '}⚑ drops an off-goal measurable to the Issues List with its week and number attached.
          {' '}▸ opens the To-Dos for a measurable — an open one keeps appearing every week until it is ticked off.
        </div>
      </SectionCard>
    </div>
  );
}
