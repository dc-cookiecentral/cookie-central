import { toNumber, pick } from '../utils/csvParser';

// ─────────────────────────────────────────────────────────────────────────
// DOT portal parser — FORMAT UNCONFIRMED (BUILD_PLAN 2.4, blocked on sample).
// Build plan: "Pallet-level → SKU aggregate." DOT exports one row per pallet;
// we sum case quantities per SKU into on-hand / incoming / in-transit / alloc.
//
// COLUMN-MAPPING SEAM: when Marc's real export lands, adjust the alias arrays
// below to match its headers. Nothing else should need to change.
// ─────────────────────────────────────────────────────────────────────────
const COLUMNS = {
  sku:      ['SKU', 'Item', 'Item Number', 'Product', 'Material'],
  name:     ['Description', 'Item Description', 'Product Name'],
  cases:    ['Cases', 'Qty', 'Quantity', 'Case Qty', 'Pallet Cases'],
  status:   ['Status', 'Type', 'Inventory Status', 'Bucket'],
  velocity: ['Velocity', 'Weekly Velocity', 'Avg Weekly'],
};

// Map a free-text status to one of our four buckets. Default → on_hand.
function bucketFor(statusRaw) {
  const s = (statusRaw || '').toLowerCase();
  if (s.includes('transit') || s.includes('toret')) return 'in_transit_to_retailer';
  if (s.includes('incoming') || s.includes('inbound') || s.includes('po')) return 'incoming';
  if (s.includes('alloc') || s.includes('commit') || s.includes('reserved')) return 'allocated';
  return 'on_hand';
}

function parse(rows) {
  const bySku = new Map();
  const errors = [];

  rows.forEach((row, i) => {
    const sku = pick(row, COLUMNS.sku);
    if (!sku) {
      errors.push({ row: i + 2, message: 'Missing SKU' });
      return;
    }
    const cases = toNumber(pick(row, COLUMNS.cases)) ?? 0;
    const bucket = bucketFor(pick(row, COLUMNS.status));

    if (!bySku.has(sku)) {
      bySku.set(sku, {
        sku,
        name: pick(row, COLUMNS.name) || sku,
        on_hand: 0,
        incoming: 0,
        in_transit_to_retailer: 0,
        allocated: 0,
        weekly_velocity: toNumber(pick(row, COLUMNS.velocity)),
      });
    }
    const rec = bySku.get(sku);
    rec[bucket] += cases;
    const vel = toNumber(pick(row, COLUMNS.velocity));
    if (vel != null) rec.weekly_velocity = vel;
  });

  const records = [...bySku.values()];
  return {
    records,
    errors,
    summary: `${records.length} SKUs from ${rows.length} pallet rows`,
  };
}

async function importRecords(records, { uploadId }) {
  const { supabase } = await import('../lib/supabase');
  const snapshot_date = new Date().toISOString();
  const payload = records.map((r) => ({
    upload_batch_id: uploadId,
    sku: r.sku,
    on_hand: r.on_hand,
    incoming: r.incoming,
    in_transit_to_retailer: r.in_transit_to_retailer,
    allocated: r.allocated,
    weekly_velocity: r.weekly_velocity,
    snapshot_date,
  }));
  const { error } = await supabase.from('dot_inventory').insert(payload);
  if (error) throw error;
  return { inserted: payload.length };
}

export default {
  type: 'dot',
  label: 'DOT Foods Inventory',
  accept: '.csv',
  unconfirmed: true,
  previewColumns: [
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Product' },
    { key: 'on_hand', label: 'On-Hand' },
    { key: 'incoming', label: 'Incoming' },
    { key: 'in_transit_to_retailer', label: 'To Retailer' },
    { key: 'allocated', label: 'Allocated' },
    { key: 'weekly_velocity', label: 'Velocity' },
  ],
  parse,
  importRecords,
};
