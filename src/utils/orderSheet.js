// The order sheet: one shipment rendered for a human to send on.
//
// Cortina fulfils some samples from their own warehouse. Those orders are
// withheld from the ShipStation export, so ShipStation's own notification never
// fires and the rep would otherwise hear nothing. Until an automated sender
// exists (which needs a provider key and SPF/DKIM on dirtycookie.com), the
// Cortina team sends the confirmation by hand — so the site's job is to make
// that one click rather than a retyping exercise.
//
// Two outputs from one source, so the paste and the PDF can never drift:
//   htmlSheet() → clipboard as text/html, and the print window
//   textSheet() → clipboard as text/plain, and the fallback when the rich
//                 clipboard API is unavailable
//
// No PDF library. `window.print()` into "Save as PDF" is universally available
// and adds nothing to the bundle; a generator would add hundreds of kilobytes
// to produce a worse-looking page.

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const itemName = (i) =>
  (i.custom ? (i.custom_spec || i.description || 'Custom request') : (i.description || i.product_code || '')) || '';

const addressLines = (a = {}) => [
  [a.contact_name, a.company].filter(Boolean).join(' · '),
  a.street,
  [a.city, a.state, a.zip].filter(Boolean).join(', '),
].filter(Boolean);

/** Rich version — pasted into Gmail, and printed. Inline styles only: email
 *  clients strip <style> blocks, and a print window has no stylesheet of ours. */
