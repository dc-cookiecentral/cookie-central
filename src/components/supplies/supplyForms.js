import { saveAssumedCost, savePo } from '../../hooks/useSupplies';

// Supplies-tab forms for the shared components/shared/EditModal. Each builder
// takes the page's `modal` state and returns { config, row, onSave }.
//   kind 'assumed' — an item's assumed cost ($/lb ingredient, $/1,000 packaging)
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
      po_date: po?.po_date ?? quote.doc_date ?? null,
      fulfillment: p.fulfillment,
      packing_slip_ref: trimOrNull(p.packing_slip_ref),
      ship_date: p.ship_date,
      freight_cost: p.fulfillment ? p.freight_cost : null,
      notes: trimOrNull(p.notes),
    }, quote.id),
  };
}

const BUILDERS = { assumed: assumedForm, po: poForm };

export const supplyForm = (modal) => BUILDERS[modal.kind](modal);
