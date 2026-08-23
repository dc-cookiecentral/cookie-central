import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { weekRange } from '../utils/eosWeek';

// Data layer for the EOS tracker. Every hook follows the same shape as the rest
// of the app: { rows, loading, error, refetch } plus whatever mutators the
// section needs, each of which refetches so two people driving the same L10
// converge on a reload.

function useTable(table, { order = 'sort_order', filter } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    let q = supabase.from(table).select('*');
    if (filter) q = filter(q);
    if (order) q = q.order(order, { ascending: true });
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else { setRows(data || []); setError(null); }
    setLoading(false);
  }, [table, order, filter]);

  useEffect(() => { refetch(); }, [refetch]);

  const insert = useCallback(async (row) => {
    const { error: err } = await supabase.from(table).insert(row);
    if (err) { setError(err.message); return false; }
    await refetch();
    return true;
  }, [table, refetch]);

  const update = useCallback(async (id, patch) => {
    const { error: err } = await supabase.from(table).update(patch).eq('id', id);
    if (err) { setError(err.message); return false; }
    await refetch();
    return true;
  }, [table, refetch]);

  const remove = useCallback(async (id) => {
    const { error: err } = await supabase.from(table).delete().eq('id', id);
    if (err) { setError(err.message); return false; }
    await refetch();
    return true;
  }, [table, refetch]);

  return { rows, loading, error, refetch, insert, update, remove };
}

// ── Accountability Chart ───────────────────────────────────────────────────
const ACTIVE_SEATS = (q) => q.eq('active', true);

// The order the foundation document lists them in. A function added later falls
// in after these four rather than disappearing.
const FUNCTION_ORDER = ['Leadership', 'Sales', 'Operations', 'Finance'];

export function useSeats() {
  const { rows, ...rest } = useTable('eos_seats', { filter: ACTIVE_SEATS });
  const groups = useMemo(() => {
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.major_function)) by.set(r.major_function, []);
      by.get(r.major_function).push(r);
    }
    return [...by.entries()].sort(
      (a, b) => (FUNCTION_ORDER.indexOf(a[0]) + 1 || 99) - (FUNCTION_ORDER.indexOf(b[0]) + 1 || 99)
    );
  }, [rows]);
  return { seats: rows, groups, ...rest };
}

// ── Rocks ──────────────────────────────────────────────────────────────────
export function useRocks(quarter) {
  const filter = useCallback((q) => q.eq('quarter', quarter), [quarter]);
  const { rows, ...rest } = useTable('eos_rocks', { filter });
  return { rocks: rows, ...rest };
}

// Every quarter that has Rocks, newest first — drives the quarter picker.
export function useRockQuarters() {
  const [quarters, setQuarters] = useState([]);
  useEffect(() => {
    supabase.from('eos_rocks').select('quarter').then(({ data }) => {
      setQuarters([...new Set((data || []).map((r) => r.quarter))].sort().reverse());
    });
  }, []);
  return quarters;
}

// ── Issues & To-Dos ────────────────────────────────────────────────────────
export function useIssues() {
  const { rows, ...rest } = useTable('eos_issues');
  const open = useMemo(() => rows.filter((r) => r.status === 'open'), [rows]);
  const parked = useMemo(() => rows.filter((r) => r.status === 'parked'), [rows]);
  const closed = useMemo(
    () => rows.filter((r) => r.status === 'solved' || r.status === 'dropped'),
    [rows]
  );
  return { issues: rows, open, parked, closed, ...rest };
}

export function useTodos() {
  const { rows, ...rest } = useTable('eos_todos', { order: 'created_at' });
  return { todos: rows, ...rest };
}

// Module-level, NOT inline. `useTable` lists `filter` in its refetch
// useCallback deps, so a fresh arrow on every render would give refetch a new
// identity every render, and its useEffect would refetch forever.
const METRIC_TODO_QUERY = {
  order: 'created_week',
  filter: (q) => q.not('metric_id', 'is', null),
};

// To-Dos that hang off a Scorecard measurable, keyed by metric_id.
//
// ⚠️ OPEN ITEMS ARE NOT FILTERED BY WEEK, and that is the whole carry-forward
// mechanic: a To-Do raised against a measurable keeps appearing under it every
// week until someone checks it off. There is no cron and nothing copies rows
// forward — copying would create one duplicate per week, each needing its own
// tick, which is exactly the mess the three identical "P0 · Transition to
// FreshCoast" rows already demonstrate.
//
// Done items ARE dropped from the map, so the row collapses back to nothing the
// moment the last one is ticked.
export function useMetricTodos() {
  const { rows, refetch, update, insert, loading, error } = useTable('eos_todos', METRIC_TODO_QUERY);
  const byMetric = useMemo(() => {
    const m = new Map();
    for (const t of rows) {
      if (t.done) continue;
      const list = m.get(t.metric_id) || [];
      list.push(t);
      m.set(t.metric_id, list);
    }
    return m;
  }, [rows]);
  return { byMetric, refetch, update, insert, loading, error };
}

