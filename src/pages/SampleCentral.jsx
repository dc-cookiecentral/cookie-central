import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AppSwitcher from '../components/AppSwitcher';
import SearchSelect from '../components/SearchSelect';
import { useDialog } from '../hooks/useDialog';
import {
  useSampleCentral, addAddress, retireAddress, createShipment, saveTemplate, deleteTemplate,
  saveShipmentIssue,
} from '../hooks/useSampleCentral';
import {
  flavorFamily, derivedTemp, effectiveTemp, groupCatalog,
  SHIP_STATUSES, EXCEPTION_STATUSES, OPEN_STATUSES, RECENT_DAYS,
  COLLATERAL_OPTIONS, RUSH_NOTICE,
  pipelineIndex, deliverByState,
  TP_CARRIERS, TP_NOTICE, tpComplete,
  TEST_MODE, SHIPMENT_PREFIX, trackingUrl,
  ISSUE_FLAGS, issueLabel,
  MAX_LINE_QTY, LARGE_ORDER_COOKIES, todayISO,
} from '../utils/sampleCentral';

// Sample Central runs OUTSIDE the shared Layout (App.jsx) so it can carry the
// prototype's own chrome: an aubergine top nav, three tabs, and the shipment
// builder as a slide-out drawer rather than a tab. See ADR-030.
const FILTERS = ['All', 'Stuffed', 'Shot', 'Gourmet', 'Classic'];
// "Pending Shipments" was wrong twice over: the tab has always listed shipped
// and cancelled orders too, and it now leads with an Ordered section. Every row
// is a sample_shipments record whatever its status, so the plain noun is the
// honest label. `key` stays `mission` — it is persisted in component state and
// renaming it buys nothing.
const TABS = [
  { key: 'shop', label: 'Order Samples' },
  { key: 'mission', label: 'Shipments' },
  { key: 'address', label: 'Address Book' },
];

