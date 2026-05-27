// Seed Weekly Report data — real Retail Link readouts from Bentonville Merchants
// (Walmart only; Kroger reporting source still TBD). This stands in until the
// email parser (BUILD_PLAN 8.2) ingests blayn@bentonvillemerchants.com automatically.
// Newest week first — the page defaults to WEEKLY_REPORTS[0].

export const WEEKLY_REPORTS = [
  {
    // Real data — parsed from the WK16 .eml by parsers/weeklyEmail.js (verified output).
    // Findings/To-Dos are empty: the email body carries the scorecard, not the L10
    // analysis layer (that's added by people / the Phase-2 AI agent).
    wk: 'WK16',
    dt: 'May 26, 2026',
    src: 'blayn@bentonvillemerchants.com',
    subj: 'Dirty Cookie | Weekly Reporting | WK16',
    parsed: true,
    hl: 'LW Sales $42,834 · POS Qty 8,789 · Instock 99.55% · Maintained Margin 33.86% · OTIF L4W 92.65%',
    attachments: [
      'Dirty Cookie WK16.xlsx',
      'Dirty Cookie Supply Plan- WK16.xlsx',
      'OTIF STORE Performance PO DETAILS WK 12 to 15 Total Company 05-26-2026 11_39_22 AM.xlsx',
    ],
    // Parsed from the 3 attachments by parsers/weeklyAttachments.js (verified output).
    detail: {
      perSku: [
        { desc: 'DC WHITE CHOC CKE', instock: 0.9949, posQtyLW: 6004, usw: 2.17, unitCost: 3.08, unitRetail: 4.88, whOnHand: 534 },
        { desc: 'DC PB COOKIE', instock: 0.996, posQtyLW: 2785, usw: 1.01, unitCost: 3.08, unitRetail: 4.88, whOnHand: 149 },
      ],
      markdown: {
        lwTotal: 1694.9,
        ytdTotal: 18729.84,
        items: [
          { desc: 'DC WHITE CHOC CKE', lw: 901.84, ytd: 10124.03 },
          { desc: 'DC PB COOKIE', lw: 793.06, ytd: 8605.81 },
        ],
      },
      supplyPlan: {
        months: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
        items: [
          { desc: 'DC WHITE CHOC CKE', byMonth: [1764, 30492, 25452, 29484, 30240, 33768, 2016], total: 153216 },
          { desc: 'DC PB COOKIE', byMonth: [1008, 3276, 3528, 9072, 12096, 13608, 756], total: 43344 },
        ],
        grandTotal: { byMonth: [2772, 33768, 28980, 38556, 42336, 47376, 2772], total: 196560 },
      },
      otif: {
        label: 'L4W',
        ordered: 2856,
        onTime: 2646,
        late: 210,
        pct: 92.65,
        latePos: [
          { hostPo: '0995480051', week: '202613', mabd: '2026-04-27', late: 84 },
          { hostPo: '0994233721', week: '202612', mabd: '2026-04-21', late: 63 },
          { hostPo: '0994235808', week: '202612', mabd: '2026-04-22', late: 42 },
          { hostPo: '0994503782', week: '202612', mabd: '2026-04-23', late: 21 },
        ],
      },
      // Vendor scorecard (sheet "Scorecard"). Parser handles all 8 periods × TY/LY/Diff;
      // seeded with the 4 active periods (TY) — LY/Diff are 0 in year 1, Q3/Q4 future.
      scorecard: {
        vendor: '127224',
        periods: ['Last Week', 'Current Month', 'Last Month', 'Year'],
        sections: [
          {
            title: 'Store Sales',
            metrics: [
              { label: 'POS Sales in dollars', values: [42833.63, 141155.96, 200066.88, 366521.09] },
              { label: 'Comp Sales in dollars', values: [42696.99, 140726.52, 199456.88, 365364.53] },
              { label: 'POS Sales in Units', values: [8789, 28969, 41020, 75169] },
              { label: 'AUR (Avg Unit Retail)', values: [4.87, 4.87, 4.88, 4.88] },
              { label: 'Store Returns in dollars', values: [0, 0, 0, 0] },
              { label: 'Store Returns as % of POS Sales', values: [0, 0, 0, 0] },
            ],
          },
          {
            title: 'Store Inventory',
            metrics: [
              { label: 'Retail Dollar Inventory', values: [263251.68, 213153.45, 317820.11, 148929.55] },
              { label: 'Cost Dollar Inventory', values: [163195.96, 132174.13, 194545.2, 90121.75] },
              { label: 'Cost On Order', values: [0, 0, 0, 0] },
              { label: 'Repl Instock %', values: [0.996, 0.9941, 0.9784, 0.9809] },
              { label: 'Unit Turns', values: [8.49, 8.64, 8.21, 7.55] },
              { label: 'Retail turns', values: [8.46, 8.61, 8.18, 7.53] },
              { label: 'Store Weeks of Supply/ Weeks on Hand', values: [5.59, 5.74, 13, 8.68] },
              { label: 'Ships at Retail', values: [37120.32, 110096.8, 190088.24, 653789.76] },
              { label: 'Ships at cost', values: [23616.33, 70027, 120887.74, 415766.06] },
            ],
          },
          {
            title: 'DC Inventory',
            metrics: [
              { label: 'Ships At Cost WHSE', values: [24868.03, 71254.37, 118550.89, 412670.87] },
              { label: 'Warehouse Weeks of Supply/Weeks on Hand', values: [15.18, 12.8, 4.22, 6.78] },
              { label: 'Cost On Hand', values: [290510.88, 245373.48, 277786.08, 153791.49] },
              { label: 'Cost On Order', values: [0, 55.44, 73430.28, 70204.43] },
              { label: 'Warehouse Turns', values: [4.52, 3.83, 5.63, 8.33] },
            ],
          },
          {
            title: 'Margins and Markdowns',
            metrics: [
              { label: 'Gross Initial Margin %', values: [0.3638, 0.364, 0.364, 0.3641] },
              { label: 'Maintain Margin %', values: [0.3386, 0.3402, 0.334, 0.3316] },
              { label: 'Net Maintain Margin %', values: [0.3386, 0.3402, 0.334, 0.3316] },
              { label: 'Net Maintained Margin $', values: [14504.12, 48022.53, 66821.75, 121527.56] },
              { label: 'GMROII', values: [4.62, 4.72, 4.47, 4.12] },
              { label: 'MUMD Dollars', values: [1694.9, 5268.89, 9452.56, 18729.84] },
              { label: 'MUMD Percent To Sales', values: [0.0396, 0.0373, 0.0472, 0.0511] },
            ],
          },
        ],
      },
    },
    kpis: [
      { l: 'POS', v: '$42,834', d: '', c: '#5C526A' },
      { l: 'POS Qty', v: '8,789', d: 'down 0.1%', c: '#DC2626' },
      { l: 'Instock', v: '99.55%', d: '', c: '#059669' },
      { l: 'Maint. Margin', v: '33.86%', d: '', c: '#059669' },
      { l: 'YTD Sales', v: '$366,521', d: '', c: '#5C526A' },
      { l: 'WCCB U/S/W', v: '2.17', d: '$/S/W 10.60', c: '#5C526A' },
      { l: 'PB U/S/W', v: '1.01', d: '$/S/W 4.88', c: '#5C526A' },
      { l: 'OTIF L4W', v: '92.65%', d: 'In Full 100.00%', c: '#059669' },
    ],
    findings: [],
    todos: [],
  },
  {
    wk: 'WK15',
    dt: 'May 18, 2026',
    src: 'blayn@bentonvillemerchants.com',
    subj: 'Dirty Cookie | Weekly Reporting | WK15',
    hl: 'Velocity decline 4th straight week. OTIF L4W recovered to 94.85%. SQEP clean. Instock 99.55%.',
    // c = delta color (red = worse, green = better, amber = watch)
    kpis: [
      { l: 'POS', v: '$42,878', d: 'down 10.2%', c: '#DC2626' },
      { l: 'POS Qty', v: '8,798', d: 'down 10.4%', c: '#DC2626' },
      { l: 'WCCB U/S/W', v: '2.16', d: 'was 2.43', c: '#DC2626' },
      { l: 'PBG U/S/W', v: '1.01', d: 'was 1.17', c: '#DC2626' },
      { l: 'Instock', v: '99.55%', d: '', c: '#059669' },
      { l: 'OTIF L4W', v: '94.85%', d: 'In Full 100%', c: '#059669' },
      { l: 'Store WOS', v: '5.6', d: 'was 7.5', c: '#059669' },
      { l: 'WH WOS', v: '12.3', d: '', c: '#D97706' },
    ],
    findings: [
      { n: '01', t: '4th straight weekly decline', d: 'WK12: 10,931 to WK15: 8,798. Down 19.5% in 4 weeks.', act: 'Regional velocity analysis', own: 'Sales / Blayn', due: 'Fri 5/23' },
      { n: '02', t: 'SQEP perfect - 100% all categories', d: 'Zero defects, $0 charges. Turnaround from WK13 (17 late ASN).', act: 'Maintain discipline', own: 'Logistics', due: 'Ongoing' },
      { n: '03', t: 'OTIF L4W 94.85% On Time, 100% In Full', d: '4,074 cases ordered, 3,864 on time, 210 late, 0 unfilled.', act: 'Review 210 late cases', own: '3PL', due: 'Fri 5/23' },
      { n: '04', t: 'Markdowns climbing - $1,785 LW, $16,976 YTD', d: 'WCCB $1,117 / PBG $668 last week. Margin pressure.', act: 'Markdown driver review', own: 'Sales / Demand', due: 'Mon 5/26' },
      { n: '05', t: 'WH heavy WCCB, PBG supply risk', d: '458 packs WCCB vs 128 PBG. PBG only 756 planned June.', act: 'Flag PBG supply risk', own: 'Demand Planning', due: 'Wed 5/21' },
    ],
    todos: [
      { dt: 'Wed 5/21', t: 'PBG supply review' },
      { dt: 'Fri 5/23', t: 'Regional velocity analysis' },
      { dt: 'Mon 5/26', t: 'Markdown driver review' },
    ],
  },
  {
    wk: 'WK13',
    dt: 'May 5, 2026',
    src: 'blayn@bentonvillemerchants.com',
    subj: 'Dirty Cookie | Weekly Reporting | WK13',
    hl: 'First WoW velocity decline. ASN compliance slipping.',
    kpis: [
      { l: 'POS', v: '$48.9K', d: 'down 8.2%', c: '#DC2626' },
      { l: 'OTIF 4wk', v: '49.4%', d: 'Target 95%', c: '#DC2626' },
      { l: 'Late ASN', v: '17', d: '7 on Apr 29', c: '#D97706' },
    ],
    findings: [
      { n: '01', t: 'Velocity declined both SKUs', d: 'WC -8.3%, PB -8.7%.', act: 'Velocity decomp', own: 'Sales', due: 'Fri 5/9' },
    ],
    todos: [{ dt: 'Wed 5/7', t: 'ASN root-cause' }],
  },
];

// EOS Issues List source. Static for now; replaced by the Alerts engine
// (BUILD_PLAN 7.2) once it runs against live data. s: 'crit' | 'warn'.
export const ALERTS = [
  { m: 'PO14371 (Kroger) ships in 1 day (May 21). 504cs WCCB.', s: 'crit' },
  { m: "REESE'S PB Chips - 35d lead, expiring Jul 2026.", s: 'crit' },
  { m: 'PBG at DOT: no incoming replenishment.', s: 'warn' },
  { m: 'PO14201 - awaiting WM payment day 40.', s: 'warn' },
  { m: 'Brown Sugar + Eggs have expired lots.', s: 'crit' },
];
