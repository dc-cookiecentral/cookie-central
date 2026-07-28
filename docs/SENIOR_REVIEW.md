# Cookie Central — Senior Review (pre-build)

**Scope:** Two modules — **Spec Sheet** (the Cookulator: BOM/product engine) and **Sample Central** (the Cortina sample-ordering site). This review covers architecture, the ShipStation integration, UI/UX, and holistic project health. It's the checkpoint before code is written for the Claude Code / GitHub / Supabase / Vercel build.

**Bottom line:** The prototypes are in good shape and the data model is sound. The single most important thing to get right in the real build is that **derived values must never be stored** — they must be computed at read time. Almost every risk below traces back to that one principle. Keep the build simple: one shared database, two front-end modules, one clean integration boundary to ShipStation.

---

## 1. Architecture review

### What's right and should carry over verbatim
- **One product spine, two views.** The Cookulator defines products; Sample Central consumes a filtered slice of them. This is correct — do **not** let Sample Central keep its own product list. It reads from the same tables.
- **`sample_eligible` as the bridge.** A single boolean on the product, written in the Cookulator (edit-gated), read by Sample Central. One source of truth. This is the right seam between the modules.
- **Composition by reference.** Master cases reference cookies/eaches/inners by code; the price list is a *join*, not a table. Weights roll down from the cookie dough. Keep this.

### The core rule for the build (non-negotiable)
**Never store a derived field.** In the prototype these are computed on render; in Supabase the temptation will be to save them to columns. Don't. The derived values are:
- **Storage/temp** from prep (Baked → Ambient, Raw → Frozen)
- **Net weight** of a case from its composition (rolls down to cookie dough oz)
- **Ship temperature** of a sample shipment from its line items (any raw → Cold)
- **The entire price list** (a view over master cases + their composition)

Store them and they drift the moment a source value changes. Compute them in a database **view** or at query time. This is the one architectural decision that, if gotten wrong, quietly corrupts everything downstream.

### Recommended data model (keep it simple)
A single Postgres/Supabase schema, roughly:
- `products` (the cookie atom: code, desc, flavor, tier, form, dough_oz, prep, allergens, ingredients, nutrition, **sample_eligible**)
- `eaches`, `inners`, `master_cases` — packaging levels, each referencing the level below by code (foreign keys, never display strings)
- `price_list` — a **VIEW**, not a table (master cases joined to composition + a thin `pricing` table that owns only the TBD prices)
- `users` (salespeople: name, **email**, **active_in_dropdown** boolean)
- `addresses` (ship-to book)
- `shipments` + `shipment_items` (items reference product by **code**; store salesperson by **user id** so history survives dropdown changes)
- `templates` (saved assortments: hold product codes + qty, not display strings)

