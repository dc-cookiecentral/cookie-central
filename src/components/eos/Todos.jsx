import { useState } from 'react';
import { useTodos } from '../../hooks/useEos';
import { currentScorecardWeek, addWeeks, weekLabel } from '../../utils/eosWeek';
import { SectionCard, InlineText, BTN_PK } from './bits';

// The To-Do list — seven-day commitments made in the meeting.
//
// Distinct from Rocks (90 days) and from Issues (things to solve rather than
// things to do). EOS expects 90% of these done each week; the completion rate in
// the header is the number the team is actually accountable for.

export default function Todos({ canEdit }) {
  const { todos, loading, error, insert, update, remove } = useTodos();
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');

  const openTodos = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);
  const rate = todos.length ? Math.round((doneTodos.length / todos.length) * 100) : null;

  const add = async () => {
    if (!title.trim()) return;
    const week = currentScorecardWeek();
    const ok = await insert({
      title: title.trim(),
      owner: owner.trim() || null,
      created_week: week,
      due_week: addWeeks(week, 1),
    });
    if (ok) { setTitle(''); setOwner(''); }
  };

  const toggle = (t) =>
    update(t.id, { done: !t.done, done_at: t.done ? null : new Date().toISOString() });

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading to-dos…</div>;
  if (error) return <div className="text-sm text-red-600 py-6">{error}</div>;

  const row = (t) => (
    <tr key={t.id} className="border-b border-lt/60 hover:bg-pc/30">
      <td className="px-3 py-2 w-[30px]">
        <input
          type="checkbox"
          checked={t.done}
          disabled={!canEdit}
          onChange={() => toggle(t)}
          className="accent-pk"
        />
      </td>
      <td className="px-2 py-2">
        <InlineText
          value={t.title}
          disabled={!canEdit}
          onSave={(v) => v && update(t.id, { title: v })}
          className={`text-[11px] block leading-snug ${t.done ? 'text-gr line-through' : 'text-dk font-medium'}`}
        />
        {t.issue_id && (
          <span className="text-[8px] uppercase tracking-wider text-gr">from an issue</span>
        )}
      </td>
      <td className="px-2 py-2 w-[110px]">
        <InlineText
          value={t.owner}
          disabled={!canEdit}
          onSave={(v) => update(t.id, { owner: v })}
          placeholder="owner"
          className="text-[10px]"
        />
      </td>
      <td className="px-2 py-2 w-[76px] text-[9px] text-gr whitespace-nowrap">
        {t.due_week ? `due ${weekLabel(t.due_week)}` : '—'}
      </td>
      <td className="px-2 py-2 w-[26px] text-right">
        {canEdit && (
          <button
            onClick={() => window.confirm(`Delete "${t.title}"?`) && remove(t.id)}
            className="text-[11px] text-lt hover:text-red-500"
            title="Delete"
          >×</button>
        )}
      </td>
    </tr>
  );

  return (
    <SectionCard
      title={`To-Do List · ${openTodos.length} open`}
      subtitle={
        rate == null
          ? 'Seven-day action items from the meeting. EOS expects 90% done each week.'
          : `${rate}% complete · seven-day action items from the meeting. EOS expects 90% done each week.`
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {todos.length === 0 && (
              <tr><td className="px-4 py-8 text-center text-[11px] text-gr">Nothing on the list.</td></tr>
            )}
            {openTodos.map(row)}
            {doneTodos.length > 0 && (
              <tr>
                <td colSpan={5} className="px-3 pt-3 pb-1 text-[8px] uppercase tracking-wider text-gr">
                  Done · {doneTodos.length}
                </td>
              </tr>
            )}
            {doneTodos.map(row)}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-lt bg-pc/40">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Seven-day to-do…"
            className="flex-1 border border-lt rounded px-2 py-1 text-[11px] outline-none focus:border-pk"
          />
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Owner"
            className="w-28 border border-lt rounded px-2 py-1 text-[11px] outline-none focus:border-pk"
          />
          <button onClick={add} className={BTN_PK}>Add</button>
        </div>
      )}
    </SectionCard>
  );
}