// ── Scorecard ──────────────────────────────────────────────────────────────
// Metrics plus a window of entries. `weeks` is how many columns the trend grid
// shows; EOS convention is 13 (one quarter), and the source document's own
// scorecard is laid out that way.
export function useScorecard(endWeek, weeks = 13) {
  const [metrics, setMetrics] = useState([]);
  const [entries, setEntries] = useState([]);      // raw rows
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const range = useMemo(() => weekRange(endWeek, weeks), [endWeek, weeks]);

  const refetch = useCallback(async () => {
    const [m, e] = await Promise.all([
      supabase.from('eos_scorecard_metrics').select('*')
        .eq('active', true).order('sort_order', { ascending: true }),
      supabase.from('eos_scorecard_entries').select('*')
        .gte('week_start', range[0]).lte('week_start', range[range.length - 1]),
    ]);
    if (m.error || e.error) setError((m.error || e.error).message);
    else {
      setMetrics(m.data || []);
      setEntries(e.data || []);
      setError(null);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { refetch(); }, [refetch]);

  // `${metric_id}|${week_start}` → entry. One lookup per cell in the grid.
  const byCell = useMemo(() => {
    const map = new Map();
    for (const row of entries) map.set(`${row.metric_id}|${row.week_start}`, row);
    return map;
  }, [entries]);

  // Save one cell. An empty value DELETES the row rather than storing NULL, so
  // "never entered" and "entered as blank" stay the same thing — otherwise a
  // mis-key that gets cleared leaves a ghost row that reads as a real zero-less
  // entry in later reporting.
  const saveEntry = useCallback(async (metricId, weekStart, value, note) => {
    const blank = value === '' || value == null;
    const existing = byCell.get(`${metricId}|${weekStart}`);
    let err;
    if (blank && !note) {
      if (!existing) return true;
      ({ error: err } = await supabase.from('eos_scorecard_entries').delete().eq('id', existing.id));
    } else {
      const { data: auth } = await supabase.auth.getUser();
      ({ error: err } = await supabase.from('eos_scorecard_entries').upsert(
        {
          metric_id: metricId,
          week_start: weekStart,
          value: blank ? null : Number(value),
          note: note ?? existing?.note ?? null,
          entered_by: auth?.user?.id ?? null,
        },
        { onConflict: 'metric_id,week_start' }
      ));
    }
    if (err) { setError(err.message); return false; }
    await refetch();
    return true;
  }, [byCell, refetch]);

  const updateMetric = useCallback(async (id, patch) => {
    const { error: err } = await supabase.from('eos_scorecard_metrics').update(patch).eq('id', id);
    if (err) { setError(err.message); return false; }
    await refetch();
    return true;
  }, [refetch]);

  const addMetric = useCallback(async (row) => {
    const max = metrics.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
    const { error: err } = await supabase.from('eos_scorecard_metrics')
      .insert({ sort_order: max + 10, ...row });
    if (err) { setError(err.message); return false; }
    await refetch();
    return true;
  }, [metrics, refetch]);

  return { metrics, entries, byCell, range, loading, error, refetch, saveEntry, updateMetric, addMetric };
}

// ── The meeting record ─────────────────────────────────────────────────────
export function useMeeting(weekStart) {
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('eos_meetings').select('*')
      .eq('week_start', weekStart).maybeSingle();
    setMeeting(data || null);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { refetch(); }, [refetch]);

  const save = useCallback(async (patch) => {
    const { error } = await supabase.from('eos_meetings')
      .upsert({ week_start: weekStart, ...patch }, { onConflict: 'week_start' });
    if (!error) await refetch();
    return !error;
  }, [weekStart, refetch]);

  return { meeting, loading, save, refetch };
}

// ── Cross-tab writes ───────────────────────────────────────────────────────
// The Level 10 moves work between sections: an off-track measurable or Rock
// "drops down to the Issues List", and solving an issue produces a To-Do. Those
// writes originate in a tab that does not own the target hook, so they are plain
// functions rather than hook methods. The destination tab refetches when it
// mounts, which is exactly when anyone looks at it.
export async function createIssue(row) {
  const { data, error } = await supabase.from('eos_issues')
    .insert({ status: 'open', ...row }).select().single();
  return { data, error };
}

export async function createTodo(row) {
  const { data, error } = await supabase.from('eos_todos').insert(row).select().single();
  return { data, error };
}