### Two things to formalize that were prototype shortcuts
1. **Salespeople** move from a hardcoded list to the `users` table — email pulled for confirmations, `active_in_dropdown` controls visibility. (Already noted in the app's Build Notes panel.)
2. **Templates** become user-manageable ("save this shipment as a template") rather than seeded.

---

## 2. ShipStation integration — pitfalls review

This is where the real risk lives. The prototype's integration panel already documents most of this; here it is consolidated as a build checklist.

### The pitfalls, ranked by how badly they bite

1. **SKU rules break on multi-item orders — THE big one.** ShipStation's Item-SKU automation criteria silently ignore any order with more than one product. A sample manifest is almost always multi-item. **Fix:** never rule on raw SKU. Tag the *product records* in ShipStation (raw SKUs → `cold-chain`), then write automation rules against the **order tag**. Order-tag criteria work on multi-item orders. This tag vocabulary (`cold-chain`, `custom-box`) is the integration contract — lock it with the co-man before writing code. *(As built: speed never became a tag — it rides the native `ShippingMethod` element. See ADR-028.)*

2. **Derived fields don't map 1:1 to ShipStation's schema.** Temp state, box spec, collateral have no native order fields. Split them: *product-inherent* attributes (cold chain) → ShipStation product tags + rules; *order-level* choices (box, custom-request) → order tags/CustomFields the app pushes at create time.

3. **Collateral & warming instructions ride the packing slip.** Confirmed against the API: push the collateral list (incl. warming instructions) into an order **Notes** field, then add a Field Replacement token (`[Notes to Buyer]`, etc.) to a custom packing-slip template. **Watch the 100-char limit** on Custom Fields 1–3 — a long list truncates silently; use a Notes field instead.

4. **Custom product requests have no SKU.** They can't be a ShipStation line item that maps to stock. Ride them as an order note + the project number, and treat them as **human-in-the-loop** — automation can't pick a bespoke item.

5. **No "order update" webhook.** ShipStation notifies on new orders and on ship, but not on arbitrary edits. If a leader edits a shipment after pushing, plan a deliberate re-push/patch — the two systems can silently diverge.

6. **Rules run once, on import.** Edits to an order already in Awaiting Shipment don't re-trigger rules. Same re-push discipline as #5.

7. **Immutable once shipped; rate limit ~40/min.** Edits must land before fulfillment. Batch entry must queue and back off.

8. **Email config is ShipStation-side, in two places.** The CC of `samplesmngmt@cortinafoods.com`: the **Blind Copy on Shipment and Delivery Email** field covers shipment + delivery (it's a BCC, both together). The outbound **order confirmation** to the salesperson is a separate recipient field — so "all orders, shipments, deliveries" means configuring it in **both** spots. Decide this explicitly.

9. **Auth & keys server-side only.** Keys expire (rotate before the first lapses); webhooks are signed (verify them). No key ever touches the front end — all ShipStation calls go through a Supabase Edge Function / server route.

10. **V1 vs V2 keys aren't interchangeable.** Order-create maturity is in V1; pick deliberately.

### The one strategic recommendation
**Build against a ShipStation sandbox/duplicate store first** (their own advice). Lock the tag vocabulary and SKU-to-tag map with the co-man before any integration code. That mapping *is* whether a raw cookie actually ships frozen.

---

## 3. UI/UX review

### Working well — keep
- **Spec Sheet:** the lock/edit-mode default (read-only until unlocked) is the right safety posture. Level-grouped column choosers and the interactive table (sort/filter/provenance) are strong for an operator audience.
- **Sample Central:** the Prep → Tier → Size catalog matches how samples are physically pulled. Mission Control is the emotional hook — it's the "I've never had this visibility" moment; protect it.
- **Shared design system** (aubergine `#2D2235` / pink `#C2185B` / Outfit) is consistent across both files. The waffle switcher ties them into one product. Verified both files carry identical tokens.

### Improvements to make in the build (small, high-value)
1. **Derived-temp badge needs a one-line "why."** It already shows "Auto (contains frozen items)" — keep that reasoning visible so a rep trusts it and doesn't reflexively override. Good as-is; don't lose it in the rebuild.
2. **Custom request = human-in-loop should be visible to the rep.** When someone submits a custom item, a subtle "this goes to manual review" cue sets expectations (it won't auto-fulfill like a catalog item).
3. **Empty/loading/error states.** The prototype is all happy-path with seeded data. The real app needs: empty states (no shipments yet, no addresses), loading states (data fetching), and failure states (ShipStation push failed — show it, don't swallow it). This is the biggest gap between prototype and production, and it's mostly mechanical.
4. **Confirmation on destructive/irreversible actions.** Deleting an address, removing a shipment — cheap to add, prevents real mistakes.
5. **Mobile.** Sales leaders enter requests on phones. The tables/drawer need a responsive pass — not a rebuild, just a breakpoint review.

### One clarity call
Keep the two modules **visually distinct enough** that a user always knows which one they're in (the Spec Sheet is internal/heavy; Sample Central is light/task-focused). They share a design system but shouldn't feel identical — the purple-forward Cookulator vs. the pink-forward Sample site already does this. Preserve it.

---

## 4. Holistic — project health & simplification

### Keep it simple: what NOT to build (yet)
- **No custom auth.** Use Supabase Auth. Role = a column on the user (internal vs. Cortina). The waffle/dropdown gate reads that column.
- **No premature Phase 2/3.** QBO, e-commerce, corp-gifting integrations are later. Phase 1 is: product spine + sample ordering + ShipStation push + status back. Resist scope creep into the other channels now.
- **No app-side duplication of ShipStation.** Box picking, email routing, label logic — all ShipStation's job. The app expresses *intent* (tags); ShipStation resolves *fulfillment*. This boundary is the thing that keeps the build small.

### Sequencing recommendation (for the build plan you'll ask for next)
1. **Data layer first** — schema + views + the derived-value discipline. Get the price-list-as-a-view and the roll-down math right before any UI.
2. **Spec Sheet (read) → Spec Sheet (edit)** — it's the source of truth; Sample Central depends on it.
3. **Sample Central** — reads `sample_eligible`, builds shipments.
4. **ShipStation integration last** — against the sandbox, tag-driven, server-side keys.

### The two risks most likely to cause pain
- **Derived-value drift** (Section 1) — architectural; prevent it with views, not columns.
- **The SKU-rule multi-item trap** (Section 2, #1) — integration; prevent it with the tag strategy.

Get those two right and the rest is standard CRUD-plus-a-webhook.

---

## Verdict

**Approved to proceed to a build plan.** The prototypes are a solid, coherent spec. The architecture is sound, the ShipStation risks are known and have documented mitigations, and the UX is appropriate to the two audiences. The build should stay deliberately simple: one Supabase schema with disciplined views, two front-end modules sharing a design system, and a single tag-driven, server-side ShipStation boundary. The two things to guard with your life: **compute derived values, never store them**, and **tag-based ShipStation rules, never raw-SKU rules**.