export function htmlSheet(s) {
  const items = s.sample_shipment_items || [];
  const cookies = items.reduce((n, i) => n + (i.qty || 0), 0);
  const flags = [
    s.rush ? '<span style="background:#DC2626;color:#fff;font-size:12px;font-weight:700;padding:2px 8px;border-radius:10px">RUSH</span>' : '',
    s.temp === 'Cold' ? '<span style="background:#E0F2FE;color:#075985;font-size:12px;font-weight:700;padding:2px 8px;border-radius:10px">COLD CHAIN</span>' : '',
  ].filter(Boolean).join(' ');

  const row = (label, value) =>
    `<tr><td style="padding:3px 14px 3px 0;color:#9990A8;font-size:13px;white-space:nowrap;vertical-align:top">${esc(label)}</td>` +
    `<td style="padding:3px 0;color:#2D2235;font-size:14px">${value}</td></tr>`;

  const lines = items.map((i) => {
    const proj = i.project_no ? ` <span style="color:#9990A8">(${esc(i.project_no)})</span>` : '';
    const tag = i.custom ? ' <span style="color:#C2185B;font-weight:600">· custom</span>' : '';
    return `<tr><td style="padding:5px 14px 5px 0;font-weight:700;font-size:14px;white-space:nowrap">${i.qty || 1}×</td>` +
           `<td style="padding:5px 0;font-size:14px">${esc(itemName(i))}${tag}${proj}</td></tr>`;
  }).join('');

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:560px;color:#2D2235">
  <div style="font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#C2185B">Dirty Cookie</div>
  <h1 style="font-size:20px;margin:4px 0 2px">Sample order ${esc(s.shipment_no)}</h1>
  <p style="font-size:14px;color:#5C526A;margin:0 0 16px">Shipping from the Cortina warehouse — this order is not in ShipStation, so there is no tracking link.</p>
  ${flags ? `<p style="margin:0 0 14px">${flags}</p>` : ''}
  <table style="border-collapse:collapse;margin-bottom:16px">
    ${row('Account', esc(s.account || '—'))}
    ${row('Salesperson', esc(s.sales_rep?.full_name || '—'))}
    ${row('Deliver by', esc(s.required_by || 'no date set'))}
    ${row('Ship to', addressLines(s.address).map(esc).join('<br>') || '—')}
  </table>
  <div style="font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#9990A8;border-bottom:1px solid #E8E0F0;padding-bottom:4px">${cookies} cookie${cookies === 1 ? '' : 's'}</div>
  <table style="border-collapse:collapse;width:100%;margin:8px 0 16px">${lines}</table>
  ${(s.collateral || []).length ? `<p style="font-size:14px;margin:0 0 16px"><strong>Collateral:</strong> ${esc((s.collateral || []).join(', '))}</p>` : ''}
  ${s.notes ? `<div style="background:#FDF2F8;border:1px solid #E8E0F0;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:16px"><strong>Notes:</strong> ${esc(s.notes)}</div>` : ''}
  <p style="font-size:12px;color:#9990A8;border-top:1px solid #E8E0F0;padding-top:10px;margin:0">To change or cancel this order, contact the Dirty Cookie team — it cannot be changed from the sample site once submitted.</p>
</div>`;
}

/** Plain version — the text/plain clipboard flavour, and the fallback. */
export function textSheet(s) {
  const items = s.sample_shipment_items || [];
  const out = [
    `Sample order ${s.shipment_no}`,
    'Shipping from the Cortina warehouse — not in ShipStation, no tracking link.',
    '',
    `Account:     ${s.account || '—'}`,
    `Salesperson: ${s.sales_rep?.full_name || '—'}`,
    `Deliver by:  ${s.required_by || 'no date set'}`,
  ];
  if (s.rush) out.push('RUSH');
  if (s.temp === 'Cold') out.push('COLD CHAIN');
  out.push('', 'Ship to:', ...addressLines(s.address).map((l) => `  ${l}`), '', 'Items:');
  out.push(...items.map((i) => `  ${i.qty || 1}x ${itemName(i)}${i.custom ? ' (custom)' : ''}${i.project_no ? ` [${i.project_no}]` : ''}`));
  if ((s.collateral || []).length) out.push('', `Collateral: ${(s.collateral || []).join(', ')}`);
  if (s.notes) out.push('', `Notes: ${s.notes}`);
  out.push('', 'To change or cancel this order, contact the Dirty Cookie team.');
  return out.join('\n');
}

/**
 * Copy as rich text where possible, plain text everywhere else.
 *
 * `ClipboardItem` carries both flavours at once, so Gmail takes the HTML and a
 * plain textarea takes the text — one button, no "which format?" question. It
 * needs a secure context and a real user gesture; Firefox has historically not
 * supported it, hence the fallback rather than a feature-detect that leaves
 * older browsers with a dead button.
 */
export async function copyOrderSheet(s) {
  const html = htmlSheet(s);
  const text = textSheet(s);
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      return { ok: true, rich: true };
    }
    await navigator.clipboard.writeText(text);
    return { ok: true, rich: false };
  } catch (e) {
    // Clipboard writes fail for reasons the user can act on (permission denied,
    // insecure context) — report rather than swallow.
    return { ok: false, error: e?.message || 'Clipboard blocked by the browser.' };
  }
}

/**
 * Open a print-ready window. The browser's own "Save as PDF" destination does
 * the PDF part, which is why there is no library here.
 *
 * @page margin is set so the print does not carry the browser's default header
 * and footer sizing; the URL/timestamp chrome itself is a browser setting we
 * cannot control from script.
 */
export function printOrderSheet(s) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return { ok: false, error: 'Pop-up blocked — allow pop-ups for this site to print.' };
  w.document.write(`<!doctype html><html><head><title>${esc(s.shipment_no)}</title>
<meta charset="utf-8">
<style>@page{margin:16mm}body{margin:0;padding:8px}@media print{.noprint{display:none}}</style>
</head><body>${htmlSheet(s)}
<p class="noprint" style="font-family:sans-serif;font-size:13px;color:#9990A8;margin-top:24px">
  Printing… choose <strong>Save as PDF</strong> as the destination. You can close this tab afterwards.
</p>
</body></html>`);
  w.document.close();
  // focus() first: a background window prints to a dialog the user never sees.
  w.focus();
  // The image-free sheet is ready as soon as the document closes, but Safari
  // needs a tick before print() finds the content.
  setTimeout(() => w.print(), 150);
  return { ok: true };
}
