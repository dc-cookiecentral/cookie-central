// ─────────────────────────────────────────────────────────────────────────
// Suggested actions for Walmart compliance issues (Nov 9 2026).
//
// One rule per issue Walmart has actually charged us for (SQEP Total
// Compliance Table, Mar–Nov 2026) plus the OTIF miss causes. Each rule says
// what to do, who owns it, and whether / how it can be disputed. Sources:
// what the data shows (e.g. every ASN defect is "NO ASN RECEIVED"; the
// supplier on every PO is 127224 NATIONAL FOOD TRADING CORP.) and supplier
// guides (SPS Commerce / SupplyPike: disputes in HighRadius, 997 as ASN
// evidence, Fixit tickets carry DC photos). Walmart's own manuals are behind
// Retail Link sign-in, so treat dispute guidance as a starting point.
//
// ⚠️ Nov 9 2026: Caroline asked for the suggested actions to be removed from
// the page. `action` is kept here but NOT displayed; owner and dispute are.
// An issue with no rule shows "No rule yet" rather than a guess. To add or
// correct one, edit SQEP_RULES — the page reads nothing else.
// ─────────────────────────────────────────────────────────────────────────

export const OWNERS = {
  cortina: 'Cortina / National Food Trading',
  dot: 'DOT',
  dotCortina: 'DOT + Cortina',
  packaging: 'Packaging / co-packer',
  supply: 'Dirty Cookie supply',
  carrier: 'DOT / carrier',
  unknown: 'Unassigned',
};

const has = (s, re) => re.test(s || '');

// First match wins. `match` sees { category, type, subType }.
const SQEP_RULES = [
  {
    key: 'asn-none',
    match: (d) => has(d.category, /ASN/i) && has(d.type, /NO ASN/i),
    issue: 'No ASN received',
    owner: 'cortina',
    action: 'Send the ASN (EDI 856) for every DOT load at ship time. Walmart received none for this PO. The vendor of record on these POs is 127224 National Food Trading, so the ASN has to come from them (or DOT on their behalf).',
    dispute: 'Only with an EDI 997 showing Walmart accepted an ASN for this shipment before it arrived.',
  },
  {
    key: 'asn-late',
    match: (d) => has(d.category, /ASN/i) && has(d.type, /LATE/i),
    issue: 'Late ASN — sent after the truck arrived',
    owner: 'cortina',
    action: 'Send the ASN (EDI 856) when the load leaves DOT, not after delivery. (Mar–Sep 2026 Walmart logged 77 late ASNs; from autumn the defect became "no ASN received".)',
    dispute: 'With the EDI 997 showing Walmart accepted the ASN before the truck arrived.',
  },
  {
    key: 'asn-other',
    match: (d) => has(d.category, /ASN/i),
    issue: 'ASN error',
    owner: 'cortina',
    action: 'Check the ASN against what shipped (PO, quantities, timing) with whoever sends it.',
    dispute: 'With the ASN as sent and its 997 acknowledgment.',
  },
  {
    key: 'po-overage',
    match: (d) => has(d.category, /ACCURACY/i) && has(d.type, /OVER/i),
    issue: 'PO overage — shipped more than ordered',
    owner: 'dotCortina',
    action: 'Compare DOT’s shipped cases with the PO quantity and find why more went out than Walmart ordered (pick error, re-placed order, wrong PO quantity sent to DOT).',
    dispute: 'Yes, if DOT’s shipment record shows exactly the PO quantity.',
  },
  {
    key: 'po-other',
    match: (d) => has(d.category, /ACCURACY/i),
    issue: 'PO line accuracy',
    owner: 'dotCortina',
    action: 'Compare what DOT shipped, line by line, with the PO.',
    dispute: 'Yes, if DOT’s shipment record matches the PO.',
  },
  {
    key: 'case-gtin',
    match: (d) => has(d.category, /CASE/i) && has(d.subType, /GTIN/i),
    issue: 'Case GTIN does not match item setup',
    owner: 'packaging',
    action: 'Make the case (VNPK) GTIN printed on the label match the item setup in Walmart’s Item 360 — fix whichever one is wrong.',
    dispute: 'Only if the label and Item 360 already match (photo + Item 360 screenshot).',
  },
  {
    key: 'case-barcode',
    match: (d) => has(d.category, /CASE/i),
    issue: 'Case barcode / label',
    owner: 'packaging',
    action: 'Fix the case label so it carries a scannable barcode in the required format on two sides. The Fixit ticket has the DC’s photos.',
    dispute: 'Only with photos showing a compliant case label (see the Fixit ticket).',
  },
  {
    key: 'pallet-securement',
    match: (d) => has(d.category, /PALLET/i) && has(d.type + ' ' + d.subType, /SECURE/i),
    issue: 'Pallet securement (wrap / strapping)',
    owner: 'dot',
    action: 'Check stretch-wrap and strapping on DOT’s outbound pallets; the Fixit ticket has the DC’s photos.',
    dispute: 'Yes, if the photos show the load secured.',
  },
  {
    key: 'pallet',
    match: (d) => has(d.category, /PALLET/i),
    issue: 'Pallet quality (poor quality pallet)',
    owner: 'dot',
    action: 'Review the Fixit ticket photos with DOT and fix how the pallet is built or which pallets are used.',
    dispute: 'Yes, if the photos do not show the problem or show another supplier’s pallet.',
  },
  {
    key: 'packaging',
    match: (d) => has(d.category, /PACKAG/i),
    issue: 'Packaging (e.g. easily crushed)',
    owner: 'packaging',
    action: 'Review case strength and packaging spec with the co-packer.',
    dispute: 'Rarely — only with evidence the damage happened after delivery.',
  },
  {
    key: 'load',
    match: (d) => has(d.category, /LOAD/i),
    issue: 'Load compliance',
    owner: 'carrier',
    action: 'Review how the trailer was loaded with DOT and the carrier.',
    dispute: 'Yes, with the carrier’s load photos or BOL.',
  },
];

