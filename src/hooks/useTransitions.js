import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Product transitions (BUILD_PLAN 6.5). Schema-backed by the `transitions`
// table. Checklist is jsonb (array of {task, done}); toggles persist via
// targeted UPDATE so multi-user edits don't clobber each other unless they
// raced on the same field.

const FIELDS = `
  id, transition_id, from_sku, to_sku, from_name, to_name,
  transition_type, launch_date, cutoff_date, status, notes, checklist
`;

export function useTransitions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('transitions')
      .select(FIELDS)
      .order('launch_date', { ascending: true });
    if (error) setError(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}

// Replace the checklist jsonb wholesale — the source of truth for the array
// itself is the latest row in Supabase, so we always pull the up-to-date
// checklist before mutating to limit clobber risk.
export async function toggleChecklistItem(transitionId, taskIndex) {
  const { data, error: getErr } = await supabase
    .from('transitions')
    .select('checklist')
    .eq('id', transitionId)
    .maybeSingle();
  if (getErr) return { error: getErr };
  const list = Array.isArray(data?.checklist) ? [...data.checklist] : [];
  if (!list[taskIndex]) return { error: { message: 'Task index out of range' } };
  list[taskIndex] = { ...list[taskIndex], done: !list[taskIndex].done };
  const { error } = await supabase
    .from('transitions')
    .update({ checklist: list })
    .eq('id', transitionId);
  return { error };
}

export async function createTransition(fields) {
  const checklist = [
    { task: 'New UPC assigned', done: false },
    { task: 'NetSuite product number', done: false },
    { task: 'Packaging ordered', done: false },
    { task: 'Assemblers adjusted', done: false },
    { task: 'DOT informed', done: false },
    { task: 'Old SKU depletion plan', done: false },
  ];
  const { error } = await supabase.from('transitions').insert({
    transition_id: fields.transition_id,
    from_sku: fields.from_sku || null,
    to_sku: fields.to_sku || null,
    from_name: fields.from_name,
    to_name: fields.to_name,
    transition_type: fields.transition_type || 'spec_change',
    launch_date: fields.launch_date || null,
    cutoff_date: fields.cutoff_date || null,
    status: 'planning',
    notes: fields.notes || null,
    checklist,
  });
  return { error };
}
