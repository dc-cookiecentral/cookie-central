import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AppSwitcher from '../components/AppSwitcher';
import {
  useSampleCentral, addAddress, createShipment, saveTemplate, deleteTemplate,
} from '../hooks/useSampleCentral';
import {
  flavorFamily, derivedTemp, effectiveTemp, groupCatalog,
  SHIP_STATUSES, COLLATERAL_OPTIONS, RUSH_NOTICE,
  TP_CARRIERS, TP_NOTICE, tpComplete,
  TEST_MODE, SHIPMENT_PREFIX,
} from '../utils/sampleCentral';

// Sample Central runs OUTSIDE the shared Layout (App.jsx) so it can carry the
// prototype's own chrome: an aubergine top nav, three tabs, and the shipment
// builder as a slide-out drawer rather than a tab. See ADR-030.
const FILTERS = ['All', 'Stuffed', 'Shot', 'Gourmet', 'Classic'];
const TABS = [
  { key: 'shop', label: 'Order Samples' },
  { key: 'mission', label: 'Pending Shipments' },
  { key: 'address', label: 'Address Book' },
];

const EMPTY_HEADER = {
  salesperson_user_id: '', account: '', address_id: '', temp_override: '',
  required_by: '', rush: false, collateral: [], notes: '',
  third_party_billing: false, tp_carrier: '', tp_account: '', tp_postal_code: '',
};

