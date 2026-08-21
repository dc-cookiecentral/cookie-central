// The vision side of the Vision/Traction Organizer.
//
// Verbatim from "Dirty_Cookie_EOS_Foundation.pages" (session dated June 18,
// 2026). This is the one part of the EOS tracker that is NOT in the database:
// it is prose, it changes at most once a year, and a CRUD surface for six core
// values would cost more than it saves. Editing it is a code change — which is
// the right amount of friction for a company's core values.
//
// The traction side (Accountability Chart, Rocks, Scorecard, Issues) is live
// data — see supabase/migrations/20260817120000_eos_foundation.sql.

export const VTO = {
  sourceNote:
    'Working record of Dirty Cookie’s EOS foundation session, June 18 2026. Based on the EOS framework (Traction, Gino Wickman).',

  coreValues: [
    'Radical Truth, Radical Love',
    'Clients Are Sacred',
    'Embrace the Journey',
    'Service Is a Sacred Contribution',
    'Manifest With Intention',
    'Heal and Elevate',
  ],

  coreFocus: {
    purpose:
      'IMPACT — we don’t just sell cookies, we create moments people remember. This company creates joy.',
    niche:
      'Experiential desserts that turn everyday moments into memorable moments.',
  },

  tenYear: null, // not set in the foundation session

  fiveYear: {
    horizon: 'June 2031',
    headline: '$200M revenue with Dirty Cookie becoming a global brand.',
  },

  marketing: {
    targetMarket:
      'She’s the friend who remembers, the mom with the cute treat, the boss who sends something fun.',
    uniques: [
      'The cookie shot',
      'Dessert as an experience, not just a snack',
      'Close enough to listen, nimble enough to deliver',
    ],
    provenProcess: 'Dirty Cookie Delight Process',
    guarantee:
      'Every order is a bakery-fresh, wow experience — if it’s not, we’ll make it right.',
  },

  threeYear: {
    horizon: 'June 2029',
    revenue: '$100M revenue',
    profit: '$20M profit',
    looksLike: [
      '15 major retail accounts',
      '3 categories',
      'Cookie Shots take the lead',
      'DC headquarters — 70 people',
    ],
  },

  oneYear: {
    horizon: 'June 2027',
    revenue: '$20M revenue',
    profit: '$2M profit',
    goals: [
      'Reach $20M revenue',
      'Secure 5 major retailers',
      'Develop & launch branded items',
      'Implement EOS companywide',
      'Hire Sales and Ops',
      'Complete Cookie Central',
      'Reduce Walmart dependence below 50%',
    ],
  },
};

// The Level 10 agenda, with the canonical EOS time-box for each segment. Used
// to drive the meeting timer on the Scorecard tab.
export const L10_AGENDA = [
  { key: 'segue',     label: 'Segue',                minutes: 5,  hint: 'Good news — personal and business.' },
  { key: 'scorecard', label: 'Scorecard',            minutes: 5,  hint: 'Read the numbers. Off-track goes to Issues — no discussion here.' },
  { key: 'rocks',     label: 'Rock Review',          minutes: 5,  hint: 'On-track / off-track only. Off-track goes to Issues.' },
  { key: 'headlines', label: 'Customer / Employee Headlines', minutes: 5, hint: 'Bullet points. Anything needing discussion goes to Issues.' },
  { key: 'todos',     label: 'To-Do List',           minutes: 5,  hint: 'Last week’s seven-day commitments. Done or not done.' },
  { key: 'ids',       label: 'IDS',                  minutes: 60, hint: 'Identify, Discuss, Solve. Top three issues, in order.' },
  { key: 'conclude',  label: 'Conclude',             minutes: 5,  hint: 'Recap to-dos, cascading messages, rate the meeting 1–10.' },
];

export const L10_TOTAL_MINUTES = L10_AGENDA.reduce((s, a) => s + a.minutes, 0); // 90
