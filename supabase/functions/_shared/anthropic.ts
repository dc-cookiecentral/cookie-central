// Claude calls for the email agent — raw fetch (no SDK needed in Deno).
//   classify()  → Haiku 4.5, one of six labels (cheap, runs on every email)
//   extract()   → Sonnet 4.6, structured PO/BOL/lot fields (runs only on the
//                 PO / BOL / supplier_confirmation classes)
// Both force a tool call (tool_choice) so the model returns validated JSON, and
// cache the system+schema prompt prefix (cache_control: ephemeral).

const API = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';
const CLASSIFY_MODEL = 'claude-haiku-4-5';
const EXTRACT_MODEL = 'claude-sonnet-4-6';

export const CLASSIFICATIONS = [
  'PO',
  'BOL',
  'supplier_confirmation',
  'assemblers_report',
  'weekly_report',
  'walmart_orders',
  'other',
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

async function callClaude(apiKey: string, body: unknown): Promise<any> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  return res.json();
}

function toolInput(resp: any, toolName: string): any {
  const block = (resp.content ?? []).find(
    (b: any) => b.type === 'tool_use' && b.name === toolName,
  );
  if (!block) throw new Error(`no tool_use(${toolName}) in Claude response`);
  return block.input;
}

// ── Classify ──────────────────────────────────────────────────────────────

const CLASSIFY_SYSTEM = `You are the mail-room classifier for The Dirty Cookie's operations inbox, systems@dirtycookie.com. Every incoming email is exactly one of these categories — pick the single best fit:

- PO: a purchase order (new order, revision, or NOVA edit), typically from Cortina / NetSuite. Mentions PO numbers, MABD/ship dates, SKUs, case counts.
- BOL: a bill of lading / shipping confirmation from a carrier or freight handler. Mentions BOL number, carrier, pickup/delivery, lot numbers, pallets.
- supplier_confirmation: an order confirmation / ship notice from a raw-material supplier or distributor (ingredients, packaging). Confirms quantities, costs, expected delivery.
- assemblers_report: from Assemblers (the Chicago co-packer). Carries the production workbook as an .xlsx attachment (Production / Reject / Inventory / Shipment sheets).
- weekly_report: the Bentonville Merchants weekly Retail Link report (subject like "Dirty Cookie | Weekly Reporting | WK##", from blayn@bentonvillemerchants.com).
- walmart_orders: the Cortina Walmart Orders export (subject like "Walmart_Orders_YYYY-MM-DD", from DMorales@CortinaFoods.com), an .xlsx of all Walmart purchase orders. Note: gmail-poll usually matches this deterministically before reaching the classifier.
- other: anything else (internal chatter, newsletters, spam, receipts).

Use the sender, subject, and attachment filenames as strong signals. When an email plausibly fits two, prefer the more specific operational category over "other".`;

const CLASSIFY_TOOL = {
  name: 'classify',
  description: 'Record the single best classification for this email.',
  input_schema: {
    type: 'object',
    properties: {
      label: { type: 'string', enum: [...CLASSIFICATIONS] },
      reason: { type: 'string', description: 'One short phrase justifying the label.' },
    },
    required: ['label'],
  },
};

