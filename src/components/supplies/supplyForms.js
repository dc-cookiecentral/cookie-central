import { saveAssumedCost, savePo, saveVendor, saveContact, saveItem, saveSku } from '../../hooks/useSupplies';

// Supplies-tab forms for the shared components/shared/EditModal. Each builder
// takes the page's `modal` state and returns { config, row, onSave }.
//   kind 'assumed' — an item's assumed cost ($/lb ingredient, $/1,000 packaging)
//   kind 'vendor'  — add / edit a vendor (V2.2)
//   kind 'contact' — add / edit a person at a vendor; confirms Marc's contacts
//   kind 'item'    — add / edit an ingredient or packaging item
//   kind 'sku'     — add / edit a vendor's SKU of an item (order unit, weight)
//   kind 'po'      — the PO behind a PO/invoice line: picked up or delivered,
//                    packing slip, and the freight (what we pay to bring a
//                    pickup in, or what a delivered invoice bills), which
//                    v_po_line_cost splits across the PO's lines by weight.

const trimOrNull = (v) => (v == null ? null : String(v).trim() || null);

function assumedForm({ item }) {
  const unit = item.kind === 'packaging' ? '$ per 1,000' : '$ per lb';
  return {
    row: item,
    config: {
      heading: `Assumed cost — ${item.name}`,
      submitLabel: 'Save',
      fields: [{
        name: 'assumed_cost', label: `Assumed cost (${unit})`, type: 'number', step: 'any', min: '0', autoFocus: true,
        hint: 'Flags when it is 5% or more above or below the actual landed cost of the latest PO.',
        validate: (v) => (v != null && !(v >= 0) ? 'Assumed cost must be a number ≥ 0.' : null),
      }],
    },
    onSave: (p) => saveAssumedCost(item.id, p.assumed_cost),
  };
}

