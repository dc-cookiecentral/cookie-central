# Cookie Central — People & Contacts

## Dirty Cookie (Internal)

| Person | Role | Email | Cookie Central Role | Notes |
|--------|------|-------|-------------------|-------|
| Shahira Marei | CEO / Founder | shahira@dirtycookie.com | admin | Final sign-off |
| Marc Bouthillette | COO | marc@dirtycookie.com | ops | Primary daily user, production planning |
| David Landeck | Biz Exec | david@dirtycookie.com | admin | Payment visibility, strategy |
| Paul Hardy | President | paul@dirtycookie.com | admin | Also a `sales_reps` entry — places sample orders himself (`20260814120000`) |
| Maria Restrepo | Ops | TBD | ops | PO confirmation alongside Marc — onboarding later |
| Caroline Friedrich | Consultant | caroline@dirtycookie.com | admin | Builder, project lead. Seeded `20260806235500`; also a `sales_reps` entry. **`systems@` is a separate system account, not her sign-in** |

### Names used in the EOS tracker

`/eos` owner fields are **free text, not account FKs** — a seat or Rock can name someone with no login. Mapping to the roster above:

| EOS name | Roster entry |
|----------|--------------|
| Shahira | Shahira Marei |
| Marc | Marc Bouthillette — the late-July L10 notes spelled him *Mark*; normalised in `20260818130000` |
| Dave | David Landeck |
| Paul | Paul Hardy — **`PJ` was a third label for the same person** (metrics said `PJ`, Rocks said `Paul`, the seat said `Paul (PJ)`). All normalised to **`Paul`** on Aug 23 2026: 4 measurables and 2 seats (Integrator, Planning) |
| Caro | Caroline Friedrich — **`Caro` is the nickname and the name used throughout `/eos`** (normalised in `20260819120000`). Her full name stays here |

**Ellen** — finance. Owns **5 of the 13 measurables** (Weekly Sales, Sales Pipeline, Cash Balance & Forecast, AR, AP), the largest share of anyone. **Seeded Aug 23 2026** as `ellen@dirtycookie.com`, role **`finance`** — least privilege that still carries EOS write, since every EOS table allows `admin`/`finance`/`ops`. She has **not signed in yet**. Her surname is still not recorded anywhere; `full_name` is just "Ellen" and should be corrected when someone knows it.

**Still no account and no seed:** **Sean** (owns Rock 2, hiring the Biz Dev role) and **Serina** (a seat owner). Neither owns a measurable, so neither blocks the scorecard. ⚠️ If either signs in before being seeded, `COALESCE(seed.role,'ops')` provisions them as internal **`ops`** and `ON CONFLICT DO NOTHING` means it never self-corrects — the failure that hit the Cortina account on Aug 19. Seed first, always.

**Seat owners that are not people:** `HIRE #1`, `HIRE #2`, `HIRE #3` and `OPEN` are unfilled seats on the accountability chart, not names.

Named inside issues but not owners: Susie and Becky (Walmart CAPA / Bentonville requirements), Franz (Walmart system setup), Amit and Tim (Assemblers visit), John Lidestri. **Mark Cuban** appears in an issue title and is correctly spelled — unrelated to Marc Bouthillette.

## Cortina Foods (EDI Conduit / Financier)

| Person | Role | Email | Notes |
|--------|------|-------|-------|
| Harshita Gedela | Technical contact | hgedela@cortinafoods.com | NetSuite API/export, PO issuance |
| Noah LiDestri | PO issuance | via NetSuite (messages.6326413.*.netsuite.com) | Issues POs from NetSuite |
| John De Fina | Contact | TBD | |

**Cortina HQ:** 2 Van Riper Road, Montvale NJ 07645

### Sales reps (Sample Central)

The **25-person Cortina sales roster is not listed here** — it lives in the
`sales_reps` table, seeded by `supabase/migrations/20260810120000_seed_cortina_sales_reps.sql`
from "Cortina OF Sales Mktg Innovations Supplier Partners List.xlsx" (Aug 11,
2026). Duplicating it here would just create a second copy to keep in sync.

Read the live list with:

```sql
select full_name, email, company from sales_reps where active order by full_name;
```

Two things worth knowing about those rows:

- **They are not logins.** `sales_reps` is a lookup list with no link to
  `auth.users` — a rep is a name to display and an email to notify. The only
  accounts are the people in the table above plus the Cortina ordering account
  below; the 25 Cortina reps have none.
- **Six carry `@onefrozen.com` addresses** but are labelled `company = 'Cortina'`
  (One Frozen treated as part of the Cortina group).

Caroline, David Landeck and Paul Hardy are also in `sales_reps`, as
`company = 'Dirty Cookie'` — they are internal. The first two were added as
notification test recipients; Paul places sample orders himself. **28 active
rows total: 25 Cortina + 3 Dirty Cookie.**

**The one Cortina login is `samplesmngmt@cortinafoods.com`** ("Samples
Management", role `cortina`, seeded `20260811120000`) — one person entering
samples on behalf of all 25 reps. Seed anyone **before** their first sign-in:
`handle_new_auth_user` uses `COALESCE(seed.role, 'ops')` with
`ON CONFLICT (id) DO NOTHING`, so an unseeded first sign-in silently becomes
internal `ops` and seeding afterwards does not correct it.

## Partners

| Company | Role | Key contact | Notes |
|---------|------|-------------|-------|
| Assemblers (Chicago) | Co-packer, production, on-site storage | TBD | ~20 pallets FG + raw materials + packaging |
| Summit (Chicago) | Overflow freezer storage | TBD | Near Assemblers |
| DOT Foods | Redistributor | TBD | Flow-through to Walmart/Kroger DCs |
| Bentonville Merchants | Broker (Walmart) | Blayn (blayn@bentonvillemerchants.com) | Weekly Retail Link reports |
| St Charles | Raw material distributor | TBD | Ardent Mills, Domino, REESE'S, Monila |
| Dawn | Raw material distributor | TBD | Gold Medal, C&H, Barry Callebaut, Michael Foods, Smucker's |

## System Emails

| Address | Purpose |
|---------|---------|
| systems@dirtycookie.com | Operational email — POs, BOLs, confirmations. CC'd on all PO threads. AI agent reads this. **Also a Cookie Central admin account in its own right ("Systems (Dirty Cookie)") — a system identity, not any individual's sign-in.** |
| orders@dirtycookie.com | Order-related CC |
| support@dirtycookie.com | Maria's email for PO confirmations |
| ap@branddetroit.com | Invoicing (BD Venture Studio) |

## Dirty Cookie Address
19431 Rue De Valore, Apt 55a, Foothill Ranch CA 92610

## Incoterms
FOB Detroit MI (both Walmart and Kroger POs)