const NO_RULE = { key: 'none', issue: null, owner: 'unknown', action: 'No rule yet — review the defect in Supplier One / Fixit and tell Claude what the fix was.', dispute: '—' };

export function sqepRule(d) {
  const r = SQEP_RULES.find((x) => x.match(d)) ?? NO_RULE;
  return { ...r, issue: r.issue ?? [d.category, d.type].filter(Boolean).join(' · '), ownerLabel: OWNERS[r.owner] };
}

// Where the money stands for one defect, from Walmart's own flags.
export function sqepTiming(d) {
  if (d.chargeable === false) return { label: 'Scored, not charged', note: 'No money at stake, but it counts against the SQEP score.' };
  if (d.status === 'projected') return { label: 'Projected', note: 'Not invoiced yet — dispute before Walmart’s monthly SQEP invoice.' };
  return { label: 'Invoiced', note: 'Billed — dispute in HighRadius.' };
}

// ── OTIF: why a PO missed, from the OTIF export joined to DOT ────────────
// `dot` = { ordered, received, shipDate } summed over the PO's DOT lines, or
// null if DOT has no record of the PO. One PO can miss for several reasons.
export function otifCauses(o, dot) {
  const out = [];
  if (o.unfilled > 0) {
    if (!dot) out.push({ key: 'cut-predot', cause: 'Cut before it reached DOT', cases: o.unfilled, owner: 'cortina',
      action: 'Ask Cortina why the PO was reduced or never sent to DOT.' });
    else if (dot.received === 0) out.push({ key: 'cut-dot-all', cause: 'Cut at DOT — nothing shipped', cases: o.unfilled, owner: 'supply',
      action: 'Check DOT stock for the SKU that week; DOT’s order details carry the cut reason (from Nov 5 2026).' });
    else if (dot.received < o.ordered) out.push({ key: 'cut-dot-short', cause: 'Cut at DOT — short shipped', cases: o.unfilled, owner: 'supply',
      action: 'Check DOT stock for the SKU that week and DOT’s cut reason.' });
    else out.push({ key: 'cut-dispute', cause: 'DOT shipped in full; Walmart booked a cut', cases: o.unfilled, owner: 'dot',
      action: 'Ask DOT for proof of delivery and dispute the cut with Walmart.' });
  }
  if (o.late > 0) {
    if (dot?.shipDate && o.mabd && dot.shipDate > o.mabd) out.push({ key: 'late-dot', cause: 'Left DOT after the must-arrive-by date', cases: o.late, owner: 'dot',
      action: 'Ask DOT why the load shipped after the MABD (stock, appointment, or order received late).' });
    else out.push({ key: 'late-transit', cause: 'Left DOT in time, arrived late', cases: o.late, owner: 'carrier',
      action: 'Check the delivery appointment and carrier transit time with DOT.' });
  }
  if (o.early > 0) out.push({ key: 'early', cause: 'Arrived before the delivery window', cases: o.early, owner: 'carrier',
    action: 'Book delivery appointments inside the PO’s window.' });
  return out.map((c) => ({ ...c, ownerLabel: OWNERS[c.owner] }));
}