const TempBadge = ({ temp, overridden }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${temp === 'Cold' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'}`}>
    {temp === 'Cold' ? 'Cold chain' : 'Ambient'}{overridden ? ' · override' : ''}
  </span>
);
const StatusPill = ({ s }) => {
  const map = { submitted: 'bg-gray-100 text-gr', processing: 'bg-blue-100 text-blue-700', shipped: 'bg-violet-100 text-violet-700', delivered: 'bg-green-100 text-green-700' };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${map[s] || map.submitted}`}>{s}</span>;
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

  const productByCode = useMemo(() => new Map((data?.catalog || []).map((p) => [p.code, p])), [data]);
  const cartLines = useMemo(
    () => Object.entries(cart).filter(([, q]) => q > 0).map(([code, qty]) => ({ code, qty, product: productByCode.get(code) })),
    [cart, productByCode]
  );
  const cartCount = cartLines.reduce((n, l) => n + l.qty, 0);
  const temp = effectiveTemp(header.temp_override, cartLines.map((l) => ({ code: l.code })), productByCode);

  const setQty = (code, qty) => setCart((c) => ({ ...c, [code]: Math.max(0, qty) }));
  const addToCart = (code) => setQty(code, (cart[code] || 0) + 1);

  const resetBuild = () => {
    setCart({});
    setCustomItems([]);
    setHeader(EMPTY_HEADER);
  };

  const submit = async () => {
    if (!header.salesperson_user_id) return setToast({ err: 'Pick a salesperson first.' });
    if (!header.address_id) return setToast({ err: 'Pick a ship-to address.' });
    if (cartLines.length === 0 && customItems.length === 0) return setToast({ err: 'Add at least one cookie or custom line.' });
    if (!tpComplete(header)) return setToast({ err: 'Third-party billing needs carrier, account number and postal code — the co-man cannot bill the account without all three.' });
    const items = [
      ...cartLines.map((l) => ({ product_code: l.code, custom: false, qty: l.qty, description: l.product?.description || l.code })),
      ...customItems.filter((c) => c.spec).map((c) => ({ product_code: null, custom: true, custom_spec: c.spec, project_no: c.project_no || null, qty: Number(c.qty) || 1, description: c.spec })),
    ];
    const h = {
      salesperson_user_id: header.salesperson_user_id, account: header.account || null, address_id: header.address_id,
      temp, temp_override: header.temp_override || null, required_by: header.required_by || null, rush: !!header.rush,
      collateral: header.collateral, notes: header.notes || null, status: 'submitted',
      third_party_billing: !!header.third_party_billing,
      tp_carrier: header.third_party_billing ? header.tp_carrier : null,
      tp_account: header.third_party_billing ? header.tp_account.trim() : null,
      tp_postal_code: header.third_party_billing ? header.tp_postal_code.trim() : null,
    };
    const { error: e, shipment } = await createShipment(h, items, data.shipments);
    if (e) return setToast({ err: e.message });
    resetBuild();
    await refresh();
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
          <small className="font-medium text-[11px] tracking-[.5px] uppercase text-[#C9B8D6]">Dirty Cookie</small>
        </div>
        <div className="flex gap-0.5 ml-[18px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`font-semibold text-[13.5px] px-[15px] py-2 rounded-lg ${tab === t.key ? 'bg-pk text-white' : 'text-[#C9B8D6] hover:text-white hover:bg-white/10'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <AppSwitcher dark />
          <button
            onClick={() => setCartOpen(true)}
            className="relative bg-pk hover:bg-pm text-white font-bold text-[13px] px-4 py-2 rounded-lg"
          >
            Build Shipment
            {cartCount > 0 && (
              <span className="absolute -top-[7px] -right-[7px] w-5 h-5 rounded-full bg-white text-pk text-[11px] font-extrabold flex items-center justify-center">{cartCount}</span>
            )}
          </button>
        </div>
      </nav>

      {TEST_MODE && (
        <div className="bg-amber-100 text-amber-900 border-b border-amber-300 text-[11.5px] font-bold px-6 py-1.5">
          TEST MODE — orders are numbered {SHIPMENT_PREFIX}#### and still reach ShipStation
        </div>
      )}

      <main className="flex-1 px-6 py-5">
        {toast && (
          <div className={`mb-3 text-[12.5px] px-3 py-2 rounded border ${toast.err ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`} onClick={() => setToast(null)}>
            {toast.err || toast.ok} <span className="text-gr">(click to dismiss)</span>
          </div>
        )}

        {loading && <div className="text-sm text-gr py-10 text-center">Loading Sample Central…</div>}
        {error && (
          <div className="text-sm text-red-600 py-6">
            {error}
            <div className="text-[12.5px] text-gr mt-1">If tables are missing, apply the Phase-2 migrations first (sample_central_tables, user_active_in_dropdown).</div>
          </div>
        )}

        {!loading && !error && (
          <>
            {tab === 'shop' && <CatalogView data={data} filter={filter} setFilter={setFilter} cart={cart} setQty={setQty} addToCart={addToCart} />}
            {tab === 'mission' && <MissionView data={data} />}
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
          submit={submit} setToast={setToast}
        />
      )}
    </div>
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
      <div className="text-[12.5px] text-gr mb-3">Organized by prep state → tier → size — the order that drives how a sample shipment is pulled and handled. UOM: <b>1 cookie · EA</b>.</div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border ${filter === f ? 'border-pk bg-pk text-white' : 'border-lt bg-cd text-gr hover:text-pk'}`}>
            {f}
          </button>
        ))}
      </div>
      {items.length === 0 && <div className="text-[13px] text-gr italic py-8 text-center">No sample-eligible cookies match this filter.</div>}
      {groups.map((g) => (
        <div key={g.prep} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-bold ${g.prep === 'Raw' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'}`}>{g.prep}</span>
            <span className="text-[11.5px] text-gr">{g.count} cookie{g.count > 1 ? 's' : ''} · {g.storage}</span>
          </div>
          {g.tiers.map((t) => (
            <div key={t.tier} className="mb-3 bg-cd border border-lt rounded-xl overflow-hidden">
              <div className="px-3 py-1.5 bg-pc flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${t.tier === 'Gourmet' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'}`}>{t.tier}</span>
                <span className="text-[11.5px] font-semibold text-dk">{t.tier} cookies</span>
                <span className="text-[11.5px] text-gr">{t.items.length} option{t.items.length > 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-bg">
                {t.items.map((p) => (
                  <div key={p.code} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-dk truncate">{flavorFamily(p)}</div>
                      <div className="text-[11.5px] text-gr truncate">{p.description} · <span className="font-mono">{p.code}</span></div>
                    </div>
                    <div className="text-[11.5px] text-gr whitespace-nowrap">{p.dough_oz}oz · 1 cookie · EA</div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(p.code, (cart[p.code] || 0) - 1)} className="w-6 h-6 rounded border border-lt text-gr hover:text-pk">−</button>
                      <input value={cart[p.code] || 0} onChange={(e) => setQty(p.code, parseInt(e.target.value, 10) || 0)} className="w-10 text-center border border-lt rounded text-[12.5px] py-0.5" />
                      <button onClick={() => addToCart(p.code)} className="w-6 h-6 rounded border border-pk bg-pk text-white">+</button>
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
  temp, productByCode, profile, canWrite, onClose, onAddAddress, refresh, submit, setToast,
}) {
  const [showAddr, setShowAddr] = useState(false);
  const set = (k, v) => setHeader((h) => ({ ...h, [k]: v }));
  const toggleCollateral = (c) => setHeader((h) => ({ ...h, collateral: h.collateral.includes(c) ? h.collateral.filter((x) => x !== c) : [...h.collateral, c] }));
  const overridden = !!header.temp_override && header.temp_override !== derivedTemp(cartLines.map((l) => ({ code: l.code })), productByCode);
  const addr = data.addresses.find((a) => a.id === header.address_id);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-full sm:w-[460px] bg-cd z-50 shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-4 h-[60px] border-b border-lt shrink-0">
          <div className="font-extrabold text-[16px] text-dk">Build Shipment</div>
          <button onClick={onClose} className="text-gr hover:text-pk text-[20px] leading-none px-2" aria-label="Close">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <Section title="Who & where">
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Salesperson *">
                <select value={header.salesperson_user_id} onChange={(e) => set('salesperson_user_id', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[12.5px] bg-bg">
                  <option value="">— select —</option>
                  {data.salespeople.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </Labeled>
              <Labeled label="Account">
                <input value={header.account} onChange={(e) => set('account', e.target.value)} placeholder="Whole Foods Market" className="w-full px-2 py-1 rounded border border-lt text-[12.5px]" />
              </Labeled>
            </div>
            <div className="mt-2">
              <div className="flex justify-between items-center mb-0.5">
                <div className="text-[10.5px] text-gr uppercase">Ship-to address *</div>
                <button onClick={() => setShowAddr((v) => !v)} className="text-[11.5px] text-pk font-semibold">{showAddr ? 'Cancel' : '+ New address'}</button>
              </div>
              <select value={header.address_id} onChange={(e) => set('address_id', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[12.5px] bg-bg">
                <option value="">— select —</option>
                {data.addresses.map((a) => <option key={a.id} value={a.id}>{a.nickname || a.company} — {a.city}, {a.state}</option>)}
              </select>
              {addr && <div className="text-[11.5px] text-gr mt-1">{addr.contact_name} · {addr.company} · {addr.street}, {addr.city}, {addr.state} {addr.zip}</div>}
              {showAddr && <InlineAddress onSaved={() => { setShowAddr(false); onAddAddress(); }} canWrite={canWrite} setToast={setToast} />}
            </div>
          </Section>

          <QuickStartPanel
            data={data} cart={cart} setCart={setCart} profile={profile}
            canWrite={canWrite} refresh={refresh} setToast={setToast} setHeader={setHeader}
          />

          <Section title="Cookies">
            {cartLines.length === 0 ? (
              <div className="text-[12.5px] text-gr italic">Cart is empty — add cookies from <b>Order Samples</b>, or start from a saved assortment above.</div>
            ) : (
              <div className="divide-y divide-bg">
                {cartLines.map((l) => (
                  <div key={l.code} className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 min-w-0"><div className="text-[12.5px] font-semibold text-dk truncate">{l.product?.description || l.code}</div><div className="text-[10.5px] font-mono text-gr">{l.code}</div></div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(l.code, l.qty - 1)} className="w-5 h-5 rounded border border-lt text-gr">−</button>
                      <span className="text-[12.5px] w-6 text-center">{l.qty}</span>
                      <button onClick={() => setQty(l.code, l.qty + 1)} className="w-5 h-5 rounded border border-pk bg-pk text-white">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Custom requests (optional)">
            {customItems.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 mb-1.5">
                <input value={c.spec} onChange={(e) => setCustomItems((arr) => arr.map((x, j) => (j === i ? { ...x, spec: e.target.value } : x)))} placeholder="Custom item spec" className="col-span-6 px-2 py-1 rounded border border-lt text-[12.5px]" />
                <input value={c.project_no || ''} onChange={(e) => setCustomItems((arr) => arr.map((x, j) => (j === i ? { ...x, project_no: e.target.value } : x)))} placeholder="Project #" className="col-span-3 px-2 py-1 rounded border border-lt text-[12.5px] font-mono" />
                <input type="number" value={c.qty} onChange={(e) => setCustomItems((arr) => arr.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="col-span-2 px-2 py-1 rounded border border-lt text-[12.5px]" />
                <button onClick={() => setCustomItems((arr) => arr.filter((_, j) => j !== i))} className="col-span-1 text-red-600 text-[13px]">×</button>
              </div>
            ))}
            <button onClick={() => setCustomItems((arr) => [...arr, { spec: '', qty: 1, project_no: '' }])} className="text-[11.5px] text-pk font-semibold">+ Add custom line</button>
          </Section>

          <Section title="Handling">
            <div className="flex items-center justify-between mb-2">
              <TempBadge temp={temp} overridden={overridden} />
            </div>
            <Labeled label="Temp override (deprioritized)">
              <select value={header.temp_override} onChange={(e) => set('temp_override', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[12.5px] bg-bg">
                <option value="">— auto from items ({derivedTemp(cartLines.map((l) => ({ code: l.code })), productByCode)}) —</option>
                <option value="Ambient">Ambient</option>
                <option value="Cold">Cold</option>
              </select>
            </Labeled>
            <div className="mt-2">
              <Labeled label="Deliver by"><input type="date" value={header.required_by} onChange={(e) => set('required_by', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[12.5px]" /></Labeled>
            </div>
            <label className={`flex items-start gap-2 mt-2 p-2 rounded-lg border cursor-pointer ${header.rush ? 'border-red-300 bg-red-50' : 'border-lt bg-bg'}`}>
              <input type="checkbox" checked={!!header.rush} onChange={(e) => set('rush', e.target.checked)} className="mt-0.5" />
              <span>
                <span className={`block text-[12.5px] font-bold ${header.rush ? 'text-red-700' : 'text-dk'}`}>Rush order</span>
                <span className="block text-[10.5px] text-gr">{RUSH_NOTICE}</span>
              </span>
            </label>
            <label className={`flex items-start gap-2 mt-2 p-2 rounded-lg border cursor-pointer ${header.third_party_billing ? 'border-pk bg-pink-50' : 'border-lt bg-bg'}`}>
              <input type="checkbox" checked={!!header.third_party_billing} onChange={(e) => set('third_party_billing', e.target.checked)} className="mt-0.5" />
              <span>
                <span className="block text-[12.5px] font-bold text-dk">Bill shipping to a third-party account</span>
                <span className="block text-[10.5px] text-gr">Use the customer&rsquo;s carrier account instead of Dirty Cookie&rsquo;s.</span>
              </span>
            </label>
            {header.third_party_billing && (
              <div className="mt-1.5 p-2 rounded-lg border border-lt bg-bg space-y-1.5">
                <Labeled label="Carrier *">
                  <select value={header.tp_carrier} onChange={(e) => set('tp_carrier', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[12.5px] bg-cd">
                    <option value="">— select —</option>
                    {TP_CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Labeled>
                <div className="grid grid-cols-2 gap-2">
                  <Labeled label="Account number *">
                    <input value={header.tp_account} onChange={(e) => set('tp_account', e.target.value)} placeholder="123456789" className="w-full px-2 py-1 rounded border border-lt text-[12.5px] font-mono" />
                  </Labeled>
                  <Labeled label="Account postal code *">
                    <input value={header.tp_postal_code} onChange={(e) => set('tp_postal_code', e.target.value)} placeholder="90210" className="w-full px-2 py-1 rounded border border-lt text-[12.5px] font-mono" />
                  </Labeled>
                </div>
                <div className="text-[10.5px] text-gr">{TP_NOTICE}</div>
              </div>
            )}
            <div className="text-[10.5px] text-gr mt-2">Shipping service and box are chosen in ShipStation. Cold-chain orders are auto-upgraded to next-day there.</div>
          </Section>

          <Section title="Collateral">
            {COLLATERAL_OPTIONS.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-[12.5px] text-dk py-0.5">
                <input type="checkbox" checked={header.collateral.includes(c)} onChange={() => toggleCollateral(c)} /> {c}
              </label>
            ))}
          </Section>

          <Section title="Notes">
            <textarea value={header.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="w-full px-2 py-1 rounded border border-lt text-[12.5px]" placeholder="First meeting, keep it classic." />
          </Section>
        </div>

        <footer className="px-4 py-3 border-t border-lt shrink-0">
          <button onClick={submit} disabled={!canWrite} className="w-full bg-pk text-white py-2.5 rounded-lg text-[13px] font-bold hover:bg-pm disabled:opacity-50">Submit shipment</button>
          {!canWrite && <div className="text-[11.5px] text-gr text-center mt-1">Your role can view but not submit.</div>}
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
      <div className="text-[12.5px] font-extrabold text-dk mb-2">Quick start</div>

      <div className="text-[10.5px] font-bold uppercase tracking-[.4px] text-gr mb-1.5">Saved assortments</div>
      {data.templates.length === 0 ? (
        <div className="text-[11.5px] text-gr italic">No templates yet — build a cart, then save it below.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {data.templates.map((t) => (
            <span key={t.id} className="inline-flex items-center bg-cd border border-lt rounded-full overflow-hidden">
              <button onClick={() => applyTemplate(t)} title={t.description || ''} className="text-[11.5px] font-semibold px-3 py-1 text-dk hover:text-pk">{t.name}</button>
              {canWrite && <button onClick={async () => { await deleteTemplate(t.id); refresh(); }} className="text-[11.5px] text-gr hover:text-red-600 pr-2.5 pl-0.5" aria-label={`Delete ${t.name}`}>×</button>}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 mt-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Save current cart as…" className="flex-1 px-2 py-1 rounded border border-lt text-[11.5px]" />
        <button onClick={saveCurrent} disabled={!canWrite} className="bg-cd border border-pk text-pk px-3 py-1 rounded text-[11.5px] font-semibold disabled:opacity-50">Save</button>
      </div>

      <div className="text-[10.5px] font-bold uppercase tracking-[.4px] text-gr mt-3 mb-1.5">Duplicate a past shipment</div>
      {recent.length === 0 ? (
        <div className="text-[11.5px] text-gr italic">No past shipments yet.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {recent.map((s) => (
            <button key={s.id} onClick={() => dupShipment(s)} title={`${s.account || ''} · ${s.salesperson?.full_name || ''}`} className="bg-cd border border-lt rounded-full text-[11.5px] font-semibold px-3 py-1 text-dk hover:text-pk hover:border-pk">
              {s.shipment_no}{s.account ? ` · ${s.account}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineAddress({ onSaved, canWrite, setToast }) {
  const [f, setF] = useState({ nickname: '', contact_name: '', company: '', street: '', city: '', state: '', zip: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setSaving(true);
    const { error } = await addAddress(f);
    setSaving(false);
    if (error) { if (setToast) setToast({ err: error.message }); else window.alert(error.message); return; }
    onSaved();
  };
  return (
    <div className="mt-2 bg-bg border border-lt rounded-lg p-2 grid grid-cols-2 gap-1.5">
      {[['nickname', 'Nickname'], ['contact_name', 'Contact'], ['company', 'Company'], ['street', 'Street'], ['city', 'City'], ['state', 'State'], ['zip', 'Zip']].map(([k, l]) => (
        <input key={k} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={l} className="px-2 py-1 rounded border border-lt text-[11.5px]" />
      ))}
      <button onClick={save} disabled={saving || !canWrite} className="col-span-2 bg-pk text-white py-1 rounded text-[11.5px] font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save address'}</button>
    </div>
  );
}

// ── Pending Shipments ───────────────────────────────────────────────────────
// Status is READ-ONLY: it is owned by ShipStation. `submitted` is set at order
// creation; the shipnotify POST advances it to `shipped` when the co-man buys a
// label. Nothing in the app writes it, deliberately — an editable field here
// would let the two systems disagree with no way to reconcile.
function MissionView({ data }) {
  const [sp, setSp] = useState('All');
  const [openId, setOpenId] = useState(null);
  const rows = data.shipments.filter((s) => sp === 'All' || s.salesperson?.id === sp);
  const stat = (st) => data.shipments.filter((s) => s.status === st).length;
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {SHIP_STATUSES.map((s) => (
          <div key={s} className="bg-cd border border-lt rounded-xl p-3">
            <div className="text-[26px] font-extrabold tracking-[-0.5px] text-dk">{stat(s)}</div>
            <div className="text-[11.5px] text-gr uppercase font-semibold tracking-[.4px]">{s}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11.5px] text-gr uppercase">Salesperson</span>
        <select value={sp} onChange={(e) => setSp(e.target.value)} className="px-2 py-1 rounded border border-lt text-[12.5px] bg-cd">
          <option value="All">All</option>
          {data.salespeople.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </div>
      {rows.length === 0 ? (
        <div className="text-[13px] text-gr italic py-8 text-center">No shipments yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <ShipmentCard key={s.id} s={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// Collapsed summary + expandable detail, mirroring the prototype's shipment card.
function ShipmentCard({ s, open, onToggle }) {
  const items = s.sample_shipment_items || [];
  const hasCustom = items.some((i) => i.custom);
  const addr = s.address || {};
  const stIdx = SHIP_STATUSES.indexOf(s.status);
  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden">
      <button onClick={onToggle} aria-expanded={open} className="w-full text-left p-3 hover:bg-pc">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[12.5px] font-bold text-dk">{s.shipment_no}</span>
              <StatusPill s={s.status} />
              <TempBadge temp={s.temp} overridden={!!s.temp_override} />
              {s.rush && <span className="text-[10.5px] font-bold uppercase px-1.5 py-px rounded bg-red-600 text-white">Rush</span>}
              {s.third_party_billing && <span className="text-[10.5px] font-semibold px-1.5 py-px rounded bg-violet-100 text-violet-700">3rd-party billing</span>}
              {hasCustom && <span className="text-[10.5px] font-semibold px-1.5 py-px rounded bg-pink-100 text-pk">Custom</span>}
            </div>
            <div className="text-[12.5px] text-dk mt-1">{s.account || '—'} · {s.salesperson?.full_name || 'Unknown'}</div>
            <div className="text-[11.5px] text-gr truncate">{items.length} line{items.length === 1 ? '' : 's'} · {items.reduce((n, i) => n + (i.qty || 0), 0)} cookies</div>
          </div>
          <span className="text-gr text-[13px] shrink-0">{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-lt px-3 py-3">
          <div className="flex items-center gap-1 mb-3">
            {SHIP_STATUSES.map((p, i) => (
              <div key={p} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${i < stIdx ? 'bg-green-500' : i === stIdx ? 'bg-pk' : 'bg-lt'}`} />
                <span className={`text-[10.5px] ${i === stIdx ? 'font-bold text-dk' : 'text-gr'}`}>{p}</span>
                {i < SHIP_STATUSES.length - 1 && <span className="w-4 h-px bg-lt mx-1" />}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KV label="Ship to">
              {addr.contact_name || '—'}{addr.company ? ` · ${addr.company}` : ''}<br />
              {addr.street}, {addr.city}, {addr.state} {addr.zip}
            </KV>
            <KV label="Deliver by">{s.required_by || '—'}</KV>
            <KV label="Collateral">
              {(s.collateral || []).length ? (s.collateral || []).map((c) => (
                <span key={c} className="inline-block text-[10.5px] font-semibold px-2 py-px rounded bg-bg border border-lt mr-1 mb-1">{c}</span>
              )) : '—'}
            </KV>
            <KV label="Billing">
              {s.third_party_billing
                ? `${s.tp_carrier || '—'} · acct ${s.tp_account || '—'} · ${s.tp_postal_code || '—'}`
                : 'Dirty Cookie account'}
            </KV>
            {s.tracking_number && (
              <KV label="Tracking">
                <span className="font-mono">{s.tracking_number}</span>{s.carrier ? ` · ${s.carrier}` : ''}{s.service ? ` · ${s.service}` : ''}
              </KV>
            )}
            {s.shipped_at && <KV label="Shipped">{new Date(s.shipped_at).toLocaleDateString()}{s.label_created_at ? ` · label ${new Date(s.label_created_at).toLocaleString()}` : ''}</KV>}
            {s.shipping_cost != null && <KV label="Shipping cost">${Number(s.shipping_cost).toFixed(2)}</KV>}
          </div>

          <div className="mt-3">
            <div className="text-[10.5px] text-gr uppercase font-bold tracking-wider mb-1">Samples</div>
            <div className="divide-y divide-bg border border-lt rounded-lg">
              {items.map((i) => (
                <div key={i.id || i.product_code || i.custom_spec} className="flex justify-between items-center px-2 py-1.5">
                  <span className="text-[12.5px] text-dk">
                    {i.custom && <span className="text-[10.5px] font-semibold px-1.5 py-px rounded bg-pink-100 text-pk mr-1">Custom</span>}
                    {i.description || i.product_code || i.custom_spec}
                    {i.project_no ? <span className="text-[10.5px] text-gr"> (proj {i.project_no})</span> : null}
                  </span>
                  <span className="text-[12.5px] font-bold text-dk">×{i.qty}</span>
                </div>
              ))}
            </div>
          </div>

          {s.notes && (
            <div className="mt-3">
              <div className="text-[10.5px] text-gr uppercase font-bold tracking-wider mb-1">Notes</div>
              <div className="text-[12.5px] text-dk">{s.notes}</div>
            </div>
          )}

          <div className="text-[10.5px] text-gr mt-3">
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
      <div className="text-[10.5px] text-gr uppercase font-bold tracking-wider mb-0.5">{label}</div>
      <div className="text-[12.5px] text-dk">{children}</div>
    </div>
  );
}

// ── Address Book ────────────────────────────────────────────────────────────
function AddressView({ data, refresh, canWrite, setToast }) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-pk">Ship-to addresses ({data.addresses.length})</div>
        <button onClick={() => setAdding((v) => !v)} className="text-[11.5px] font-semibold px-2 py-0.5 rounded border border-pk text-pk">{adding ? 'Cancel' : '+ New'}</button>
      </div>
      {adding && <InlineAddress onSaved={() => { setAdding(false); refresh(); }} canWrite={canWrite} setToast={setToast} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
        {data.addresses.map((a) => (
          <div key={a.id} className="bg-cd border border-lt rounded-lg p-3">
            <div className="text-[12.5px] font-bold text-dk">{a.nickname || a.company}</div>
            <div className="text-[11.5px] text-gr">{a.contact_name} · {a.company}</div>
            <div className="text-[11.5px] text-gr">{a.street}, {a.city}, {a.state} {a.zip}</div>
          </div>
        ))}
        {data.addresses.length === 0 && <div className="text-[12.5px] text-gr italic">No addresses yet — add one above or inline while building a shipment.</div>}
      </div>
    </div>
  );
}

// ── small layout helpers ────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="bg-cd border border-lt rounded-xl p-3">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-pk mb-2">{title}</div>
      {children}
    </div>
  );
}
function Labeled({ label, children }) {
  return (
    <div>
      <div className="text-[10.5px] text-gr uppercase mb-0.5">{label}</div>
      {children}
    </div>
  );
}
