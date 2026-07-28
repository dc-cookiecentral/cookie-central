# `supabase/manual/`

SQL that is **deliberately not a migration**: destructive, one-time, or
operator-judgement scripts that must never be swept up by `supabase db push`.

Anything in `supabase/migrations/` is fair game for `db push`, which decides what
to run from the **remote migration ledger** — not from what the database actually
contains. This repo has had that ledger drift out of sync more than once
(migrations applied by hand in the SQL editor are invisible to it), so a file
sitting in `migrations/` can be executed long after someone assumed it was
settled. For a destructive script that is a data-loss incident, not an
inconvenience.

**Run these by pasting them into the Supabase SQL editor, by hand, after reading
the header.** Never via `db push`.

| Script | What it does |
|---|---|
| `purge_non_cookulator_data.sql` | ONE-TIME, DESTRUCTIVE. `TRUNCATE`s 32 tables, preserving the 12-table Cookulator spine + system/config. Authorized in ADR-025 (carried item c). Never applied as of July 27, 2026. |
