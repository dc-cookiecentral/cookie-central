-- po_line_items: keep the promoted columns populated whatever build writes the rows
--
-- 20260824150000 promoted actual_delivery_date and cut_reason out of metadata
-- into real columns, and src/parsers/walmartOrders.js has written them since.
-- But the nightly Cortina ingest runs through the gmail-extract Edge Function,
-- whose DEPLOYED bundle predates that change: observed 2026-10-27, all 1,858
-- po_line_items rows had both columns NULL while 1,574 carried
-- metadata->>'actual_delivery_date'. The Demand Planner buckets delivered
-- cases/revenue and cut counts from these columns, so they silently read zero.
--
-- This trigger makes the columns self-healing on every insert/update. It fixes
-- actual_delivery_date outright (the stale bundle does write it into metadata).
-- cut_reason has NO metadata fallback in the stale bundle — the trigger only
-- future-proofs it; the real fix is redeploying gmail-extract:
--   supabase functions deploy gmail-extract
-- after which the next nightly cumulative import backfills cut reasons on
-- every PO still present in the export.

create or replace function public.po_line_items_promote_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.actual_delivery_date is null
     and coalesce(new.metadata->>'actual_delivery_date', '') ~ '^\d{4}-\d{2}-\d{2}' then
    new.actual_delivery_date := (new.metadata->>'actual_delivery_date')::date;
  end if;
  if new.cut_reason is null and coalesce(new.metadata->>'cut_reason', '') <> '' then
    new.cut_reason := new.metadata->>'cut_reason';
  end if;
  return new;
end
$$;

drop trigger if exists po_line_items_promote_metadata on public.po_line_items;
create trigger po_line_items_promote_metadata
  before insert or update on public.po_line_items
  for each row execute function public.po_line_items_promote_metadata();

-- One-time backfill of rows already in place (idempotent).
update public.po_line_items
   set actual_delivery_date = (metadata->>'actual_delivery_date')::date
 where actual_delivery_date is null
   and coalesce(metadata->>'actual_delivery_date', '') ~ '^\d{4}-\d{2}-\d{2}';

update public.po_line_items
   set cut_reason = metadata->>'cut_reason'
 where cut_reason is null
   and coalesce(metadata->>'cut_reason', '') <> '';
