import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  useSampleCentral, addAddress, createShipment, updateShipmentStatus, saveTemplate, deleteTemplate,
} from '../hooks/useSampleCentral';
import {
  familyEmoji, flavorFamily, derivedTemp, effectiveTemp, groupCatalog,
  SHIP_STATUSES, COLLATERAL_OPTIONS, BOX_OPTIONS,
  SHIPPING_SPEEDS, DEFAULT_SHIPPING_SPEED, speedLabel, isExpeditedSpeed,
  TEST_MODE, SHIPMENT_PREFIX,
} from '../utils/sampleCentral';

const FILTERS = ['All', 'Stuffed', 'Shot', 'Gourmet', 'Classic'];
const VIEWS = [
  { key: 'shop', label: 'Order Samples' },
  { key: 'builder', label: 'Build Shipment' },
  { key: 'mission', label: 'Mission Control' },
  { key: 'quickstart', label: 'Quick Start' },
  { key: 'address', label: 'Address Book' },
];

const TempBadge = ({ temp, overridden }) => (
  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${temp === 'Cold' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'}`}>
    {temp === 'Cold' ? '❄️ Cold chain' : '🌡 Ambient'}{overridden ? ' · override' : ''}
  </span>
);
const StatusPill = ({ s }) => {
  const map = { submitted: 'bg-gray-100 text-gr', processing: 'bg-blue-100 text-blue-700', shipped: 'bg-violet-100 text-violet-700', delivered: 'bg-green-100 text-green-700' };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[s] || map.submitted}`}>{s}</span>;
};

export default function SampleCentral() {
  const { profile } = useAuth();
  const canWrite = ['admin', 'finance', 'ops', 'cortina'].includes(profile?.role);
  const { data, loading, error, refresh } = useSampleCentral();
  const [view, setView] = useState('shop');
  const [filter, setFilter] = useState('All');
  const [cart, setCart] = useState({}); // code -> qty
  const [customItems, setCustomItems] = useState([]); // [{ spec, qty, project_no }]
  const [header, setHeader] = useState({
    salesperson_user_id: '', account: '', address_id: '', temp_override: '',
    required_by: '', shipping_speed: DEFAULT_SHIPPING_SPEED, box_spec: 'Dirty Cookie', collateral: [], notes: '',
  });
  const [toast, setToast] = useState(null);

  const productByCode = useMemo(() => new Map((data?.catalog || []).map((p) => [p.code, p])), [data]);
  const cartLines = useMemo(
    () => Object.entries(cart).filter(([, q]) => q > 0).map(([code, qty]) => ({ code, qty, product: productByCode.get(code) })),
    [cart, productByCode]
  );
  const cartCount = cartLines.reduce((n, l) => n + l.qty, 0);
  const cartArr = cartLines.map((l) => ({ code: l.code }));
  const temp = effectiveTemp(header.temp_override, cartArr, productByCode);

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading Sample Central…</div>;
  if (error)
    return (
      <div className="text-sm text-red-600 py-6">
        {error}
        <div className="text-[11px] text-gr mt-1">If tables are missing, apply the Phase-2 migrations first (sample_central_tables, user_active_in_dropdown).</div>
      </div>
    );

  const setQty = (code, qty) => setCart((c) => ({ ...c, [code]: Math.max(0, qty) }));
  const addToCart = (code) => setQty(code, (cart[code] || 0) + 1);

  const resetBuild = () => {
    setCart({});
    setCustomItems([]);
    setHeader({ salesperson_user_id: '', account: '', address_id: '', temp_override: '', required_by: '', shipping_speed: DEFAULT_SHIPPING_SPEED, box_spec: 'Dirty Cookie', collateral: [], notes: '' });
  };

  const submit = async () => {
    if (!header.salesperson_user_id) return setToast({ err: 'Pick a salesperson first.' });
    if (!header.address_id) return setToast({ err: 'Pick a ship-to address.' });
    if (cartLines.length === 0 && customItems.length === 0) return setToast({ err: 'Add at least one cookie or custom line.' });
    const items = [
      ...cartLines.map((l) => ({ product_code: l.code, custom: false, qty: l.qty, description: l.product?.description || l.code })),
      ...customItems.filter((c) => c.spec).map((c) => ({ product_code: null, custom: true, custom_spec: c.spec, project_no: c.project_no || null, qty: Number(c.qty) || 1, description: c.spec })),
    ];
    const h = {
      salesperson_user_id: header.salesperson_user_id, account: header.account || null, address_id: header.address_id,
      temp, temp_override: header.temp_override || null, required_by: header.required_by || null, shipping_speed: header.shipping_speed,
      box_spec: header.box_spec, collateral: header.collateral, notes: header.notes || null, status: 'submitted',
    };
    const { error: e, shipment } = await createShipment(h, items, data.shipments);
    if (e) return setToast({ err: e.message });
    resetBuild();
    await refresh();
    setToast({ ok: `Shipment ${shipment.shipment_no} submitted.` });
    setView('mission');
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h1 className="text-xl font-bold text-dk">Sample Central</h1>
          <div className="text-[11px] text-gr">Cortina sample ordering — catalog, shipment builder, and mission control.</div>
          {TEST_MODE && (
            <div className="mt-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
              🧪 TEST MODE — orders are numbered {SHIPMENT_PREFIX}#### and still reach ShipStation
            </div>
          )}
        </div>
        <button onClick={() => setView('builder')} className="relative text-[11px] font-semibold px-3 py-1.5 rounded border border-pk bg-pk text-white hover:bg-pm">
          🛒 Cart · {cartCount}
        </button>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} className={['px-3 py-1.5 rounded-md text-[11px] font-semibold border', view === v.key ? 'border-pk bg-pink-50 text-pk' : 'border-lt bg-cd text-gr hover:text-pk'].join(' ')}>
            {v.label}
          </button>
        ))}
      </div>

      {toast && (
        <div className={`mb-3 text-[11px] px-3 py-2 rounded border ${toast.err ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`} onClick={() => setToast(null)}>
          {toast.err || toast.ok} <span className="text-gr">(click to dismiss)</span>
        </div>
      )}

      {view === 'shop' && <CatalogView data={data} filter={filter} setFilter={setFilter} cart={cart} setQty={setQty} addToCart={addToCart} canWrite={canWrite} />}
      {view === 'builder' && (
        <BuilderView
          data={data} cartLines={cartLines} setQty={setQty} customItems={customItems} setCustomItems={setCustomItems}
          header={header} setHeader={setHeader} temp={temp} onAddAddress={refresh} submit={submit} canWrite={canWrite}
          productByCode={productByCode}
        />
      )}
      {view === 'mission' && <MissionView data={data} refresh={refresh} canWrite={canWrite} setToast={setToast} />}
      {view === 'quickstart' && <QuickStartView data={data} cart={cart} setCart={setCart} setView={setView} profile={profile} refresh={refresh} setToast={setToast} canWrite={canWrite} />}
      {view === 'address' && <AddressView data={data} refresh={refresh} canWrite={canWrite} setToast={setToast} />}
    </div>
  );
}

// ── Catalog (Prep → Tier → Size) ────────────────────────────────────────────
function CatalogView({ data, filter, setFilter, cart, setQty, addToCart }) {
  const items = data.catalog.filter((c) => {
    if (filter === 'All') return true;
    if (filter === 'Stuffed' || filter === 'Shot') return c.form === filter;
    return c.tier === filter;
  });
  const groups = groupCatalog(items);
  return (
    <div>
      <div className="text-[11px] text-gr mb-3">Organized by prep state → tier → size — the order that drives how a sample shipment is pulled and handled. UOM: <b>1 cookie · EA</b>.</div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${filter === f ? 'border-pk bg-pk text-white' : 'border-lt bg-cd text-gr hover:text-pk'}`}>{f}</button>
        ))}
      </div>
      {items.length === 0 && <div className="text-[12px] text-gr italic py-8 text-center">No sample-eligible cookies match this filter.</div>}
      {groups.map((g) => (
        <div key={g.prep} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${g.prep === 'Raw' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'}`}>{g.prep}</span>
            <span className="text-[10px] text-gr">{g.count} cookie{g.count > 1 ? 's' : ''} · {g.storage}</span>
          </div>
          {g.tiers.map((t) => (
            <div key={t.tier} className="mb-3 bg-cd border border-lt rounded-xl overflow-hidden">
              <div className="px-3 py-1.5 bg-pc flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${t.tier === 'Gourmet' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'}`}>{t.tier}</span>
                <span className="text-[10px] font-semibold text-dk">{t.tier} cookies</span>
                <span className="text-[10px] text-gr">{t.items.length} option{t.items.length > 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-bg">
                {t.items.map((p) => (
                  <div key={p.code} className="flex items-center gap-3 px-3 py-2">
                    <div className="text-lg">{familyEmoji(p.form)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-dk truncate">{flavorFamily(p)}</div>
                      <div className="text-[10px] text-gr truncate">{p.description} · <span className="font-mono">{p.code}</span></div>
                    </div>
                    <div className="text-[10px] text-gr whitespace-nowrap">{p.dough_oz}oz · 1 cookie · EA</div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(p.code, (cart[p.code] || 0) - 1)} className="w-6 h-6 rounded border border-lt text-gr hover:text-pk">−</button>
                      <input value={cart[p.code] || 0} onChange={(e) => setQty(p.code, parseInt(e.target.value, 10) || 0)} className="w-10 text-center border border-lt rounded text-[11px] py-0.5" />
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

// ── Shipment Builder ────────────────────────────────────────────────────────
function BuilderView({ data, cartLines, setQty, customItems, setCustomItems, header, setHeader, temp, onAddAddress, submit, canWrite, productByCode }) {
  const [showAddr, setShowAddr] = useState(false);
  const set = (k, v) => setHeader((h) => ({ ...h, [k]: v }));
  const toggleCollateral = (c) => setHeader((h) => ({ ...h, collateral: h.collateral.includes(c) ? h.collateral.filter((x) => x !== c) : [...h.collateral, c] }));
  const overridden = !!header.temp_override && header.temp_override !== derivedTemp(cartLines.map((l) => ({ code: l.code })), productByCode);
  const addr = data.addresses.find((a) => a.id === header.address_id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Section title="1 · Who & where">
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="Salesperson *">
              <select value={header.salesperson_user_id} onChange={(e) => set('salesperson_user_id', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[11px] bg-bg">
                <option value="">— select —</option>
                {data.salespeople.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>)}
              </select>
            </Labeled>
            <Labeled label="Account">
              <input value={header.account} onChange={(e) => set('account', e.target.value)} placeholder="Whole Foods Market" className="w-full px-2 py-1 rounded border border-lt text-[11px]" />
            </Labeled>
          </div>
          <div className="mt-2">
            <div className="flex justify-between items-center mb-0.5">
              <div className="text-[8px] text-gr uppercase">Ship-to address *</div>
              <button onClick={() => setShowAddr((v) => !v)} className="text-[10px] text-pk font-semibold">{showAddr ? 'Cancel' : '+ New address'}</button>
            </div>
            <select value={header.address_id} onChange={(e) => set('address_id', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[11px] bg-bg">
              <option value="">— select —</option>
              {data.addresses.map((a) => <option key={a.id} value={a.id}>{a.nickname || a.company} — {a.city}, {a.state}</option>)}
            </select>
            {addr && <div className="text-[10px] text-gr mt-1">{addr.contact_name} · {addr.company} · {addr.street}, {addr.city}, {addr.state} {addr.zip}</div>}
            {showAddr && <InlineAddress onSaved={() => { setShowAddr(false); onAddAddress(); }} canWrite={canWrite} />}
          </div>
        </Section>

        <Section title="2 · Cookies">
          {cartLines.length === 0 ? (
            <div className="text-[11px] text-gr italic">Cart is empty — add cookies from <b>Order Samples</b>.</div>
          ) : (
            <div className="divide-y divide-bg">
              {cartLines.map((l) => (
                <div key={l.code} className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 min-w-0"><div className="text-[11px] font-semibold text-dk truncate">{l.product?.description || l.code}</div><div className="text-[9px] font-mono text-gr">{l.code}</div></div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.code, l.qty - 1)} className="w-5 h-5 rounded border border-lt text-gr">−</button>
                    <span className="text-[11px] w-6 text-center">{l.qty}</span>
                    <button onClick={() => setQty(l.code, l.qty + 1)} className="w-5 h-5 rounded border border-pk bg-pk text-white">+</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="3 · Custom requests (optional)">
          {customItems.map((c, i) => (
            <div key={i} className="grid grid-cols-12 gap-1.5 mb-1.5">
              <input value={c.spec} onChange={(e) => setCustomItems((arr) => arr.map((x, j) => (j === i ? { ...x, spec: e.target.value } : x)))} placeholder="Custom item spec" className="col-span-6 px-2 py-1 rounded border border-lt text-[11px]" />
              <input value={c.project_no || ''} onChange={(e) => setCustomItems((arr) => arr.map((x, j) => (j === i ? { ...x, project_no: e.target.value } : x)))} placeholder="Project #" className="col-span-3 px-2 py-1 rounded border border-lt text-[11px] font-mono" />
              <input type="number" value={c.qty} onChange={(e) => setCustomItems((arr) => arr.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="col-span-2 px-2 py-1 rounded border border-lt text-[11px]" />
              <button onClick={() => setCustomItems((arr) => arr.filter((_, j) => j !== i))} className="col-span-1 text-red-600 text-[12px]">×</button>
            </div>
          ))}
          <button onClick={() => setCustomItems((arr) => [...arr, { spec: '', qty: 1, project_no: '' }])} className="text-[10px] text-pk font-semibold">+ Add custom line</button>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Handling">
          <div className="flex items-center justify-between mb-2">
            <TempBadge temp={temp} overridden={overridden} />
          </div>
          <Labeled label="Temp override (deprioritized)">
            <select value={header.temp_override} onChange={(e) => set('temp_override', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[11px] bg-bg">
              <option value="">— auto from items ({derivedTemp(cartLines.map((l) => ({ code: l.code })), productByCode)}) —</option>
              <option value="Ambient">Ambient</option>
              <option value="Cold">Cold</option>
            </select>
          </Labeled>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Labeled label="Required by"><input type="date" value={header.required_by} onChange={(e) => set('required_by', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[11px]" /></Labeled>
            <Labeled label="Shipping speed">
              <select value={header.shipping_speed} onChange={(e) => set('shipping_speed', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[11px] bg-bg">
                {SHIPPING_SPEEDS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Labeled>
          </div>
          <div className="text-[9px] text-gr mt-1">Carrier is set in ShipStation, not here. Cold-chain orders are auto-upgraded to next-day.</div>
          <Labeled label="Box spec (intent)">
            <select value={header.box_spec} onChange={(e) => set('box_spec', e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[11px] bg-bg mt-1">
              {BOX_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Labeled>
        </Section>

        <Section title="Collateral">
          {COLLATERAL_OPTIONS.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-[11px] text-dk py-0.5">
              <input type="checkbox" checked={header.collateral.includes(c)} onChange={() => toggleCollateral(c)} /> {c}
            </label>
          ))}
        </Section>

        <Section title="Notes">
          <textarea value={header.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="w-full px-2 py-1 rounded border border-lt text-[11px]" placeholder="First meeting, keep it classic." />
        </Section>

        <button onClick={submit} disabled={!canWrite} className="w-full bg-pk text-white py-2 rounded-lg text-[12px] font-bold hover:bg-pm disabled:opacity-50">Submit shipment</button>
        {!canWrite && <div className="text-[10px] text-gr text-center">Your role can view but not submit.</div>}
      </div>
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
        <input key={k} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={l} className="px-2 py-1 rounded border border-lt text-[10px]" />
      ))}
      <button onClick={save} disabled={saving || !canWrite} className="col-span-2 bg-pk text-white py-1 rounded text-[10px] font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save address'}</button>
    </div>
  );
}

// ── Mission Control ─────────────────────────────────────────────────────────
function MissionView({ data, refresh, canWrite, setToast }) {
  const [sp, setSp] = useState('All');
  const rows = data.shipments.filter((s) => sp === 'All' || s.salesperson?.id === sp);
  const stat = (st) => data.shipments.filter((s) => s.status === st).length;
  const setStatus = async (id, status) => {
    const { error } = await updateShipmentStatus(id, status);
    if (error) setToast({ err: error.message });
    else refresh();
  };
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {SHIP_STATUSES.map((s) => (
          <div key={s} className="bg-cd border border-lt rounded-xl p-3">
            <div className="text-2xl font-black text-dk">{stat(s)}</div>
            <div className="text-[10px] text-gr uppercase">{s}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-gr uppercase">Salesperson</span>
        <select value={sp} onChange={(e) => setSp(e.target.value)} className="px-2 py-1 rounded border border-lt text-[11px] bg-cd">
          <option value="All">All</option>
          {data.salespeople.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] text-gr italic py-8 text-center">No shipments yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => {
            const items = s.sample_shipment_items || [];
            const hasCustom = items.some((i) => i.custom);
            return (
              <div key={s.id} className="bg-cd border border-lt rounded-xl p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-dk">{s.shipment_no}</span>
                      <StatusPill s={s.status} />
                      <TempBadge temp={s.temp} overridden={!!s.temp_override} />
                      <span className={`text-[9px] uppercase ${isExpeditedSpeed(s.shipping_speed) ? 'font-bold text-red-600' : 'font-semibold text-gr'}`}>{speedLabel(s.shipping_speed)}</span>
                      {hasCustom && <span className="text-[9px] font-semibold px-1.5 py-px rounded bg-pink-100 text-pk">Custom</span>}
                    </div>
                    <div className="text-[11px] text-dk mt-1">{s.account || '—'} · {s.salesperson?.full_name || 'Unknown'}</div>
                    <div className="text-[10px] text-gr">
                      {items.map((i) => `${i.qty}× ${i.description || i.product_code || i.custom_spec}${i.project_no ? ` (proj ${i.project_no})` : ''}`).join(' · ')}
                    </div>
                    {s.required_by && <div className="text-[9px] text-gr mt-0.5">Required by {s.required_by}</div>}
                  </div>
                  <select value={s.status} onChange={(e) => setStatus(s.id, e.target.value)} disabled={!canWrite} className="px-2 py-1 rounded border border-lt text-[10px] bg-bg disabled:opacity-50">
                    {SHIP_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Quick Start (templates + duplicate past shipment) ───────────────────────
function QuickStartView({ data, cart, setCart, setView, profile, refresh, setToast, canWrite }) {
  const [name, setName] = useState('');
  const [dupSp, setDupSp] = useState(profile?.id || 'All');
  const loadTemplate = (items) => {
    const next = { ...cart };
    (items || []).forEach((it) => { next[it.product_code || it.code] = (next[it.product_code || it.code] || 0) + (it.qty || 1); });
    setCart(next);
    setView('shop');
    setToast({ ok: 'Template added to cart.' });
  };
  const dupShipment = (s) => {
    const next = { ...cart };
    (s.sample_shipment_items || []).filter((i) => i.product_code).forEach((i) => { next[i.product_code] = (next[i.product_code] || 0) + i.qty; });
    setCart(next);
    setView('builder');
    setToast({ ok: `Duplicated ${s.shipment_no} into cart.` });
  };
  const saveCurrent = async () => {
    const items = Object.entries(cart).filter(([, q]) => q > 0).map(([product_code, qty]) => ({ product_code, qty }));
    if (!name || items.length === 0) return setToast({ err: 'Name the template and add cookies to the cart first.' });
    const { error } = await saveTemplate({ name, description: `${items.length} items`, owner_user_id: profile?.id || null, items });
    if (error) return setToast({ err: error.message });
    setName('');
    refresh();
    setToast({ ok: 'Template saved.' });
  };
  const dupList = data.shipments.filter((s) => dupSp === 'All' || s.salesperson?.id === dupSp);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section title="Saved assortments">
        {data.templates.length === 0 && <div className="text-[11px] text-gr italic">No templates yet.</div>}
        <div className="space-y-2">
          {data.templates.map((t) => (
            <div key={t.id} className="border border-lt rounded-lg p-2 flex justify-between items-center">
              <div><div className="text-[11px] font-semibold text-dk">{t.name}</div><div className="text-[10px] text-gr">{t.description}</div></div>
              <div className="flex gap-1">
                <button onClick={() => loadTemplate(t.items)} className="text-[10px] px-2 py-0.5 rounded border border-pk text-pk">Add to cart</button>
                {canWrite && <button onClick={async () => { await deleteTemplate(t.id); refresh(); }} className="text-[10px] px-2 py-0.5 rounded border border-lt text-red-600">Del</button>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-lt">
          <div className="text-[10px] text-gr mb-1">Save the current cart as a template:</div>
          <div className="flex gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="flex-1 px-2 py-1 rounded border border-lt text-[11px]" />
            <button onClick={saveCurrent} disabled={!canWrite} className="bg-pk text-white px-3 py-1 rounded text-[10px] font-semibold disabled:opacity-50">Save</button>
          </div>
        </div>
      </Section>

      <Section title="Duplicate a past shipment">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-gr uppercase">Salesperson</span>
          <select value={dupSp} onChange={(e) => setDupSp(e.target.value)} className="px-2 py-1 rounded border border-lt text-[11px] bg-bg">
            <option value="All">All</option>
            {data.salespeople.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        {dupList.length === 0 ? <div className="text-[11px] text-gr italic">No past shipments.</div> : (
          <div className="space-y-1.5">
            {dupList.map((s) => (
              <div key={s.id} className="border border-lt rounded-lg p-2 flex justify-between items-center">
                <div><div className="text-[11px] font-semibold text-dk">{s.shipment_no} · {s.account}</div><div className="text-[10px] text-gr">{(s.sample_shipment_items || []).filter((i) => i.product_code).length} cookie lines · {s.salesperson?.full_name}</div></div>
                <button onClick={() => dupShipment(s)} className="text-[10px] px-2 py-0.5 rounded border border-pk text-pk">Duplicate</button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Address Book ────────────────────────────────────────────────────────────
function AddressView({ data, refresh, canWrite, setToast }) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="text-[8px] font-bold uppercase tracking-wider text-pk">Ship-to addresses ({data.addresses.length})</div>
        <button onClick={() => setAdding((v) => !v)} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-pk text-pk">{adding ? 'Cancel' : '+ New'}</button>
      </div>
      {adding && <InlineAddress onSaved={() => { setAdding(false); refresh(); }} canWrite={canWrite} setToast={setToast} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        {data.addresses.map((a) => (
          <div key={a.id} className="bg-cd border border-lt rounded-lg p-3">
            <div className="text-[11px] font-bold text-dk">{a.nickname || a.company}</div>
            <div className="text-[10px] text-gr">{a.contact_name} · {a.company}</div>
            <div className="text-[10px] text-gr">{a.street}, {a.city}, {a.state} {a.zip}</div>
          </div>
        ))}
        {data.addresses.length === 0 && <div className="text-[11px] text-gr italic">No addresses yet — add one above or inline while building a shipment.</div>}
      </div>
    </div>
  );
}

// ── small layout helpers ────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="bg-cd border border-lt rounded-xl p-3">
      <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-2">{title}</div>
      {children}
    </div>
  );
}
function Labeled({ label, children }) {
  return (
    <div>
      <div className="text-[8px] text-gr uppercase mb-0.5">{label}</div>
      {children}
    </div>
  );
}
