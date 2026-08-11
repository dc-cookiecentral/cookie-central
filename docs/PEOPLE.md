# Cookie Central — People & Contacts

## Dirty Cookie (Internal)

| Person | Role | Email | Cookie Central Role | Notes |
|--------|------|-------|-------------------|-------|
| Shahira Marei | CEO / Founder | shahira@dirtycookie.com | admin | Final sign-off |
| Marc Bouthillette | COO | marc@dirtycookie.com | ops | Primary daily user, production planning |
| David Landeck | Biz Exec | david@dirtycookie.com | admin | Payment visibility, strategy |
| Paul | Biz Exec | paul@dirtycookie.com | admin | New hire, same access as David |
| Maria Restrepo | Ops | TBD | ops | PO confirmation alongside Marc — onboarding later |
| Caroline Friedrich | Consultant | systems@dirtycookie.com | admin | Builder, project lead — signs in via systems@ |

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
  `auth.users` — a rep is a name to display and an email to notify. Only the
  people in the tables above have accounts.
- **Six carry `@onefrozen.com` addresses** but are labelled `company = 'Cortina'`
  (One Frozen treated as part of the Cortina group).

Caroline and David Landeck are also in `sales_reps`, as `company = 'Dirty Cookie'`
— they are internal, and were added first as notification test recipients.

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
| systems@dirtycookie.com | Operational email — POs, BOLs, confirmations. CC'd on all PO threads. AI agent reads this. **Also the primary Cookie Central sign-in identity (admin role).** |
| orders@dirtycookie.com | Order-related CC |
| support@dirtycookie.com | Maria's email for PO confirmations |
| ap@branddetroit.com | Invoicing (BD Venture Studio) |

## Dirty Cookie Address
19431 Rue De Valore, Apt 55a, Foothill Ranch CA 92610

## Incoterms
FOB Detroit MI (both Walmart and Kroger POs)