function poForm({ po, quote }) {
  return {
    row: po ?? null,
    config: {
      heading: po ? `PO ${po.po_number}` : 'Link this line to a PO',
      key: 'po_number',
      keyNote: false,
      submitLabel: 'Save',
      fields: [
        {
          name: 'po_number', label: 'PO number', required: true,
          hint: (_, { isEdit }) => (isEdit ? 'Locked — the PO number is the key.' : 'Use the number on the PO, e.g. SP029-2026.'),
        },
        {
          name: 'fulfillment', label: 'Picked up or delivered', type: 'select',
          options: [
            { value: '', label: '— not set' },
            { value: 'pickup', label: 'Picked up (we pay freight)' },
            { value: 'delivered', label: 'Delivered' },
          ],
        },
        { name: 'packing_slip_ref', label: 'Packing slip / packing list #' },
        { name: 'ship_date', label: 'Ship / pickup date', type: 'date' },
        {
          name: 'freight_cost', type: 'number', step: '0.01', min: '0',
          label: (f) => (f.fulfillment === 'delivered' ? 'Freight billed on the invoice ($, whole PO)' : 'Freight we pay in transit ($, whole PO)'),
          hint: (f) => (f.fulfillment
            ? 'Split across this PO’s products by weight. Enter 0 if there is none — blank keeps the yellow “freight pending” flag.'
            : 'Set picked up / delivered first.'),
          disabled: (f) => !f.fulfillment,
          clearWhenDisabled: true,
          validate: (v, f) => (f.fulfillment && v != null && !(v >= 0) ? 'Freight must be a number ≥ 0.' : null),
        },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
    onSave: (p) => savePo({
      po_number: p.po_number.trim(),
      vendor_id: po?.vendor_id ?? quote.vendor_id,
      po_date: po?.po_date ?? quote?.doc_date ?? null,
      fulfillment: p.fulfillment,
      packing_slip_ref: trimOrNull(p.packing_slip_ref),
      ship_date: p.ship_date,
      freight_cost: p.fulfillment ? p.freight_cost : null,
      notes: trimOrNull(p.notes),
    }, quote?.id),
  };
}

// Names are the natural key the supplier data file (and its seed) matches on,
// so they lock once saved — same as the Spec Sheet's keys.
const NAME_LOCK = 'Locked once saved — the supplier data file matches on it.';
const friendly = (label) => (res) => (res.error?.code === '23505'
  ? { error: { message: `A ${label} with that name already exists.` } } : res);
const vendorOptions = (data, blank = '— none') => [
  { value: '', label: blank },
  ...[...data.vendors].sort((a, b) => a.name.localeCompare(b.name)).map((v) => ({ value: v.id, label: v.status === 'closed' ? `${v.name} (closed)` : v.name })),
];

function vendorForm({ vendor }) {
  return {
    row: vendor ?? null,
    config: {
      title: 'vendor', key: 'name', keyNote: false,
      fields: [
        { name: 'name', label: 'Vendor name', required: true, wide: true, autoFocus: !vendor, hint: (_, { isEdit }) => (isEdit ? NAME_LOCK : null) },
        { name: 'category', label: 'Category', type: 'select', required: true, options: [
          { value: 'raw', label: 'Ingredients — raw materials' }, { value: 'packaging', label: 'Packaging' },
          { value: 'equipment', label: 'Equipment' }, { value: 'services', label: 'Services & co-manufacturing' }] },
        { name: 'status', label: 'Status', type: 'select', options: [
          { value: 'active', label: 'Active' }, { value: 'prospect', label: 'Prospect' }, { value: 'closed', label: 'Closed' }] },
        { name: 'address', label: 'Address', wide: true },
        { name: 'phone_main', label: 'Main phone' },
        { name: 'website', label: 'Website' },
        { name: 'account_number', label: 'Our account #' },
        { name: 'default_terms', label: 'Default payment terms', hint: 'Prefills new POs.' },
        { name: 'fob', label: 'FOB', wide: true },
        { name: 'freight_notes', label: 'Freight notes', wide: true },
        { name: 'billing_entity', label: 'Billed as' },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
    onSave: async (p) => friendly('vendor')(await saveVendor(vendor?.id, {
      name: p.name.trim(), category: p.category, status: p.status || 'active',
      address: trimOrNull(p.address), phone_main: trimOrNull(p.phone_main), website: trimOrNull(p.website),
      account_number: trimOrNull(p.account_number), default_terms: trimOrNull(p.default_terms), fob: trimOrNull(p.fob),
      freight_notes: trimOrNull(p.freight_notes), billing_entity: trimOrNull(p.billing_entity), notes: trimOrNull(p.notes),
    })),
  };
}

function contactForm({ contact, vendor }) {
  const fromSheet = contact?.source === 'marc_sheet';
  return {
    row: contact ? { ...contact, confirmed: false } : null,
    config: {
      heading: contact ? `${contact.name} — ${vendor.name}` : `Add contact — ${vendor.name}`,
      submitLabel: contact ? 'Save' : 'Add contact',
      fields: [
        { name: 'name', label: 'Name', required: true, autoFocus: !contact },
        { name: 'role', label: 'Role' },
        { name: 'email', label: 'Email', wide: true },
        { name: 'phone_office', label: 'Office phone' },
        { name: 'phone_cell', label: 'Cell' },
        { name: 'is_primary', label: 'Primary contact for this vendor', type: 'bool', wide: true },
        ...(fromSheet ? [{ name: 'confirmed', label: 'Confirmed with the vendor (no longer just from Marc’s sheet)', type: 'bool', wide: true }] : []),
      ],
    },
    onSave: (p) => saveContact(contact?.id, {
      vendor_id: vendor.id, name: p.name.trim(), role: trimOrNull(p.role), email: trimOrNull(p.email),
      phone_office: trimOrNull(p.phone_office), phone_cell: trimOrNull(p.phone_cell), is_primary: !!p.is_primary,
      ...(fromSheet && p.confirmed ? { source: null } : {}),
    }),
  };
}

function itemForm({ item, data }) {
  return {
    row: item ?? null,
    config: {
      title: 'item', key: 'name', keyNote: false,
      fields: [
        { name: 'name', label: 'Item name', required: true, wide: true, autoFocus: !item,
          hint: (_, { isEdit }) => (isEdit ? NAME_LOCK : 'e.g. “Light Brown Sugar”, “ALDI tray”. Check the list first — near-duplicates are hard to untangle.') },
        { name: 'kind', label: 'Ingredient or packaging', type: 'select', required: true,
          options: [{ value: 'ingredient', label: 'Ingredient (priced per lb)' }, { value: 'packaging', label: 'Packaging (priced per 1,000)' }] },
        { name: 'primary_vendor_id', label: 'Primary vendor', type: 'select', options: vendorOptions(data, '— none selected') },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
    },
    onSave: async (p) => friendly('item')(await saveItem(item?.id, {
      name: p.name.trim(), kind: p.kind, primary_vendor_id: p.primary_vendor_id || null, notes: trimOrNull(p.notes),
    })),
  };
}

function skuForm({ sku, item, data }) {
  const ing = item.kind === 'ingredient';
  return {
    row: sku ? { ...sku } : { vendor_id: item.primary_vendor_id || '', units_per_thousand: !ing },
    config: {
      heading: sku ? `SKU — ${item.name}` : `Add a vendor SKU — ${item.name}`,
      submitLabel: sku ? 'Save' : 'Add SKU',
      fields: [
        { name: 'vendor_id', label: 'Vendor', type: 'select', required: true, wide: true, options: vendorOptions(data, '— pick the vendor') },
        { name: 'brand_name', label: 'Brand / product name' },
        { name: 'order_unit', label: 'Order unit', required: true, hint: ing ? 'What you order in, e.g. “50 lb bag”.' : 'e.g. “each”, “case of 1,000”, “roll (3,500)”.' },
        ...(ing
          ? [{ name: 'unit_weight_lbs', label: 'lb per order unit', type: 'number', step: 'any', min: '0', hint: 'Needed for $/lb.',
              validate: (v) => (v != null && !(v > 0) ? 'lb per order unit must be more than 0.' : null) }]
          : [{ name: 'units_per_order_unit', label: 'Pieces per order unit', type: 'number', step: 'any', min: '0', hint: 'Blank = 1. Needed for $/1,000.' },
             { name: 'units_per_thousand', label: 'Show price per 1,000', type: 'bool' }]),
        { name: 'item_code', label: 'DC ERP item code', mono: true },
        { name: 'vendor_item_code', label: 'Vendor’s item #', mono: true },
        { name: 'spec_note', label: 'Spec note', type: 'textarea' },
      ],
    },
    onSave: (p) => saveSku(sku?.id, {
      item_id: item.id, vendor_id: p.vendor_id, brand_name: trimOrNull(p.brand_name), order_unit: p.order_unit.trim(),
      unit_weight_lbs: ing ? p.unit_weight_lbs : null,
      units_per_order_unit: ing ? null : p.units_per_order_unit,
      units_per_thousand: ing ? false : !!p.units_per_thousand,
      item_code: trimOrNull(p.item_code), vendor_item_code: trimOrNull(p.vendor_item_code), spec_note: trimOrNull(p.spec_note),
    }),
  };
}

const BUILDERS = { assumed: assumedForm, po: poForm, vendor: vendorForm, contact: contactForm, item: itemForm, sku: skuForm };

export const EDIT_MODAL_KINDS = new Set(Object.keys(BUILDERS));
export const supplyForm = (modal, data) => BUILDERS[modal.kind]({ ...modal, data });
