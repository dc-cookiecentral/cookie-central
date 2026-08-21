import { useState } from 'react';
import { useIssues, createTodo } from '../../hooks/useEos';
import { currentScorecardWeek, weekLabel } from '../../utils/eosWeek';
import { SectionCard, InlineText, BTN, BTN_PK, StatusToggle } from './bits';

// The Issues List — IDS: Identify, Discuss, Solve.
//
// Three lists, one table. Open issues are the working set and carry the 1-2-3
// priority the team assigns at the top of IDS. Parked is the source document's
// Parking Lot — future topics that are real but not this quarter — and lives in
// the same table so promoting one is a status change made during the meeting
// rather than a retyping. Solved keeps the solution text, which is the only
// record of what the team actually decided.

const STATUS_OPTIONS = [
  { value: 'open',    label: 'Open',    active: 'bg-pk text-white' },
  { value: 'solved',  label: 'Solved',  active: 'bg-emerald-500 text-white' },
  { value: 'parked',  label: 'Parked',  active: 'bg-slate-400 text-white' },
  { value: 'dropped', label: 'Dropped', active: 'bg-gr text-white' },
];

function PriorityPicker({ value, onChange, disabled }) {
  return (
    <div className="inline-flex gap-0.5">
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          disabled={disabled}
          onClick={() => onChange(value === n ? null : n)}
          title={value === n ? 'Clear priority' : `Solve #${n} this week`}
          className={`w-[18px] h-[18px] rounded text-[9px] font-bold ${
            value === n ? 'bg-pk text-white' : 'bg-bg text-lt hover:text-gr'
          } ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function IssueRow({ issue, canEdit, update, remove, onMakeTodo }) {
  const [solving, setSolving] = useState(false);
  const [solution, setSolution] = useState(issue.solution || '');

  const solve = async () => {
    await update(issue.id, {
      status: 'solved',
      solution: solution.trim() || null,
      solved_week: currentScorecardWeek(),
    });
    setSolving(false);
  };

  return (
    <>
      <tr className="border-b border-lt/60 hover:bg-pc/30 align-top">
        <td className="px-2 py-2 w-[54px]">
          {issue.status === 'open' && (
            <PriorityPicker
              value={issue.priority}
              disabled={!canEdit}
              onChange={(p) => update(issue.id, { priority: p })}
            />
          )}
        </td>
        <td className="px-2 py-2">
          <InlineText
            value={issue.title}
            disabled={!canEdit}
            onSave={(v) => v && update(issue.id, { title: v })}
            className="text-[11px] font-semibold text-dk block leading-snug"
          />
          <InlineText
            value={issue.detail}
            disabled={!canEdit}
            multiline
            onSave={(v) => update(issue.id, { detail: v })}
            placeholder="add detail"
            className="text-[9px] text-gr block leading-snug mt-0.5"
          />
          {issue.solution && (
            <div className="text-[9px] text-emerald-700 mt-1 leading-snug">
              <span className="font-semibold uppercase tracking-wider text-[8px]">Solved</span>
              {issue.solved_week ? ` · week of ${weekLabel(issue.solved_week)}` : ''} — {issue.solution}
            </div>
          )}
        </td>
        <td className="px-2 py-2 w-[110px]">
          <InlineText
            value={issue.owner}
            disabled={!canEdit}
            onSave={(v) => update(issue.id, { owner: v })}
            placeholder="owner"
            className="text-[10px]"
          />
        </td>
        <td className="px-2 py-2 w-[70px] text-[9px] text-gr whitespace-nowrap">
          {issue.raised_week ? weekLabel(issue.raised_week) : '—'}
        </td>
        <td className="px-2 py-2 w-[230px]">
          {canEdit && (
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <StatusToggle
                value={issue.status}
                options={STATUS_OPTIONS}
                onChange={(s) => (s === 'solved' ? setSolving(true) : update(issue.id, { status: s }))}
              />
              <button onClick={() => onMakeTodo(issue)} className={BTN} title="Create a seven-day to-do from this issue">
                + To-Do
              </button>
              <button
                onClick={() => window.confirm(`Delete "${issue.title}"?`) && remove(issue.id)}
                className="text-[11px] text-lt hover:text-red-500 px-1"
                title="Delete"
              >×</button>
            </div>
          )}
        </td>
      </tr>
      {solving && (
        <tr className="bg-emerald-50/60 border-b border-lt">
          <td />
          <td colSpan={4} className="px-2 py-2">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && solve()}
                placeholder="What did the team decide? (the only record of the solve)"
                className="flex-1 border border-emerald-300 rounded px-2 py-1 text-[11px] outline-none focus:border-emerald-500"
              />
              <button onClick={solve} className={BTN_PK}>Mark solved</button>
              <button onClick={() => setSolving(false)} className={BTN}>Cancel</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AddIssue({ onAdd, status }) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');

  const submit = async () => {
    if (!title.trim()) return;
    const ok = await onAdd({
      title: title.trim(),
      owner: owner.trim() || null,
      status,
      raised_week: status === 'open' ? currentScorecardWeek() : null,
    });
    if (ok) { setTitle(''); setOwner(''); }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-lt bg-pc/40">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={status === 'parked' ? 'Park a future topic…' : 'Identify an issue…'}
        className="flex-1 border border-lt rounded px-2 py-1 text-[11px] outline-none focus:border-pk"
      />
      <input
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Owner"
        className="w-28 border border-lt rounded px-2 py-1 text-[11px] outline-none focus:border-pk"
      />
      <button onClick={submit} className={BTN_PK}>Add</button>
    </div>
  );
}

function IssueTable({ rows, canEdit, update, remove, onMakeTodo, emptyText }) {
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-center text-[11px] text-gr">{emptyText}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((i) => (
            <IssueRow key={i.id} issue={i} canEdit={canEdit} update={update} remove={remove} onMakeTodo={onMakeTodo} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function IssuesList({ canEdit }) {
  const { open, parked, closed, loading, error, insert, update, remove } = useIssues();
  const [showClosed, setShowClosed] = useState(false);

  // Open issues sort by the team's 1-2-3 pick first, then by their manual order.
  const openSorted = [...open].sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99) || (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const makeTodo = async (issue) => {
    const { error: err } = await createTodo({
      title: issue.title,
      owner: issue.owner,
      created_week: currentScorecardWeek(),
      issue_id: issue.id,
    });
    window.alert(err ? err.message : `Added to the To-Do list: "${issue.title}"`);
  };

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading issues…</div>;
  if (error) return <div className="text-sm text-red-600 py-6">{error}</div>;

  return (
    <div className="space-y-3">
      <SectionCard
        title={`Issues List · ${open.length} open`}
        subtitle="Identify · Discuss · Solve. Number the top three to work this week; everything else waits. Off-goal measurables and off-track Rocks land here."
      >
        <IssueTable
          rows={openSorted}
          canEdit={canEdit}
          update={update}
          remove={remove}
          onMakeTodo={makeTodo}
          emptyText="No open issues. Either a very good week, or nobody is being honest."
        />
        {canEdit && <AddIssue onAdd={insert} status="open" />}
      </SectionCard>

      <SectionCard
        title={`Parking Lot · ${parked.length}`}
        subtitle="Future topics — real, but not this quarter. Move one to Open when the team is ready to solve it."
      >
        <IssueTable
          rows={parked}
          canEdit={canEdit}
          update={update}
          remove={remove}
          onMakeTodo={makeTodo}
          emptyText="Nothing parked."
        />
        {canEdit && <AddIssue onAdd={insert} status="parked" />}
      </SectionCard>

      <SectionCard
        title={`Solved & dropped · ${closed.length}`}
        right={
          <button onClick={() => setShowClosed((v) => !v)} className={BTN}>
            {showClosed ? 'Hide' : 'Show'}
          </button>
        }
        subtitle="The record of what the team decided. Worth reading before re-solving something."
      >
        {showClosed && (
          <IssueTable
            rows={closed}
            canEdit={canEdit}
            update={update}
            remove={remove}
            onMakeTodo={makeTodo}
            emptyText="Nothing solved yet."
          />
        )}
      </SectionCard>
    </div>
  );
}