// Stable identity for a custom line, so React keys survive a mid-list delete.
const newLineId = () => (globalThis.crypto?.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(36).slice(2, 7)}`);

const EMPTY_HEADER = {
  sales_rep_id: '', account: '', address_id: '', temp_override: '',
  required_by: '', rush: false, collateral: [], notes: '',
  third_party_billing: false, tp_carrier: '', tp_account: '', tp_postal_code: '',
};

const TempBadge = ({ temp, overridden }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-[14px] font-semibold ${temp === 'Cold' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'}`}>
    {temp === 'Cold' ? 'Cold chain' : 'Ambient'}{overridden ? ' · override' : ''}
  </span>
);
const StatusPill = ({ s }) => {
  const map = {
    submitted: 'bg-gray-100 text-gr', processing: 'bg-blue-100 text-blue-700',
    shipped: 'bg-violet-100 text-violet-700', delivered: 'bg-green-100 text-green-700',
    // Exceptions read as warnings, not stages — they need to catch the eye.
    on_hold: 'bg-amber-100 text-amber-800', cancelled: 'bg-red-100 text-red-700',
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[14px] font-semibold ${map[s] || map.submitted}`}>{s === 'on_hold' ? 'on hold' : s}</span>;
};

export default function SampleCentral() {
  const { profile } = useAuth();
  const canWrite = ['admin', 'finance', 'ops', 'cortina'].includes(profile?.role);
  const { data, loading, error, refresh } = useSampleCentral();
  const [tab, setTab] = useState('shop');
  const [cartOpen, setCartOpen] = useState(false);
  const [filter, setFilter] = useState('All');
  const [cart, setCart] = useState({}); // code -> qty
  const [customItems, setCustomItems] = useState([]); // [{ spec, qty, project_no }]
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [toast, setToast] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [invalid, setInvalid] = useState(null);   // { field, message } | null

  // Any edit clears the standing error. Re-validating on every keystroke would
  // nag mid-typing; clearing is the half that is always welcome.
  useEffect(() => { setInvalid(null); }, [header, cart, customItems]);

  const productByCode = useMemo(() => new Map((data?.catalog || []).map((p) => [p.code, p])), [data]);
  const cartLines = useMemo(
    () => Object.entries(cart).filter(([, q]) => q > 0).map(([code, qty]) => ({ code, qty, product: productByCode.get(code) })),
    [cart, productByCode]
  );
  const cartCount = cartLines.reduce((n, l) => n + l.qty, 0);
  const temp = effectiveTemp(header.temp_override, cartLines.map((l) => ({ code: l.code })), productByCode);

  // Clamped at both ends. The upper bound is a typo guard, not a business rule —
  // see MAX_LINE_QTY. Without it a stray keypress in the quantity box orders
  // five figures of cookies, and the order cannot be recalled from this app.
  const setQty = (code, qty) => setCart((c) => ({ ...c, [code]: Math.min(MAX_LINE_QTY, Math.max(0, qty)) }));
  const addToCart = (code) => setQty(code, (cart[code] || 0) + 1);

  const resetBuild = () => {
    setCart({});
    setCustomItems([]);
    setHeader(EMPTY_HEADER);
  };

  // Validation is split out of submit() so the confirm sheet cannot open on an
  // order that would fail anyway — and so submit() can re-check. The two are a
  // moment apart, and the cart is still editable behind the sheet.
  // Returns { field, message } so the message can be rendered AT the control
  // that is wrong. A toast at the top of <main> describing a field inside a
  // right-hand drawer — possibly scrolled out of view — makes the user hunt for
  // what they got wrong.
  const validationError = () => {
    if (!header.sales_rep_id) return { field: 'sales_rep_id', message: 'Pick a salesperson — they receive the shipment notification.' };
    if (!header.address_id) return { field: 'address_id', message: 'Pick a ship-to address.' };
    if (cartLines.length === 0 && customItems.length === 0) return { field: 'items', message: 'Add at least one cookie or custom line.' };
    if (!tpComplete(header)) return { field: 'third_party', message: 'Carrier, account number and postal code are all needed — the co-man cannot bill the account without all three.' };
    return null;
  };

  const requestSubmit = () => {
    const err = validationError();
    setInvalid(err);
    if (err) return;
    setSubmitError(null);
    setConfirming(true);
  };

  const submit = async () => {
    const err = validationError();
    if (err) { setInvalid(err); setConfirming(false); return; }
    setSubmitError(null);
    // A submitted order cannot be recalled from this app, so a double-click must
    // not become two shipments — and two inserts would also race for the same
    // shipment_no, which is UNIQUE.
    if (submitting) return;
    setSubmitting(true);
    const items = [
      ...cartLines.map((l) => ({ product_code: l.code, custom: false, qty: l.qty, description: l.product?.description || l.code })),
      ...customItems.filter((c) => c.spec).map((c) => ({ product_code: null, custom: true, custom_spec: c.spec, project_no: c.project_no || null, qty: Number(c.qty) || 1, description: c.spec })),
    ];
    const h = {
      sales_rep_id: header.sales_rep_id, account: header.account || null, address_id: header.address_id,
      temp, temp_override: header.temp_override || null, required_by: header.required_by || null, rush: !!header.rush,
      collateral: header.collateral, notes: header.notes || null, status: 'submitted',
      third_party_billing: !!header.third_party_billing,
      tp_carrier: header.third_party_billing ? header.tp_carrier : null,
      tp_account: header.third_party_billing ? header.tp_account.trim() : null,
      tp_postal_code: header.third_party_billing ? header.tp_postal_code.trim() : null,
    };
    const { error: e, shipment } = await createShipment(h, items, data.shipments);
    if (e) {
      // Reported INSIDE the sheet, not via the toast. The toast renders at the
      // top of <main>, which sits behind this sheet's overlay — the user would
      // get a dimmed screen and no explanation, on the one action that most
      // needs one. Stay open: the cart is intact and the error is usually
      // actionable (a duplicate number, a dropped connection).
      setSubmitting(false);
      return setSubmitError(e.message);
    }
    resetBuild();
    await refresh();
    setSubmitting(false);
    setConfirming(false);
    setCartOpen(false);
    setToast({ ok: `Shipment ${shipment.shipment_no} submitted.` });
    setTab('mission');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F3] text-dk font-sans">
      {/* ── Aubergine nav (prototype .nav) ─────────────────────────────────── */}
      <nav className="sticky top-0 z-30 h-[60px] px-6 flex items-center gap-1 bg-dk text-white">
        <div className="flex items-center gap-[9px] font-extrabold text-[18px] tracking-[.3px] mr-2">
          <span className="w-[10px] h-[10px] rounded-full bg-pk" />
          Sample Central
          <small className="font-medium text-[12px] tracking-[.5px] uppercase text-[#C9B8D6]">Dirty Cookie</small>
        </div>
        <div className="flex gap-0.5 ml-[18px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`font-semibold text-[15px] px-[15px] py-2 rounded-lg ${tab === t.key ? 'bg-pk text-white' : 'text-[#C9B8D6] hover:text-white hover:bg-white/10'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <AppSwitcher dark />
          <button
            onClick={() => setCartOpen(true)}
            className="relative bg-pk hover:bg-pm text-white font-bold text-[15px] px-4 py-2 rounded-lg"
          >
            Build Shipment
            {cartCount > 0 && (
              <span className="absolute -top-[7px] -right-[7px] w-5 h-5 rounded-full bg-white text-pk text-[12px] font-extrabold flex items-center justify-center">{cartCount}</span>
            )}
          </button>
        </div>
      </nav>

      {TEST_MODE && (
        <div className="bg-amber-100 text-amber-900 border-b border-amber-300 text-[14px] font-bold px-6 py-1.5">
          TEST MODE — orders are numbered {SHIPMENT_PREFIX}#### and still reach ShipStation
        </div>
      )}

      <main className="flex-1 px-6 py-5">
        {/* The live region is ALWAYS mounted. A region that appears at the same
            moment as its text is frequently missed by screen readers — they
            watch existing regions for changes. Errors additionally carry
            role="alert", which is announced on insertion. */}
        <div aria-live="polite" aria-atomic="true">
          {toast && (
            <div
              role={toast.err ? 'alert' : undefined}
              className={`mb-3 text-[14px] px-3 py-2 rounded border ${toast.err ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}
            >
              {toast.err || toast.ok}
              <button onClick={() => setToast(null)} className="ml-2 text-gr underline">Dismiss</button>
            </div>
          )}
        </div>

        {loading && <div className="text-sm text-gr py-10 text-center">Loading Sample Central…</div>}
        {error && (
          <div className="text-sm text-red-600 py-6">
            {error}
            <div className="text-[14px] text-gr mt-1">If tables are missing, apply the Phase-2 migrations first (sample_central_tables, user_active_in_dropdown).</div>
          </div>
        )}

        {!loading && !error && (
          <>
            {tab === 'shop' && <CatalogView data={data} filter={filter} setFilter={setFilter} cart={cart} setQty={setQty} addToCart={addToCart} />}
            {tab === 'mission' && <MissionView data={data} canWrite={canWrite} refresh={refresh} setToast={setToast} />}
            {tab === 'address' && <AddressView data={data} refresh={refresh} canWrite={canWrite} setToast={setToast} />}
          </>
        )}
      </main>

      {cartOpen && !loading && !error && (
        <CartDrawer
          data={data} cart={cart} setCart={setCart} cartLines={cartLines} setQty={setQty}
          customItems={customItems} setCustomItems={setCustomItems} header={header} setHeader={setHeader}
          temp={temp} productByCode={productByCode} profile={profile} canWrite={canWrite}
          onClose={() => setCartOpen(false)} onAddAddress={refresh} refresh={refresh}
          submit={requestSubmit} setToast={setToast} invalid={invalid}
        />
      )}

      {confirming && (
        <ConfirmSubmit
          rep={data.salespeople.find((s) => s.id === header.sales_rep_id)}
          addr={data.addresses.find((a) => a.id === header.address_id)}
          header={header} cartLines={cartLines} customItems={customItems} temp={temp}
          submitting={submitting} submitError={submitError}
          onCancel={() => { setSubmitError(null); setConfirming(false); }}
          onConfirm={submit}
        />
      )}
    </div>
  );
}

// ── Confirm before submitting ───────────────────────────────────────────────
// The last reversible moment. Once this insert lands, the order is exported to
// the co-manufacturer's REAL ShipStation queue — there is no sandbox (ADR-029),
// status is owned by ShipStation and read-only here (ADR-032), and the Cortina
// ordering account has no ShipStation login. So the person who makes a mistake
// is not the person who can fix it, and the fix happens in another system.
//
// This sheet therefore shows the four things that are expensive to get wrong and
// invisible on the way in: WHO gets notified (the email, not just the name),
// WHERE it ships, HOW MANY cookies, and whether it is going out cold.
function ConfirmSubmit({ rep, addr, header, cartLines, customItems, temp, submitting, submitError, onCancel, onConfirm }) {
  const ref = useRef(null);
  // Escape is ignored mid-submit: the insert is already in flight and closing
  // the sheet would leave the user unsure whether the order went out.
  useDialog(ref, submitting ? undefined : onCancel);
  const cookies = cartLines.reduce((n, l) => n + l.qty, 0);
  const customLines = customItems.filter((c) => c.spec);
  const large = cookies >= LARGE_ORDER_COOKIES;

  const Row = ({ label, children, warn }) => (
    <div className="flex gap-3 py-1.5 border-b border-bg last:border-0">
      <div className="w-[104px] shrink-0 text-[12px] uppercase tracking-[.4px] text-gr font-semibold">{label}</div>
      <div className={`text-[14px] min-w-0 ${warn ? 'text-amber-800 font-semibold' : 'text-dk'}`}>{children}</div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" aria-hidden="true" />
      <div
        ref={ref} role="dialog" aria-modal="true" aria-labelledby="confirm-title"
        // max-h + scroll: the sheet grows with the order (line list, third-party
        // billing, test banner). Anchored to the bottom on mobile, an unbounded
        // sheet runs off the TOP of the screen, where a fixed element cannot be
        // scrolled back into view.
        className="fixed z-[70] inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-[440px] max-h-[90vh] overflow-y-auto bg-cd rounded-t-2xl sm:rounded-2xl shadow-2xl p-4"
      >
        <h2 id="confirm-title" className="text-[18px] font-extrabold text-dk mb-0.5">Send this shipment?</h2>
        <p className="text-[14px] text-gr mb-3">
          It goes straight to the co-manufacturer&rsquo;s queue. You cannot cancel it from here
          afterwards &mdash; that takes a message to the Dirty Cookie team.
        </p>

        <div className="bg-bg border border-lt rounded-xl px-3 py-1.5 mb-3">
          <Row label="Notify">
            <div className="font-semibold truncate">{rep?.full_name || '—'}</div>
            {/* The operative field. A wrong address here means the rep silently
                never hears about their own sample. */}
            <div className="text-[14px] text-gr break-all">{rep?.email || 'no email on file'}</div>
          </Row>
          <Row label="Ship to">
            <div className="truncate">{addr?.contact_name} · {addr?.company}</div>
            <div className="text-[14px] text-gr">{addr?.street}, {addr?.city}, {addr?.state} {addr?.zip}</div>
          </Row>
          {header.account && <Row label="Account">{header.account}</Row>}
          <Row label="Contents" warn={large}>
            {cookies} cookie{cookies === 1 ? '' : 's'} across {cartLines.length} line{cartLines.length === 1 ? '' : 's'}
            {customLines.length > 0 && ` · ${customLines.length} custom`}
            {large && <div className="text-[12px] font-normal">That is a large shipment — worth a second look.</div>}

            {/* The lines themselves, not just the totals. A count cannot catch
                the two mistakes this sheet exists to catch — 120 of something
                instead of 12, or the wrong cookie entirely — and by this point
                the cart is behind an overlay and cannot be re-read. Scrolls
                rather than growing, so the buttons stay on screen. */}
            <ul className="mt-1.5 max-h-[152px] overflow-y-auto pr-1 space-y-0.5">
              {cartLines.map((l) => (
                <li key={l.code} className="flex gap-2 items-baseline">
                  <span className="w-9 shrink-0 text-right font-mono text-[12px] font-bold text-dk">{l.qty}×</span>
                  <span className="min-w-0 truncate text-[12px] font-normal text-gr" title={l.product?.description || l.code}>
                    {l.product?.description || l.code}
                  </span>
                </li>
              ))}
              {customLines.map((c, i) => (
                <li key={c.id ?? i} className="flex gap-2 items-baseline">
                  <span className="w-9 shrink-0 text-right font-mono text-[12px] font-bold text-dk">{Number(c.qty) || 1}×</span>
                  <span className="min-w-0 truncate text-[12px] font-normal text-gr" title={c.spec}>
                    {c.spec}
                    <span className="text-pk font-semibold"> · custom</span>
                    {c.project_no ? <span className="font-mono"> {c.project_no}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Row>
          <Row label="Handling" warn={temp === 'Cold'}>
            {temp === 'Cold' ? 'Cold chain — ships next-day' : 'Ambient'}
            {header.rush && <span className="text-red-700 font-bold"> · RUSH</span>}
            {header.required_by && <span className="text-gr font-normal"> · deliver by {header.required_by}</span>}
          </Row>
          {header.third_party_billing && (
            <Row label="Billing">Third party — {header.tp_carrier} {header.tp_account}</Row>
          )}
        </div>

        {TEST_MODE && (
          <div className="text-[12px] text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-2.5 py-1.5 mb-3">
            Test mode numbers this {SHIPMENT_PREFIX}#### — but it still reaches the co-man&rsquo;s real queue.
          </div>
        )}

        {submitError && (
          <div role="alert" className="text-[14px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mb-3">
            Not sent — {submitError}
          </div>
        )}

        <div className="flex gap-2">
          <button
            data-autofocus onClick={onCancel} disabled={submitting}
            className="flex-1 border border-lt bg-bg text-dk py-2.5 rounded-lg text-[15px] font-bold disabled:opacity-50"
          >
            Keep editing
          </button>
          <button
            onClick={onConfirm} disabled={submitting}
            className="flex-1 bg-pk text-white py-2.5 rounded-lg text-[15px] font-bold hover:bg-pm disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send it'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Catalog (Prep → Tier → Size) ────────────────────────────────────────────
function CatalogView({ data, filter, setFilter, cart, setQty, addToCart }) {
  const items = data.catalog.filter((c) => {
    if (filter === 'All') return true;
    if (filter === 'Stuffed') return !!c.stuffing;
    if (filter === 'Shot') return c.form === 'Shot';
    return c.tier === filter;
  });
  const groups = groupCatalog(items);
  return (
    <div>
      <div className="text-[14px] text-gr mb-3">Organized by prep state → tier → size — the order that drives how a sample shipment is pulled and handled. UOM: <b>1 cookie · EA</b>.</div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3.5 py-1.5 rounded-full text-[14px] font-semibold border ${filter === f ? 'border-pk bg-pk text-white' : 'border-lt bg-cd text-gr hover:text-pk'}`}>
            {f}
          </button>
        ))}
      </div>
      {items.length === 0 && <div className="text-[15px] text-gr italic py-8 text-center">No sample-eligible cookies match this filter.</div>}
      {groups.map((g) => (
        <div key={g.prep} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded-full text-[14px] font-bold ${g.prep === 'Raw' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'}`}>{g.prep}</span>
            <span className="text-[14px] text-gr">{g.count} cookie{g.count > 1 ? 's' : ''} · {g.storage}</span>
          </div>
          {g.tiers.map((t) => (
            <div key={t.tier} className="mb-3 bg-cd border border-lt rounded-xl overflow-hidden">
              <div className="px-3 py-1.5 bg-pc flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[14px] font-semibold ${t.tier === 'Gourmet' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'}`}>{t.tier}</span>
                <span className="text-[14px] font-semibold text-dk">{t.tier} cookies</span>
                <span className="text-[14px] text-gr">{t.items.length} option{t.items.length > 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-bg">
                {t.items.map((p) => (
                  <div key={p.code} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-dk truncate">{flavorFamily(p)}</div>
                      <div className="text-[14px] text-gr truncate">{p.description} · <span className="font-mono">{p.code}</span></div>
                    </div>
                    <div className="text-[14px] text-gr whitespace-nowrap">{p.dough_oz}oz · 1 cookie · EA</div>
                    <div className="flex items-center gap-1">
                      <button aria-label={`One fewer ${p.description || p.code}`} onClick={() => setQty(p.code, (cart[p.code] || 0) - 1)} className="w-6 h-6 rounded border border-lt text-gr hover:text-pk relative after:absolute after:-inset-[10px] after:content-['']">−</button>
                      <input
                        type="number" inputMode="numeric" min="0" max={MAX_LINE_QTY}
                        aria-label={`Quantity — ${p.description || p.code}`}
                        value={cart[p.code] || 0}
                        onChange={(e) => setQty(p.code, parseInt(e.target.value, 10) || 0)}
                        className="w-14 text-center border border-lt rounded text-[14px] py-0.5"
                      />
                      <button aria-label={`One more ${p.description || p.code}`} onClick={() => addToCart(p.code)} className="w-6 h-6 rounded border border-pk bg-pk text-white relative after:absolute after:-inset-[10px] after:content-['']">+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Build Shipment drawer (prototype's cart panel) ──────────────────────────
function CartDrawer({
  data, cart, setCart, cartLines, setQty, customItems, setCustomItems, header, setHeader,
  temp, productByCode, profile, canWrite, onClose, onAddAddress, refresh, submit, setToast, invalid,
}) {
  const [showAddr, setShowAddr] = useState(false);
  const ref = useRef(null);
  useDialog(ref, onClose);
  // The message renders under its own control; `Err` keeps that one-liner honest
  // about which field it belongs to.
  const Err = ({ field }) => (invalid?.field === field
    ? <div role="alert" className="text-[12px] text-red-700 mt-1">{invalid.message}</div>
    : null);
  const set = (k, v) => setHeader((h) => ({ ...h, [k]: v }));
  const toggleCollateral = (c) => setHeader((h) => ({ ...h, collateral: h.collateral.includes(c) ? h.collateral.filter((x) => x !== c) : [...h.collateral, c] }));
  const overridden = !!header.temp_override && header.temp_override !== derivedTemp(cartLines.map((l) => ({ code: l.code })), productByCode);
  const addr = data.addresses.find((a) => a.id === header.address_id);

  return (
    <>
      {/* Presentational only — the × button and Escape are the real close
          affordances, and both are keyboard-reachable. */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} aria-hidden="true" />
      <aside
        ref={ref} role="dialog" aria-modal="true" aria-labelledby="drawer-title"
        className="fixed right-0 top-0 h-full w-full sm:w-[460px] bg-cd z-50 shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-4 h-[60px] border-b border-lt shrink-0">
          <div id="drawer-title" className="font-extrabold text-[18px] text-dk">Build Shipment</div>
          <button onClick={onClose} className="text-gr hover:text-pk text-[18px] leading-none px-3 py-2" aria-label="Close Build Shipment">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <Section title="Who & where">
            <Labeled label="Salesperson *">
              {/* A combobox, not a <select>: 27 reps is past the point where
                  scrolling an unsearchable list is reasonable. Filtering matches
                  the EMAIL too — that is the field ShipStation notifies, and the
                  roster holds two LiDestris plus three addresses that do not
                  match their person, so the name alone is not enough to pick by.
                  Full width, because a half-width row cannot show an email. */}
              <SearchSelect
                id="salesperson"
                ariaLabel="Salesperson — search by name or email"
                placeholder="Type a name or email"
                value={header.sales_rep_id}
                onChange={(id) => set('sales_rep_id', id)}
                invalid={invalid?.field === 'sales_rep_id'}
                options={data.salespeople.map((sp) => ({ id: sp.id, label: sp.full_name, sub: sp.email }))}
              />
              <Err field="sales_rep_id" />
            </Labeled>
            <div className="mt-2">
              <Labeled label="Account">
                <input value={header.account} onChange={(e) => set('account', e.target.value)} placeholder="Whole Foods Market" className="w-full px-2 py-1 rounded border border-lt text-[14px]" />
              </Labeled>
            </div>
            <div className="mt-2">
              <div className="flex justify-between items-center mb-0.5">
                <div className="text-[12px] text-gr uppercase">Ship-to address *</div>
                <button onClick={() => setShowAddr((v) => !v)} className="text-[14px] text-pk font-semibold">{showAddr ? 'Cancel' : '+ New address'}</button>
              </div>
              <select
                value={header.address_id} onChange={(e) => set('address_id', e.target.value)}
                aria-invalid={invalid?.field === 'address_id' || undefined}
                className={`w-full px-2 py-1 rounded border text-[14px] bg-bg ${invalid?.field === 'address_id' ? 'border-red-500' : 'border-lt'}`}
              >
                <option value="">— select —</option>
                {data.addresses.map((a) => <option key={a.id} value={a.id}>{a.nickname || a.company} — {a.city}, {a.state}</option>)}
              </select>
              <Err field="address_id" />
              {addr && <div className="text-[14px] text-gr mt-1">{addr.contact_name} · {addr.company} · {addr.street}, {addr.city}, {addr.state} {addr.zip}</div>}
              {showAddr && <InlineAddress onSaved={() => { setShowAddr(false); onAddAddress(); }} canWrite={canWrite} setToast={setToast} />}
            </div>
          </Section>

          <QuickStartPanel
            data={data} cart={cart} setCart={setCart} profile={profile}
            canWrite={canWrite} refresh={refresh} setToast={setToast} setHeader={setHeader}
          />

          <Section title="Cookies">
            {cartLines.length === 0 ? (
              <>
                <div className="text-[14px] text-gr italic">Cart is empty — add cookies from <b>Order Samples</b>, or start from a saved assortment above.</div>
                <Err field="items" />
              </>
            ) : (
              <div className="divide-y divide-bg">
                {cartLines.map((l) => (
                  <div key={l.code} className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 min-w-0"><div className="text-[14px] font-semibold text-dk truncate">{l.product?.description || l.code}</div><div className="text-[12px] font-mono text-gr">{l.code}</div></div>
                    <div className="flex items-center gap-1">
                      <button aria-label={`One fewer ${l.product?.description || l.code}`} onClick={() => setQty(l.code, l.qty - 1)} className="w-5 h-5 rounded border border-lt text-gr relative after:absolute after:-inset-[10px] after:content-['']">−</button>
                      <span className="text-[14px] w-6 text-center">{l.qty}</span>
                      <button aria-label={`One more ${l.product?.description || l.code}`} onClick={() => setQty(l.code, l.qty + 1)} className="w-5 h-5 rounded border border-pk bg-pk text-white relative after:absolute after:-inset-[10px] after:content-['']">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Custom requests (optional)">
            {customItems.map((c, i) => (
              // Keyed by identity, not index: deleting a line with index keys
              // hands the removed row's DOM node (and focus) to its neighbour.
              <div key={c.id ?? i} className="grid grid-cols-12 gap-1.5 mb-1.5">
                <input value={c.spec} onChange={(e) => setCustomItems((arr) => arr.map((x, j) => (j === i ? { ...x, spec: e.target.value } : x)))} placeholder="Custom item spec" className="col-span-6 px-2 py-1 rounded border border-lt text-[14px]" />
                <input value={c.project_no || ''} onChange={(e) => setCustomItems((arr) => arr.map((x, j) => (j === i ? { ...x, project_no: e.target.value } : x)))} placeholder="Project #" className="col-span-3 px-2 py-1 rounded border border-lt text-[14px] font-mono" />
                <input type="number" value={c.qty} onChange={(e) => setCustomItems((arr) => arr.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="col-span-2 px-2 py-1 rounded border border-lt text-[14px]" />
                <button
                  onClick={() => setCustomItems((arr) => arr.filter((_, j) => j !== i))}
                  aria-label={`Remove custom line ${i + 1}${c.spec ? `: ${c.spec}` : ''}`}
                  className="col-span-1 text-red-600 text-[15px] relative after:absolute after:-inset-2 after:content-['']"
                >×</button>
              </div>
            ))}
            <button onClick={() => setCustomItems((arr) => [...arr, { id: newLineId(), spec: '', qty: 1, project_no: '' }])} className="text-[14px] text-pk font-semibold py-1.5">+ Add custom line</button>
          </Section>

          <Section title="Handling">
            <div className="flex items-center justify-between mb-2">
              <TempBadge temp={temp} overridden={overridden} />
            </div>
            <Labeled label="Temp override (deprioritized)">
              <select value={header.temp_override} onChange={(e) => set('temp_override', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[14px] bg-bg">
                <option value="">— auto from items ({derivedTemp(cartLines.map((l) => ({ code: l.code })), productByCode)}) —</option>
                <option value="Ambient">Ambient</option>
                <option value="Cold">Cold</option>
              </select>
            </Labeled>
            <div className="mt-2">
              {/* `min` = today. A past deadline is overdue the instant it is
                  submitted, and it is stamped onto ShipStation's native Deliver
                  By field by the sweep — so it hands the co-man an impossible
                  date and pollutes their sorting. */}
              <Labeled label="Deliver by"><input type="date" min={todayISO()} value={header.required_by} onChange={(e) => set('required_by', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[14px]" /></Labeled>
            </div>
            <label className={`flex items-start gap-2 mt-2 p-2 rounded-lg border cursor-pointer ${header.rush ? 'border-red-300 bg-red-50' : 'border-lt bg-bg'}`}>
              <input type="checkbox" checked={!!header.rush} onChange={(e) => set('rush', e.target.checked)} className="mt-0.5" />
              <span>
                <span className={`block text-[14px] font-bold ${header.rush ? 'text-red-700' : 'text-dk'}`}>Rush order</span>
                <span className="block text-[12px] text-gr">{RUSH_NOTICE}</span>
              </span>
            </label>
            <label className={`flex items-start gap-2 mt-2 p-2 rounded-lg border cursor-pointer ${header.third_party_billing ? 'border-pk bg-pink-50' : 'border-lt bg-bg'}`}>
              <input type="checkbox" checked={!!header.third_party_billing} onChange={(e) => set('third_party_billing', e.target.checked)} className="mt-0.5" />
              <span>
                <span className="block text-[14px] font-bold text-dk">Bill shipping to a third-party account</span>
                <span className="block text-[12px] text-gr">Use the customer&rsquo;s carrier account instead of Dirty Cookie&rsquo;s.</span>
              </span>
            </label>
            {header.third_party_billing && (
              <div className="mt-1.5 p-2 rounded-lg border border-lt bg-bg space-y-1.5">
                <Labeled label="Carrier *">
                  <select value={header.tp_carrier} onChange={(e) => set('tp_carrier', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[14px] bg-cd">
                    <option value="">— select —</option>
                    {TP_CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Labeled>
                <div className="grid grid-cols-2 gap-2">
                  <Labeled label="Account number *">
                    <input value={header.tp_account} onChange={(e) => set('tp_account', e.target.value)} placeholder="123456789" className="w-full px-2 py-1 rounded border border-lt text-[14px] font-mono" />
                  </Labeled>
                  <Labeled label="Account postal code *">
                    <input value={header.tp_postal_code} onChange={(e) => set('tp_postal_code', e.target.value)} placeholder="90210" className="w-full px-2 py-1 rounded border border-lt text-[14px] font-mono" />
                  </Labeled>
                </div>
                <Err field="third_party" />
                <div className="text-[12px] text-gr">{TP_NOTICE}</div>
              </div>
            )}
            <div className="text-[12px] text-gr mt-2">Shipping service and box are chosen in ShipStation. Cold-chain orders are auto-upgraded to next-day there.</div>
          </Section>

          <Section title="Collateral">
            {COLLATERAL_OPTIONS.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-[14px] text-dk py-0.5">
                <input type="checkbox" checked={header.collateral.includes(c)} onChange={() => toggleCollateral(c)} /> {c}
              </label>
            ))}
          </Section>

          <Section title="Notes">
            <textarea value={header.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="w-full px-2 py-1 rounded border border-lt text-[14px]" placeholder="First meeting, keep it classic." />
          </Section>
        </div>

        <footer className="px-4 py-3 border-t border-lt shrink-0">
          {/* Opens the confirm sheet — it no longer submits directly. The label
              says so, so the button does not promise an action it does not take. */}
          <button onClick={submit} disabled={!canWrite} className="w-full bg-pk text-white py-2.5 rounded-lg text-[15px] font-bold hover:bg-pm disabled:opacity-50">Review &amp; submit</button>
          {!canWrite && <div className="text-[14px] text-gr text-center mt-1">Your role can view but not submit.</div>}
        </footer>
      </aside>
    </>
  );
}

// Quick start — saved assortments + duplicate a past shipment. Lives in the
// drawer (prototype behaviour), positioned right under the ship-to block.
function QuickStartPanel({ data, cart, setCart, profile, canWrite, refresh, setToast, setHeader }) {
  const [name, setName] = useState('');
  const addItems = (items, keyOf, qtyOf) => {
    const next = { ...cart };
    (items || []).forEach((it) => { const k = keyOf(it); if (k) next[k] = (next[k] || 0) + (qtyOf(it) || 1); });
    setCart(next);
  };
  const applyTemplate = (t) => {
    addItems(t.items, (i) => i.product_code || i.code, (i) => i.qty);
    setToast({ ok: `Added “${t.name}” to the cart.` });
  };
  const dupShipment = (s) => {
    addItems((s.sample_shipment_items || []).filter((i) => i.product_code), (i) => i.product_code, (i) => i.qty);
    setHeader((h) => ({ ...h, account: h.account || s.account || '', address_id: h.address_id || s.address_id || '' }));
    setToast({ ok: `Duplicated ${s.shipment_no} into the cart.` });
  };
  const saveCurrent = async () => {
    const items = Object.entries(cart).filter(([, q]) => q > 0).map(([product_code, qty]) => ({ product_code, qty }));
    if (!name || items.length === 0) return setToast({ err: 'Name the template and add cookies first.' });
    const { error } = await saveTemplate({ name, description: `${items.length} items`, owner_user_id: profile?.id || null, items });
    if (error) return setToast({ err: error.message });
    setName('');
    refresh();
    setToast({ ok: 'Template saved.' });
  };
  const recent = data.shipments.slice(0, 6);

  return (
    <div className="bg-[#F6F3FA] border border-[#E9E1F2] rounded-xl px-4 py-3">
      <div className="text-[14px] font-extrabold text-dk mb-2">Quick start</div>

      <div className="text-[12px] font-bold uppercase tracking-[.4px] text-gr mb-1.5">Saved assortments</div>
      {data.templates.length === 0 ? (
        <div className="text-[14px] text-gr italic">No templates yet — build a cart, then save it below.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {data.templates.map((t) => (
            <span key={t.id} className="inline-flex items-center bg-cd border border-lt rounded-full overflow-hidden">
              <button onClick={() => applyTemplate(t)} title={t.description || ''} className="text-[14px] font-semibold px-3 py-1 text-dk hover:text-pk">{t.name}</button>
              {canWrite && <button onClick={async () => { await deleteTemplate(t.id); refresh(); }} className="text-[14px] text-gr hover:text-red-600 pr-2.5 pl-0.5 relative after:absolute after:-inset-2 after:content-['']" aria-label={`Delete ${t.name}`}>×</button>}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 mt-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Save current cart as…" className="flex-1 px-2 py-1 rounded border border-lt text-[14px]" />
        <button onClick={saveCurrent} disabled={!canWrite} className="bg-cd border border-pk text-pk px-3 py-1 rounded text-[14px] font-semibold disabled:opacity-50">Save</button>
      </div>

      <div className="text-[12px] font-bold uppercase tracking-[.4px] text-gr mt-3 mb-1.5">Duplicate a past shipment</div>
      {recent.length === 0 ? (
        <div className="text-[14px] text-gr italic">No past shipments yet.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {recent.map((s) => (
            <button key={s.id} onClick={() => dupShipment(s)} title={`${s.account || ''} · ${s.sales_rep?.full_name || ''}`} className="bg-cd border border-lt rounded-full text-[14px] font-semibold px-3 py-1 text-dk hover:text-pk hover:border-pk">
              {s.shipment_no}{s.account ? ` · ${s.account}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Add only. There is no edit, deliberately — see retireAddress(). An address is
// copied into ShipStation at import, so changing it here would not change an
// order the co-man already holds, and an edit control invites exactly that
// misunderstanding. A wrong address is retired and replaced.
const ADDRESS_FIELDS = [
  ['nickname', 'Nickname'], ['contact_name', 'Contact'], ['company', 'Company'],
  ['street', 'Street'], ['city', 'City'], ['state', 'State'], ['zip', 'Zip'],
];

function InlineAddress({ onSaved, canWrite, setToast }) {
  const [f, setF] = useState(() => Object.fromEntries(ADDRESS_FIELDS.map(([k]) => [k, ''])));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await addAddress(f);
    setSaving(false);
    if (error) { if (setToast) setToast({ err: error.message }); else window.alert(error.message); return; }
    // No success toast: this form also opens inside the drawer, where the toast
    // renders behind the overlay. The form closing and the address appearing in
    // the list is the feedback that is visible in both places.
    onSaved();
  };

  return (
    <div className="mt-2 bg-bg border border-lt rounded-lg p-2 grid grid-cols-2 gap-1.5">
      {ADDRESS_FIELDS.map(([k, l]) => (
        <input
          key={k} value={f[k]} onChange={(e) => set(k, e.target.value)}
          placeholder={l} aria-label={l}
          className="px-2 py-1 rounded border border-lt text-[14px]"
        />
      ))}
      <button onClick={save} disabled={saving || !canWrite} className="col-span-2 bg-pk text-white py-1 rounded text-[14px] font-semibold disabled:opacity-50">
        {saving ? 'Saving…' : 'Save address'}
      </button>
    </div>
  );
}

// ── Shipments ───────────────────────────────────────────────────────────────
// Status is READ-ONLY: it is owned by ShipStation. `submitted` is set at order
// creation; the shipnotify POST advances it to `shipped` when the co-man buys a
// label. Nothing in the app writes it, deliberately — an editable field here
// would let the two systems disagree with no way to reconcile.
// ── Column sets ─────────────────────────────────────────────────────────────
// Deliberately DIFFERENT per section. Once an order has shipped, its deliver-by
// deadline and line count stop being the question and "where is it" starts — so
// the shipped table trades those columns for carrier, tracking and cost. A
// single shared column set would have to show the union, half of it blank.
const chip = 'text-[12px] font-bold uppercase px-1.5 py-px rounded whitespace-nowrap';

const colOrder = {
  label: 'Order',
  render: ({ s }) => <span className="font-mono text-[14px] font-bold text-dk">{s.shipment_no}</span>,
};
const colAccount = {
  label: 'Account',
  render: ({ s }) => (
    <>
      <div className="text-[14px] text-dk truncate">{s.account || '—'}</div>
      <div className="text-[12px] text-gr truncate">{s.sales_rep?.full_name || 'Unknown'}</div>
    </>
  ),
};
// Only the exceptional gets a mark. Normal is now the ABSENCE of a chip, which
// is what lets Rush actually stand out — previously it competed with a
// third-party-billing chip on every second row.
const colFlags = {
  label: 'Flags',
  cls: 'sm:justify-self-end',
  render: ({ s, hasCustom }) => (
    <div className="flex flex-wrap gap-1">
      {s.rush && <span className={`${chip} bg-red-600 text-white`}>Rush</span>}
      <TempBadge temp={s.temp} overridden={!!s.temp_override} />
      {hasCustom && <span className={`${chip} bg-pink-100 text-pk`}>Custom</span>}
      {s.third_party_billing && <span className={`${chip} bg-violet-100 text-violet-700`}>3rd-party</span>}
      {s.issue_at && <span className={`${chip} bg-amber-500 text-white`}>Issue</span>}
    </div>
  ),
};

// ⚠️ Every track is FIXED except one 1fr. The header row and the shipment rows
// are separate grid containers that merely share this template — so any
// content-sized track (`auto`, or a minmax whose max is a cap rather than a
// width) resolves differently in each. `minmax(0,auto)` on Flags was as wide as
// the word "Flags" in the header and as wide as three badges in the rows; the
// 1fr absorbed the difference, and every column after Account drifted out from
// under its own heading. Fixed tracks resolve identically in both grids.
const ORDERED_COLS = {
  grid: 'sm:grid-cols-[148px_minmax(0,1fr)_76px_152px_184px_16px]',
  cells: [
    colOrder,
    colAccount,
    {
      label: 'Items',
      render: ({ items }) => (
        <span className="text-[14px] text-gr whitespace-nowrap">
          {items.length} · {items.reduce((n, i) => n + (i.qty || 0), 0)}
        </span>
      ),
    },
    {
      label: 'Deliver by',
      render: ({ s, due }) => !s.required_by ? <span className="text-[14px] text-gr">—</span> : (
        <div className="whitespace-nowrap">
          <span className="text-[14px] text-dk">{s.required_by}</span>
          {due && (
            <span className={`ml-1.5 text-[12px] font-bold ${due.overdue ? 'text-red-700' : due.dueSoon ? 'text-amber-700' : 'text-gr'}`}>
              {due.label}
            </span>
          )}
        </div>
      ),
    },
    colFlags,
  ],
};

const SHIPPED_COLS = {
  grid: 'sm:grid-cols-[148px_minmax(0,1fr)_100px_132px_190px_68px_16px]',
  cells: [
    colOrder,
    colAccount,
    {
      label: 'Shipped',
      render: ({ s }) => (
        <span className="text-[14px] text-dk whitespace-nowrap">
          {s.shipped_at ? new Date(s.shipped_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      label: 'Carrier',
      render: ({ s }) => <span className="text-[14px] text-gr truncate block">{s.service || s.carrier || '—'}</span>,
    },
    {
      label: 'Tracking',
      render: ({ s }) => s.tracking_number
        ? <span className="text-[14px]"><TrackingLink number={s.tracking_number} carrier={s.carrier} /></span>
        : <span className="text-[14px] text-gr">—</span>,
    },
    {
      label: 'Cost',
      cls: 'sm:text-right',
      render: ({ s }) => (
        <span className="text-[14px] text-dk whitespace-nowrap">
          {s.shipping_cost != null ? `$${Number(s.shipping_cost).toFixed(2)}` : '—'}
        </span>
      ),
    },
  ],
};

// Delivered gets its own set: once the box has landed, "when did it ship" and
// "what did it cost" stop being the question and "when did it arrive, and was
// anything wrong with it" starts.
const DELIVERED_COLS = {
  grid: 'sm:grid-cols-[148px_minmax(0,1fr)_120px_190px_minmax(0,1fr)_16px]',
  cells: [
    colOrder,
    colAccount,
    {
      label: 'Delivered',
      render: ({ s }) => (
        <span className="text-[14px] text-dk whitespace-nowrap">
          {s.delivered_at ? new Date(s.delivered_at).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      label: 'Tracking',
      render: ({ s }) => s.tracking_number
        ? <span className="text-[14px]"><TrackingLink number={s.tracking_number} carrier={s.carrier} /></span>
        : <span className="text-[14px] text-gr">—</span>,
    },
    {
      label: 'Issues',
      render: ({ s }) => !s.issue_at
        ? <span className="text-[14px] text-gr">—</span>
        : (
          <div className="flex flex-wrap gap-1">
            {(s.issue_flags || []).map((f) => (
              <span key={f} className={`${chip} bg-amber-100 text-amber-800`}>{issueLabel(f)}</span>
            ))}
          </div>
        ),
    },
  ],
};

const EXCEPTION_COLS = {
  grid: 'sm:grid-cols-[148px_minmax(0,1fr)_220px_16px]',
  cells: [
    colOrder,
    colAccount,
    {
      label: 'What happened',
      render: ({ s }) => (
        <span className={`${chip} ${s.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
          {s.status === 'cancelled' ? 'Cancelled' : 'On hold'} · ShipStation
        </span>
      ),
    },
  ],
};

function MissionView({ data, canWrite, refresh, setToast }) {
  const [sp, setSp] = useState('All');
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [openIds, setOpenIds] = useState(() => new Set());

  const query = q.trim().toLowerCase();
  // A search is a deliberate hunt for one order, and the thing you cannot find
  // is usually the old one — so a search always looks at the whole book. Leaving
  // the 10-day window on would let it answer "no results" about an order that is
  // sitting right there, which is worse than no search at all.
  const windowed = !query && !showAll;

  // Order number, account and salesperson. The number is what you search when
  // you already have it in front of you; "everything we sent Whole Foods" and
  // "what has Marci sent" are the questions people actually arrive with, and
  // matching the number alone answered neither.
  const matches = (s) => {
    if (!query) return true;
    return [s.shipment_no, s.account, s.sales_rep?.full_name, s.sales_rep?.email]
      .some((f) => String(f || '').toLowerCase().includes(query));
  };

  const visible = data.shipments.filter((s) => {
    if (sp !== 'All' && s.sales_rep?.id !== sp) return false;
    return matches(s);
  });

  // Two sections, because "what have I ordered" and "what has gone out" are
  // different questions asked at different moments. Each gets its own clock:
  // an order is recent by when it was PLACED, a shipment by when it SHIPPED.
  // A missing date shows rather than hides. shipped_at should always be set by
  // shipnotify, but if it ever is not, dropping the row would report a clean
  // "nothing shipped" about an order that did ship — the same silent
  // incompleteness that has cost this project real time elsewhere.
  const inWindow = (iso) => !windowed || !iso || Date.now() - new Date(iso).getTime() <= RECENT_DAYS * 86400000;
  const ordered = visible.filter((s) => OPEN_STATUSES.includes(s.status) && inWindow(s.created_at));
  // Shipped and delivered are now separate sections. They answer different
  // questions — "is it still out there" vs "did it land, and how did it go" —
  // and lumping them together was only ever a workaround for `delivered` having
  // no source (it has one since ADR-043). Each keeps its own clock: in transit
  // is recent by when it SHIPPED, delivered by when it ARRIVED.
  const shipped = visible.filter((s) => s.status === 'shipped' && inWindow(s.shipped_at));
  const delivered = visible.filter((s) => s.status === 'delivered' && inWindow(s.delivered_at || s.shipped_at));
  const exceptions = visible.filter((s) => EXCEPTION_STATUSES.includes(s.status));

  const totalOpen = visible.filter((s) => OPEN_STATUSES.includes(s.status)).length;
  const totalShipped = visible.filter((s) => s.status === 'shipped').length;
  const totalDelivered = visible.filter((s) => s.status === 'delivered').length;

  const shown = [...ordered, ...shipped, ...delivered, ...exceptions];
  const allOpen = shown.length > 0 && shown.every((s) => openIds.has(s.id));
  const toggleAll = () => setOpenIds(allOpen ? new Set() : new Set(shown.map((s) => s.id)));
  const toggleOne = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const Section = ({ title, note, rows, total, empty, cols }) => (
    <div className="mb-5">
      <div className="flex items-baseline gap-2 mb-2">
        <h3 className="text-[15px] font-extrabold text-dk uppercase tracking-[.4px]">{title}</h3>
        <span className="text-[14px] text-gr">
          {rows.length}{windowed && total > rows.length ? ` of ${total}` : ''}
          {note ? ` · ${note}` : ''}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[14px] text-gr italic py-4 px-3 bg-cd border border-lt rounded-xl">{empty}</div>
      ) : (
        <>
          {/* Desktop-only header. On mobile the rows stack and label themselves,
              so a header here would caption columns that are not there. */}
          <div className={`hidden sm:grid gap-x-3 px-3 pb-1 ${cols.grid}`}>
            {cols.cells.map((c) => (
              <div key={c.label} className={`text-[12px] text-gr uppercase font-bold tracking-[.5px] ${c.cls || ''}`}>
                {c.label}
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {rows.map((s) => (
              <ShipmentCard
                key={s.id} s={s} cols={cols} open={openIds.has(s.id)}
                onToggle={() => toggleOne(s.id)} canWrite={canWrite} refresh={refresh} setToast={setToast}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search order no., account or rep"
          aria-label="Search shipments by order number, account or salesperson"
          className="px-2.5 py-1.5 rounded-lg border border-lt text-[14px] bg-cd w-[240px]"
        />
        {q && (
          <button onClick={() => setQ('')} className="text-[14px] text-pk font-semibold">Clear</button>
        )}
        <span className="text-[14px] text-gr uppercase ml-1">Salesperson</span>
        <select value={sp} onChange={(e) => setSp(e.target.value)} className="px-2 py-1 rounded border border-lt text-[14px] bg-cd">
          <option value="All">All</option>
          {data.salespeople.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={toggleAll} className="text-[14px] font-semibold px-2.5 py-1.5 rounded-lg border border-lt bg-cd text-gr hover:text-pk">
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
        <button
          onClick={() => setShowAll((v) => !v)}
          className={`text-[14px] font-semibold px-2.5 py-1.5 rounded-lg border ${showAll ? 'border-pk bg-pk text-white' : 'border-lt bg-cd text-gr hover:text-pk'}`}
        >
          {showAll ? `All time` : `Last ${RECENT_DAYS} days`}
        </button>
      </div>

      {/* Status is owned by ShipStation and read-only here (ADR-032). Without
          saying so, the absence of any control reads as a missing feature
          rather than a deliberate boundary — and the salesperson sits waiting
          for a change nobody has been asked to make. */}
      <div className="text-[14px] text-gr bg-cd border border-lt rounded-lg px-3 py-2 mb-3">
        Status comes from ShipStation and cannot be changed here.
        <b className="text-dk"> To change, hold or cancel an order, contact the Dirty Cookie team.</b>
      </div>

      {query && (
        <div className="text-[14px] text-gr mb-3">
          Searching all orders for “{q.trim()}” — the {RECENT_DAYS}-day window is ignored while searching.
        </div>
      )}

      <Section
        title="Ordered"
        note="awaiting fulfilment"
        cols={ORDERED_COLS}
        rows={ordered}
        total={totalOpen}
        empty={query ? 'No matching orders awaiting fulfilment.' : `Nothing ordered in the last ${RECENT_DAYS} days.`}
      />
      <Section
        title="In transit"
        note="shipped, not yet delivered"
        cols={SHIPPED_COLS}
        rows={shipped}
        total={totalShipped}
        empty={query ? 'No matching shipped orders.' : `Nothing shipped in the last ${RECENT_DAYS} days.`}
      />
      <Section
        title="Delivered"
        note="arrived — log any issues here"
        cols={DELIVERED_COLS}
        rows={delivered}
        total={totalDelivered}
        empty={query ? 'No matching delivered orders.' : `Nothing delivered in the last ${RECENT_DAYS} days.`}
      />
      {/* Exceptions are never windowed away — a cancelled order the salesperson
          has not seen yet is exactly the thing that must not age off the screen. */}
      {exceptions.length > 0 && (
        <Section title="Needs attention" note="set in ShipStation" cols={EXCEPTION_COLS} rows={exceptions} total={exceptions.length} empty="" />
      )}
    </div>
  );
}

// The collapsed row is a GRID, not free-flowing chips. Every cell lands at the
// same x-position on every row, which is the entire point: you scan a column
// downward instead of re-reading each card. Below `sm` it falls back to stacked
// label/value pairs — a six-column table on a phone is unreadable, and making
// someone scroll sideways to find a tracking number is worse than stacking.
//
// No status pill: the section heading already says it, and repeating it on every
// row was noise carrying no signal.
function ShipmentCard({ s, cols, open, onToggle, canWrite, refresh, setToast }) {
  const items = s.sample_shipment_items || [];
  const hasCustom = items.some((i) => i.custom);
  const addr = s.address || {};
  // pipelineIndex, not indexOf: `processing` is off the stepper but still a legal
  // DB value, and indexOf would return -1 and grey every dot — reading as "stuck
  // at the start" on an order that is progressing normally.
  const stIdx = pipelineIndex(s.status);
  const due = deliverByState(s.required_by, s.status);
  const ctx = { s, items, hasCustom, due };
  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden">
      {/* aria-label: without it the whole six-cell grid is read out as the
          button's label — order number, account, rep, every flag — per row. */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${s.shipment_no}, ${s.account || 'no account'}, ${s.status === 'on_hold' ? 'on hold' : s.status}. ${open ? 'Hide' : 'Show'} details`}
        className={`w-full text-left px-3 py-2.5 hover:bg-pc grid gap-x-3 gap-y-1.5 items-center ${cols.grid}`}
      >
        {cols.cells.map((c) => (
          <div key={c.label} className={`min-w-0 ${c.cls || ''}`}>
            {/* The header row is desktop-only, so on mobile each cell carries
                its own label — otherwise the stacked view is unlabelled values. */}
            <div className="sm:hidden text-[12px] text-gr uppercase font-semibold tracking-[.4px]">{c.label}</div>
            {c.render(ctx)}
          </div>
        ))}
        <span className="text-gr text-[15px] hidden sm:block justify-self-end">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-t border-lt px-3 py-3">
          {/* An exception is not a stage. Rendering the stepper for a cancelled
              order greys every dot (indexOf → -1) and reads as "stuck at the
              start", which is worse than saying plainly what happened. */}
          {EXCEPTION_STATUSES.includes(s.status) ? (
            <div className={`mb-3 px-2.5 py-2 rounded-lg border text-[14px] ${s.status === 'cancelled' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              <span className="font-bold">{s.status === 'cancelled' ? 'Cancelled' : 'On hold'} in ShipStation.</span>{' '}
              {s.status === 'cancelled'
                ? 'This shipment will not go out. Raise a new request if it is still needed.'
                : 'Fulfilment is paused. It returns to the queue when the co-man releases it.'}
            </div>
          ) : (
          <div className="mb-3">
            <div className="flex items-center gap-1">
              {SHIP_STATUSES.map((p, i) => (
                <div key={p} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${i < stIdx ? 'bg-green-500' : i === stIdx ? 'bg-pk' : 'bg-lt'}`} />
                  <span className={`text-[12px] ${i === stIdx ? 'font-bold text-dk' : 'text-gr'}`}>
                    {p === 'shipped' ? 'in transit' : p}
                  </span>
                  {i < SHIP_STATUSES.length - 1 && <span className="w-4 h-px bg-lt mx-1" />}
                </div>
              ))}
            </div>
            {/* Delivery IS tracked now (ADR-043): the 15-minute sweep reads the
                carrier's track log per label and promotes shipped → delivered.
                The caption that used to sit here apologised for delivery never
                arriving; it would now be a lie. What is still worth saying is
                when the carrier expects it, and that only while in transit. */}
            {s.status === 'delivered' && s.delivered_at && (
              <div className="text-[12px] text-gr mt-1">
                Delivered {new Date(s.delivered_at).toLocaleDateString()}
              </div>
            )}
          </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KV label="Ship to">
              {addr.contact_name || '—'}{addr.company ? ` · ${addr.company}` : ''}<br />
              {addr.street}, {addr.city}, {addr.state} {addr.zip}
            </KV>
            <KV label="Deliver by">{s.required_by || '—'}</KV>
            <KV label="Collateral">
              {(s.collateral || []).length ? (s.collateral || []).map((c) => (
                <span key={c} className="inline-block text-[12px] font-semibold px-2 py-px rounded bg-bg border border-lt mr-1 mb-1">{c}</span>
              )) : '—'}
            </KV>
            <KV label="Billing">
              {s.third_party_billing
                ? `${s.tp_carrier || '—'} · acct ${s.tp_account || '—'} · ${s.tp_postal_code || '—'}`
                : 'Dirty Cookie account'}
            </KV>
            {s.tracking_number && (
              <KV label="Tracking">
                <TrackingLink number={s.tracking_number} carrier={s.carrier} />{s.carrier ? ` · ${s.carrier}` : ''}{s.service ? ` · ${s.service}` : ''}
              </KV>
            )}
            {s.shipped_at && <KV label="Shipped">{new Date(s.shipped_at).toLocaleDateString()}{s.label_created_at ? ` · label ${new Date(s.label_created_at).toLocaleString()}` : ''}</KV>}
            {s.shipping_cost != null && <KV label="Shipping cost">${Number(s.shipping_cost).toFixed(2)}</KV>}
          </div>

          <div className="mt-3">
            <div className="text-[12px] text-gr uppercase font-bold tracking-wider mb-1">Samples</div>
            <div className="divide-y divide-bg border border-lt rounded-lg">
              {items.map((i) => (
                <div key={i.id || i.product_code || i.custom_spec} className="flex justify-between items-center px-2 py-1.5">
                  <span className="text-[14px] text-dk">
                    {i.custom && <span className="text-[12px] font-semibold px-1.5 py-px rounded bg-pink-100 text-pk mr-1">Custom</span>}
                    {i.description || i.product_code || i.custom_spec}
                    {i.project_no ? <span className="text-[12px] text-gr"> (proj {i.project_no})</span> : null}
                  </span>
                  <span className="text-[14px] font-bold text-dk">×{i.qty}</span>
                </div>
              ))}
            </div>
          </div>

          {s.notes && (
            <div className="mt-3">
              <div className="text-[12px] text-gr uppercase font-bold tracking-wider mb-1">Notes from the order</div>
              <div className="text-[14px] text-dk">{s.notes}</div>
            </div>
          )}

          {/* Delivered only. Every flag in the vocabulary — arrived late, damaged
              in transit, packaging, wrong items — is something you can only know
              once the box has landed, so offering the panel earlier invites a
              guess. The `|| s.issue_at` keeps an already-logged issue visible
              (and clearable) if an order somehow moves back out of delivered;
              hiding a record that exists would be worse than showing it late. */}
          {(s.status === 'delivered' || s.issue_at) && (
            <IssuePanel s={s} canWrite={canWrite} refresh={refresh} setToast={setToast} />
          )}

          <div className="text-[12px] text-gr mt-3">
            Status is set by ShipStation — <span className="font-semibold">submitted</span> on creation, <span className="font-semibold">shipped</span> when the co-man buys a label.
          </div>
        </div>
      )}
    </div>
  );
}

function KV({ label, children }) {
  return (
    <div>
      <div className="text-[12px] text-gr uppercase font-bold tracking-wider mb-0.5">{label}</div>
      <div className="text-[14px] text-dk">{children}</div>
    </div>
  );
}

// The tracking number, linked to the carrier's tracking page when we can work
// out which carrier it is. Degrades to exactly what it rendered before — plain
// mono text — rather than a dead link, because a link that lands on "not found"
// reads to a salesperson as a lost parcel.
function TrackingLink({ number, carrier }) {
  const href = trackingUrl(carrier, number);
  if (!href) return <span className="font-mono">{number}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Track this shipment${carrier ? ` with ${carrier}` : ''}`}
      className="font-mono text-pk font-semibold hover:underline"
    >
      {number}
    </a>
  );
}

// ── Address Book ────────────────────────────────────────────────────────────
function AddressView({ data, refresh, canWrite, setToast }) {
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const retire = async (a) => {
    const { error } = await retireAddress(a.id);
    setConfirmId(null);
    if (error) return setToast({ err: error.message });
    refresh();
    setToast({ ok: `“${a.nickname || a.company}” removed from the address list.` });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="text-[12px] font-bold uppercase tracking-wider text-pk">Ship-to addresses ({data.addresses.length})</div>
        <button onClick={() => setAdding((v) => !v)} className="text-[14px] font-semibold px-2 py-0.5 rounded border border-pk text-pk">{adding ? 'Cancel' : '+ New'}</button>
      </div>

      {/* The boundary, stated where someone would otherwise go looking for an
          edit button. Addresses are copied into ShipStation at import, so
          nothing here reaches an order that has already been placed. */}
      <div className="text-[14px] text-gr bg-cd border border-lt rounded-lg px-3 py-2 mb-2">
        Wrong address? Remove it and add a corrected one — removing hides it from
        the picker and leaves past shipments untouched.
        <b className="text-dk"> To change or cancel an order that has already been submitted, contact the Dirty Cookie team.</b>
      </div>

      {adding && <InlineAddress onSaved={() => { setAdding(false); refresh(); }} canWrite={canWrite} setToast={setToast} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
        {data.addresses.map((a) => (
          <div key={a.id} className="bg-cd border border-lt rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[14px] font-bold text-dk min-w-0 truncate">{a.nickname || a.company}</div>
              {canWrite && confirmId !== a.id && (
                <button
                  onClick={() => setConfirmId(a.id)}
                  aria-label={`Remove ${a.nickname || a.company}`}
                  className="text-[12px] text-gr hover:text-red-600 font-semibold shrink-0 py-1 px-1"
                >Remove</button>
              )}
            </div>
            <div className="text-[14px] text-gr">{a.contact_name} · {a.company}</div>
            <div className="text-[14px] text-gr">{a.street}, {a.city}, {a.state} {a.zip}</div>

            {/* Inline, not a window.confirm: it can say what actually happens. */}
            {confirmId === a.id && (
              <div role="alert" className="mt-2 border border-red-200 bg-red-50 rounded-lg p-2">
                <div className="text-[14px] text-red-700 mb-1.5">
                  Remove from the picker? Shipments already sent to this address keep it.
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setConfirmId(null)} className="flex-1 border border-lt bg-cd text-dk py-1 rounded text-[14px] font-semibold">Keep</button>
                  <button onClick={() => retire(a)} className="flex-1 bg-red-600 text-white py-1 rounded text-[14px] font-semibold">Remove</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {data.addresses.length === 0 && <div className="text-[14px] text-gr italic">No addresses yet — add one above or inline while building a shipment.</div>}
      </div>
    </div>
  );
}

// ── Issue log ───────────────────────────────────────────────────────────────
// What went wrong, recorded per shipment so the PATTERN is visible after twenty
// orders rather than re-learned each time: which lane runs late, which packaging
// arrives crushed, which co-man batch draws quality complaints.
//
// Site-owned. None of it goes to ShipStation, and migration 20260812150000
// records why at length — the short version is that every outbound field is an
// instruction sent BEFORE fulfilment and rewritten on each export, nothing but
// shipnotify comes back, and the one real surface (shipment tags) stops
// existing once an order leaves Awaiting Shipment, which is exactly when an
// issue becomes known.
//
// Rendered only for DELIVERED orders (see the call site). Every flag in the
// vocabulary is a post-arrival judgement, so an earlier panel would collect
// guesses rather than observations.
function IssuePanel({ s, canWrite, refresh, setToast }) {
  const [open, setOpen] = useState(false);
  const [flags, setFlags] = useState(() => s.issue_flags || []);
  const [note, setNote] = useState(s.issue_note || '');
  const [saving, setSaving] = useState(false);
  const logged = !!s.issue_at;

  const toggle = (f) => setFlags((v) => (v.includes(f) ? v.filter((x) => x !== f) : [...v, f]));

  const save = async () => {
    setSaving(true);
    const { error } = await saveShipmentIssue(s.id, { flags, note });
    setSaving(false);
    if (error) return setToast({ err: error.message });
    setOpen(false);
    await refresh();
    setToast({ ok: flags.length || note.trim() ? `Issue logged on ${s.shipment_no}.` : `Issue cleared on ${s.shipment_no}.` });
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[12px] text-gr uppercase font-bold tracking-wider">Issues</div>
        {canWrite && (
          <button onClick={() => setOpen((v) => !v)} className="text-[12px] text-pk font-semibold py-1">
            {open ? 'Cancel' : logged ? 'Edit' : '+ Log an issue'}
          </button>
        )}
      </div>

      {!open && (
        logged ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
            <div className="flex flex-wrap gap-1 mb-1">
              {(s.issue_flags || []).map((f) => (
                <span key={f} className={`${chip} bg-amber-500 text-white`}>{issueLabel(f)}</span>
              ))}
            </div>
            {s.issue_note && <div className="text-[14px] text-amber-900">{s.issue_note}</div>}
            <div className="text-[12px] text-amber-800 mt-0.5">Logged {new Date(s.issue_at).toLocaleDateString()}</div>
          </div>
        ) : (
          <div className="text-[14px] text-gr italic">None recorded.</div>
        )
      )}

      {open && (
        <div className="rounded-lg border border-lt bg-bg p-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            {ISSUE_FLAGS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-[14px] text-dk py-0.5">
                <input type="checkbox" checked={flags.includes(key)} onChange={() => toggle(key)} />
                {label}
              </label>
            ))}
          </div>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            aria-label="Issue detail"
            placeholder="What happened? Anything that would help avoid it next time."
            className="w-full mt-2 px-2 py-1 rounded border border-lt text-[14px]"
          />
          <div className="flex gap-1.5 mt-2">
            <button onClick={() => { setOpen(false); setFlags(s.issue_flags || []); setNote(s.issue_note || ''); }} className="flex-1 border border-lt bg-cd text-dk py-1.5 rounded text-[14px] font-semibold">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 bg-pk text-white py-1.5 rounded text-[14px] font-semibold disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {/* Clearing every box and the note removes the record entirely —
              issue_at goes back to null, so reporting does not count a shipment
              that turned out to be fine. */}
          <div className="text-[12px] text-gr mt-1">Clear everything and save to remove the issue.</div>
        </div>
      )}
    </div>
  );
}

// ── small layout helpers ────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="bg-cd border border-lt rounded-xl p-3">
      <div className="text-[12px] font-bold uppercase tracking-wider text-pk mb-2">{title}</div>
      {children}
    </div>
  );
}
function Labeled({ label, children }) {
  return (
    <div>
      <div className="text-[12px] text-gr uppercase mb-0.5">{label}</div>
      {children}
    </div>
  );
}
