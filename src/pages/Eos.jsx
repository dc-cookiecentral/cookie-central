import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { L10_AGENDA, L10_TOTAL_MINUTES } from '../data/eosVto';
import { currentScorecardWeek, weekSpanLabel, meetingDateFor } from '../utils/eosWeek';
import { formatDate } from '../utils/dates';
import Scorecard from '../components/eos/Scorecard';
import Vto from '../components/eos/Vto';
import AccountabilityChart from '../components/eos/AccountabilityChart';
import Rocks from '../components/eos/Rocks';
import IssuesList from '../components/eos/IssuesList';
import Todos from '../components/eos/Todos';

// EOS — the Entrepreneurial Operating System tracker.
//
// Built to be opened live in the weekly Level 10: the Scorecard is the landing
// tab because that is where the meeting spends its first five minutes, and
// everything an off-track number produces (an Issue, then a To-Do) is one click
// away in the same page.
//
// Tabs unmount when you leave them. That is deliberate — coming back to the
// Issues List refetches it, so the issue someone just dropped from the Scorecard
// is there when the team looks, without any cross-tab cache to keep honest.

const TABS = [
  { key: 'scorecard', label: 'Weekly Scorecard' },
  { key: 'issues',    label: 'Issues' },
  { key: 'rocks',     label: 'Rocks' },
  { key: 'todos',     label: 'To-Dos' },
  { key: 'chart',     label: 'Accountability Chart' },
  { key: 'vto',       label: 'V/TO' },
];

// The canonical 90-minute agenda, collapsed by default. Useful for the first
// few meetings and easy to ignore afterwards.
function AgendaBar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-cd border border-lt rounded-xl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-left"
      >
        <span className="text-[10px] font-bold text-dk">
          Level 10 agenda
          <span className="text-gr font-medium"> · {L10_TOTAL_MINUTES} minutes, same order every week</span>
        </span>
        <span className="text-[10px] text-gr">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {L10_AGENDA.map((a) => (
            <div key={a.key} className="border border-lt rounded-lg px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-bold text-dk">{a.label}</span>
                <span className="text-[9px] text-pk font-semibold whitespace-nowrap">{a.minutes} min</span>
              </div>
              <div className="text-[9px] text-gr leading-snug mt-0.5">{a.hint}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Eos() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('scorecard');

  // Every internal role runs the meeting — in a live Level 10 one person drives
  // the screen for everyone. The Cortina role never reaches this route (the
  // InternalOnly gate in App.jsx redirects it), and RLS refuses its writes too.
  const canEdit = ['admin', 'finance', 'ops'].includes(profile?.role);

  const week = currentScorecardWeek();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-bold text-dk leading-tight">EOS</h1>
          <div className="text-[10px] text-gr">
            Entrepreneurial Operating System · next Level 10 {formatDate(meetingDateFor(week))} ·
            {' '}reviewing the week of {weekSpanLabel(week)}
          </div>
        </div>
        {!canEdit && (
          <div className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            Read-only for your role
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'px-3 py-1.5 rounded-lg text-[11px] font-bold bg-pk text-white'
                : 'px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-cd border border-lt text-md hover:border-pk hover:text-pk'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'scorecard' && (
        <div className="space-y-3">
          <AgendaBar />
          <Scorecard canEdit={canEdit} />
        </div>
      )}
      {tab === 'issues' && <IssuesList canEdit={canEdit} />}
      {tab === 'rocks' && <Rocks canEdit={canEdit} />}
      {tab === 'todos' && <Todos canEdit={canEdit} />}
      {tab === 'chart' && <AccountabilityChart canEdit={canEdit} />}
      {tab === 'vto' && <Vto />}
    </div>
  );
}