export async function classifyEmail(
  apiKey: string,
  email: { from: string | null; subject: string | null; snippet: string; body: string; attachments: { filename: string }[] },
): Promise<Classification> {
  const atts = email.attachments.map((a) => a.filename).join(', ') || 'none';
  const userText =
    `From: ${email.from ?? '(unknown)'}\n` +
    `Subject: ${email.subject ?? '(none)'}\n` +
    `Attachments: ${atts}\n\n` +
    (email.body || email.snippet || '').slice(0, 6000);

  const resp = await callClaude(apiKey, {
    model: CLASSIFY_MODEL,
    max_tokens: 256,
    system: [{ type: 'text', text: CLASSIFY_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: 'tool', name: 'classify' },
    messages: [{ role: 'user', content: userText }],
  });
  const out = toolInput(resp, 'classify');
  return (CLASSIFICATIONS as readonly string[]).includes(out.label)
    ? (out.label as Classification)
    : 'other';
}

// ── Extract ─────────────────────────────────────────────────────────────────

export interface ExtractedLot {
  lot_number: string;
  sku?: string | null;
  quantity_cases?: number | null;
}
export interface Extraction {
  po_number: string | null;
  customer_order_number: string | null;
  carrier: string | null;
  bol_number: string | null;
  ship_date: string | null;
  mabd: string | null;
  delivery_date: string | null;
  total_amount: number | null;
  total_cases: number | null;
  destination_dc: string | null;
  sender_name: string | null;
  sender_org: string | null;
  summary: string;
  anomalies: string[];
  lots: ExtractedLot[];
}

const EXTRACT_SYSTEM = `You extract structured purchase-order and shipment data from operational emails for The Dirty Cookie (POs from Cortina, BOLs from carriers, confirmations from suppliers).

Rules:
- Extract ONLY what is explicitly stated. Use null for anything not present — never guess or infer a value that isn't in the text.
- Dates must be ISO format YYYY-MM-DD.
- Money is a plain number (no currency symbol). Case counts are integers.
- lots: finished-good lot numbers being shipped/received, one entry each, with SKU and case quantity when stated.
- anomalies: short notes on anything an ops person should flag — a ship-date change, a cost that looks off, a missing BOL, a short shipment, a hold.
- summary: one or two sentences describing what this email communicates, in plain language.`;

const EXTRACT_TOOL = {
  name: 'record_extraction',
  description:
    'Record the structured fields extracted from this email. Null for anything not explicitly present.',
  input_schema: {
    type: 'object',
    properties: {
      po_number: { type: ['string', 'null'] },
      customer_order_number: { type: ['string', 'null'] },
      carrier: { type: ['string', 'null'] },
      bol_number: { type: ['string', 'null'] },
      ship_date: { type: ['string', 'null'], description: 'ISO YYYY-MM-DD' },
      mabd: { type: ['string', 'null'], description: 'Must-Arrive-By date, ISO YYYY-MM-DD' },
      delivery_date: { type: ['string', 'null'], description: 'ISO YYYY-MM-DD' },
      total_amount: { type: ['number', 'null'] },
      total_cases: { type: ['number', 'null'] },
      destination_dc: { type: ['string', 'null'] },
      sender_name: { type: ['string', 'null'] },
      sender_org: { type: ['string', 'null'] },
      summary: { type: 'string' },
      anomalies: { type: 'array', items: { type: 'string' } },
      lots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lot_number: { type: 'string' },
            sku: { type: ['string', 'null'] },
            quantity_cases: { type: ['number', 'null'] },
          },
          required: ['lot_number'],
        },
      },
    },
    required: ['summary'],
  },
};

export async function extractEmail(
  apiKey: string,
  email: { from: string | null; subject: string | null; body: string },
): Promise<Extraction> {
  const userText =
    `From: ${email.from ?? '(unknown)'}\n` +
    `Subject: ${email.subject ?? '(none)'}\n\n` +
    (email.body || '').slice(0, 16000);

  const resp = await callClaude(apiKey, {
    model: EXTRACT_MODEL,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: EXTRACT_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'record_extraction' },
    messages: [{ role: 'user', content: userText }],
  });
  const out = toolInput(resp, 'record_extraction');
  return {
    po_number: out.po_number ?? null,
    customer_order_number: out.customer_order_number ?? null,
    carrier: out.carrier ?? null,
    bol_number: out.bol_number ?? null,
    ship_date: out.ship_date ?? null,
    mabd: out.mabd ?? null,
    delivery_date: out.delivery_date ?? null,
    total_amount: out.total_amount ?? null,
    total_cases: out.total_cases ?? null,
    destination_dc: out.destination_dc ?? null,
    sender_name: out.sender_name ?? null,
    sender_org: out.sender_org ?? null,
    summary: out.summary ?? '',
    anomalies: Array.isArray(out.anomalies) ? out.anomalies : [],
    lots: Array.isArray(out.lots) ? out.lots : [],
  };
}
