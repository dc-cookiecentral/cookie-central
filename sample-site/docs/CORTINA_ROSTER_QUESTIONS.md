# Questions for Cortina — the sales rep roster

**Raised:** August 11, 2026
**Source:** "Cortina OF Sales Mktg Innovations Supplier Partners List.xlsx" (Employee Directory, 26 rows), loaded into `sales_reps` as 25 rows on Aug 11.
**Why it matters:** the Salesperson selected on a sample order supplies `<BillTo><Email>`, which is **the address ShipStation emails** when the shipment goes out. A wrong address means a rep silently never hears about their own sample; a wrong *name* only mislabels `CustomField1`. So the email questions below are the load-bearing ones.

Current state: **28 reps live** — 25 Cortina + 3 Dirty Cookie (Caroline, David Landeck, Paul Hardy). Nothing here is blocking; the roster works as loaded. These are accuracy questions.

---

## 1. Is `murgese@cortinafoods.com` one person or two? — **highest priority**

The file lists that address **twice**, under two different names:

| Row | Name | Email |
|---|---|---|
| 5 | Cope, Maria Antonietta | murgese@CortinaFoods.com |
| 13 | Mery Urgese | murgese@CortinaFoods.com |

Our `email` column is unique, so this is currently **one row displaying both names**: `Maria Antonietta Cope / Mery Urgese`.

- If **one person** — which name should the dropdown show?
- If **two people** — what is the second person's email address?

*Impact:* if they are two people, one of them is currently unreachable — selecting the entry mails the other person's inbox.

## 2. Are these three email addresses correct? — **highest priority**

Three rows have a name and an address that don't obviously correspond. All three read like name changes or preferred names rather than typos, so they were loaded exactly as the file has them — but if any is wrong, that rep never receives a notification and nothing surfaces the failure.

| Name in file | Email in file | What looks off |
|---|---|---|
| FLYNN, ALEXA C | ahill@CortinaFoods.com | different surname (Hill / Flynn) |
| Robbins, Scott C | crobbins@onefrozen.com | initial is `c`, not `s` |
| Sandford, Heather | Heather.Sanford@onefrozen.com | name has a `d`, address does not |

## 3. Should everyone on this list be selectable?

The file is titled **"Sales Mktg Innovations Supplier Partners"**, which suggests it covers more than the sales team. Everyone loaded is now selectable as the notified party on a real sample shipment.

- Should marketing, innovation or supplier-partner contacts be **excluded** from the Salesperson dropdown?
- If so, which names?

*Note:* we don't delete people — an `active` flag hides them from new orders while past shipments keep showing their name.

## 4. Is the list complete and current?

- Anyone **missing** who places sample orders?
- Anyone who has **left** since the file was produced?
- How would you like to tell us about **joiners and leavers** going forward? A note to Caroline is enough; it's a one-line change.

## 5. One Frozen — same company or separate?

Six people carry `@onefrozen.com` addresses:

Melissa Elms · Desiree Hopkins · Jane A Lucas · Craig Monaco · Scott C Robbins · Heather Sandford

They are currently all labelled **Cortina**, treating One Frozen as part of the group.

- Should the dropdown show them as **One Frozen** instead, so the ordering person can tell the two apart?

## 6. How should names be displayed?

The file mixes two formats — `AGARWAL, AMIT K` and `David Rahal` — so all names were normalised to `First Last` and title-cased for a consistent, alphabetical dropdown.

One side effect worth confirming: **`LiDestri` now displays as `Lidestri`** (Jessica and John). Would you prefer the original capitalisation kept?

## 7. Confirm `david@cortinafoods.com` (David Rahal)

Short generic-looking addresses are sometimes aliases or shared mailboxes rather than a person's own inbox. Is this David Rahal's own address, and the right one to receive shipment notifications?

## 8. ~~Who is the ordering account?~~ — **answered Aug 11, no need to ask**

`samplesmngmt@cortinafoods.com`, displayed as **Samples Management**. Seeded and ready; it can sign in whenever Cortina is ready to start. Sign-in is by **magic link** — no password.

*Left here rather than deleted so the roster picture stays complete.*

## 9. Should anyone be copied on every shipment?

ShipStation can blind-copy a single address on every shipment and delivery email — `samplesmngmt@cortinafoods.com` is the intended one.

- Is that still right, and is one address enough?

---

## The 25 as currently loaded

For checking against your own records. Company is `Cortina` for all of them.

| Name shown in the dropdown | Email |
|---|---|
| Alexa C Flynn | ahill@cortinafoods.com |
| Amit K Agarwal | aagarwal@cortinafoods.com |
| Chris Posner | cposner@cortinafoods.com |
| Craig Monaco | craig.monaco@onefrozen.com |
| David A Bernhardt | dbernhardt@cortinafoods.com |
| David Rahal | david@cortinafoods.com |
| Desiree Hopkins | desiree.hopkins@onefrozen.com |
| Felipe Lavados | flavados@cortinafoods.com |
| Heather Sandford | heather.sanford@onefrozen.com |
| Jane A Lucas | jane.lucas@onefrozen.com |
| Jessica P Lidestri | jesslidestri@cortinafoods.com |
| John C. Lidestri | jlidestri@cortinafoods.com |
| Karl Sutaria | ksutaria@cortinafoods.com |
| Keresa Duke | kduke@cortinafoods.com |
| Liz Tierney Garrity | lgarrity@cortinafoods.com |
| Marci J Clark | mclark@cortinafoods.com |
| Maria Antonietta Cope / Mery Urgese | murgese@cortinafoods.com |
| Meghan Bailey | mbailey@cortinafoods.com |
| Melissa Elms | melissa.elms@onefrozen.com |
| Michael Christiansen | mchristiansen@cortinafoods.com |
| Michael Simon | msimon@cortinafoods.com |
| Sarah Blaine | sblaine@cortinafoods.com |
| Scott C Robbins | crobbins@onefrozen.com |
| Timothy Kitzman | timothy.kitzman@cortinafoods.com |
| Xiomara A Daza | xdaza@cortinafoods.com |

---

## Answers → what changes

| Question | If the answer changes something |
|---|---|
| 1 | Split into two `sales_reps` rows, or rename the one row |
| 2 | Update `email` on the affected rows |
| 3 | Set `active = false` on anyone who shouldn't be selectable |
| 4 | Insert joiners; `active = false` for leavers (history is preserved either way) |
| 5 | Set `company = 'One Frozen'` on those six |
| 6 | Restore `LiDestri` capitalisation on two rows |
| 7 | Update `email` if the alias isn't his inbox |
| 8 | Seed the account in `user_role_seeds` with `role='cortina'` **before** first sign-in |
| 9 | A ShipStation settings change, no code |

All of these are one-line changes. None require an app deploy — the dropdown reads the table live.

Recorded in **ADR-042**; the roster itself is `supabase/migrations/20260810120000_seed_cortina_sales_reps.sql`.
