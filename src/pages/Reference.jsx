import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Pill from '../components/Pill';
import { ITEM_MASTER, ITEM_STATUS } from '../data/itemMaster';
import RawMaterialsReference from '../components/RawMaterialsReference';
import { useTransitions, toggleChecklistItem, createTransition } from '../hooks/useTransitions';
import { formatDate } from '../utils/dates';

// Reference master data. Products (built Day 6.3) is driven by the Walmart
// item master parsed from the weekly sales report. Raw Materials (6.4)
// surfaces the distributor/brand × FIFO × usage × order-history view that
// Marc deep-links into from Inventory > Warehouse. Transitions (6.5)
// remains a placeholder until built.

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';
const THC = TH + ' text-center';

const usd = (n, dp = 2) => (n == null ? '--' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const pct = (n) => (n == null ? '--' : (n <= 1 ? n * 100 : n).toFixed(2) + '%');
const qty = (n) => (n == null ? '--' : Number(n).toLocaleString());

// ── Products (Walmart item master) — unchanged from prior build (6.3)
function Field({ label, value, mono }) {
  return (
    <div className="bg-bg border border-lt rounded-lg px-2.5 py-1.5">
      <div className="text-[8px] font-semibold uppercase text-gr">{label}</div>
      <div className={`text-[11px] font-bold text-dk mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
function Group({ title, children }) {
  return (
    <div>
      <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-1.5">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">{children}</div>
    </div>
  );
}
function ProductDetail({ p, onBack }) {
  return (
    <div className="bg-cd border border-lt rounded-xl p-4 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-lg font-black text-dk">{p.desc}</div>
          <div className="text-[9px] font-mono text-gr mt-0.5">{p.sku}</div>
          <div className="flex gap-1.5 mt-1.5 items-center flex-wrap">
            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700">
              {ITEM_STATUS[p.status] || p.status}
            </span>
            <span className="text-[9px] text-md">{p.brand} · {p.size}</span>
          </div>
        </div>
        <button onClick={onBack} className="bg-bg border border-lt rounded-md px-3 py-1.5 text-[10px] font-semibold text-md hover:text-pk">Back</button>
      </div>
      <Group title="Pricing & margin">
        <Field label="Unit Cost" value={usd(p.unitCost)} />
        <Field label="Base Retail" value={usd(p.retail)} />
        <Field label="Gross Margin" value={pct(p.grossMarginPct)} />
        <Field label="Vendor Pack Cost" value={usd(p.vendorPackCost)} />
      </Group>
      <Group title="Pack / case">
        <Field label="Vendor Pack Qty" value={qty(p.vendorPackQty)} />
        <Field label="Warehouse Pack Qty" value={qty(p.warehousePackQty)} />
      </Group>
      <Group title="Identifiers">
        <Field label="Prime Item #" value={p.sku} mono />
        <Field label="Vendor Stock ID" value={p.vendorStockId} mono />
        <Field label="UPC" value={p.upc} mono />
        <Field label="Consumer ID" value={p.consumerId} mono />
      </Group>
      <Group title="Vendor & buyer">
        <Field label="Vendor" value={`${p.vendorName} (#${p.vendorNumber})`} />
        <Field label="Buyer" value={p.buyer} />
      </Group>
      <Group title="Merchandising hierarchy">
        <Field label="Department" value={`${p.deptNumber} · ${p.department}`} />
        <Field label="Category" value={p.category} />
        <Field label="Subcategory" value={p.subcategory} />
        <Field label="Fineline" value={`${p.fineline} (#${p.finelineNumber})`} />
      </Group>
      <Group title="Dimensions (each)">
        <Field label="W × L × H (in)" value={`${p.width} × ${p.length} × ${p.height}`} />
        <Field label="Weight (lb)" value={qty(p.weight)} />
        <Field label="Cube (cu ft)" value={qty(p.cube)} />
      </Group>
      <Group title="Current Walmart position">
        <Field label="Traited Stores" value={qty(p.traitedStores)} />
        <Field label="Instock %" value={pct(p.instock)} />
        <Field label="Store On-Hand" value={qty(p.storeOnHand)} />
        <Field label="In Transit" value={qty(p.storeInTransit)} />
        <Field label="In Warehouse" value={qty(p.storeInWarehouse)} />
        <Field label="On Order" value={qty(p.storeOnOrder)} />
      </Group>
      <div className="text-[8px] text-gr italic">
        Walmart item master — parsed from the WK16 sales report (Item Data sheet).
      </div>
    </div>
  );
}
function ProductsView() {
  const [sel, setSel] = useState(null);
  const product = ITEM_MASTER.find((p) => p.sku === sel);
  if (product) return <ProductDetail p={product} onBack={() => setSel(null)} />;
  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden">
      <div className="px-3 py-2 text-[8px] font-semibold uppercase text-gr border-b border-lt">
        Finished goods · click a product for the full item master
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-pc">
            <th className={TH}>SKU</th>
            <th className={TH}>Product</th>
            <th className={TH}>Brand</th>
            <th className={THR}>Cost</th>
            <th className={THR}>Retail</th>
            <th className={THR}>Margin</th>
            <th className={THR}>Instock</th>
            <th className={THR}>Store OH</th>
          </tr>
        </thead>
        <tbody>
          {ITEM_MASTER.map((p) => (
            <tr key={p.sku} onClick={() => setSel(p.sku)} className="border-b border-bg cursor-pointer hover:bg-pc">
              <td className="px-3 py-2 font-mono text-[9px] text-gr">{p.sku}</td>
              <td className="px-3 py-2 font-semibold text-dk">{p.desc}</td>
              <td className="px-3 py-2 text-md">{p.brand}</td>
              <td className="px-3 py-2 text-right text-md">{usd(p.unitCost)}</td>
              <td className="px-3 py-2 text-right text-md">{usd(p.retail)}</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-700">{pct(p.grossMarginPct)}</td>
              <td className="px-3 py-2 text-right text-md">{pct(p.instock)}</td>
              <td className="px-3 py-2 text-right font-semibold text-dk">{qty(p.storeOnHand)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Transitions — Day 6.5 ──────────────────────────────────────────────

function TransitionCard({ tr, onToggle }) {
  const checklist = Array.isArray(tr.checklist) ? tr.checklist : [];
  const done = checklist.filter((c) => c.done).length;
  return (
    <div className="bg-bg border border-lt rounded-lg p-3 mb-2">
      <div className="flex justify-between items-start mb-1.5">
        <div>
          <div className="flex gap-1.5 items-center mb-1">
            <span className="text-[9px] font-bold font-mono text-gr">{tr.transition_id}</span>
            <Pill status={tr.status} />
            <span className="text-[8px] text-gr">{tr.transition_type?.replace('_', ' ') || ''}</span>
          </div>
          <div className="text-sm font-extrabold">
            <span className="text-gr line-through">{tr.from_name || tr.from_sku || '—'}</span>{' '}
            <span className="text-lt">→</span> {tr.to_name || tr.to_sku || '—'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[7px] text-gr uppercase">Launch</div>
          <div className="text-xs font-bold text-pk">{formatDate(tr.launch_date)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div className="bg-cd border border-lt rounded p-2">
          <div className="text-[7px] text-gr uppercase">Cutoff</div>
          <div className="text-[11px] font-bold mt-0.5">{formatDate(tr.cutoff_date)}</div>
        </div>
        <div className="bg-cd border border-pk/20 rounded p-2">
          <div className="text-[7px] text-pk uppercase">Launch</div>
          <div className="text-[11px] font-bold mt-0.5">{formatDate(tr.launch_date)}</div>
        </div>
      </div>

      {tr.notes && <div className="text-[10px] text-md mb-2">{tr.notes}</div>}

      <div className="flex justify-between items-center mb-1.5">
        <div className="text-[7px] font-bold uppercase text-pk">Checklist</div>
        <div className="text-[8px] text-gr">
          {done} / {checklist.length} done
        </div>
      </div>
      {checklist.length === 0 ? (
        <div className="text-[10px] text-gr italic">No tasks.</div>
      ) : (
        <div>
          {checklist.map((c, i) => (
            <button
              key={i}
              onClick={() => onToggle(tr.id, i)}
              className={`flex items-center gap-1.5 w-full text-left py-0.5 text-[10px] ${
                c.done ? 'text-gr line-through' : 'text-dk'
              }`}
            >
              <span className="font-mono">{c.done ? '[x]' : '[ ]'}</span>
              <span>{c.task}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTransitionForm({ onClose, onSaved }) {
  const [tid, setTid] = useState('');
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [fromSku, setFromSku] = useState('');
  const [toSku, setToSku] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [launch, setLaunch] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState('spec_change');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!tid || !fromName || !toName) {
      setErr('Transition ID + From + To are required.');
      return;
    }
    setSaving(true);
    const { error } = await createTransition({
      transition_id: tid,
      from_sku: fromSku,
      to_sku: toSku,
      from_name: fromName,
      to_name: toName,
      transition_type: type,
      cutoff_date: cutoff,
      launch_date: launch,
      notes,
    });
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <div className="bg-bg border border-lt rounded-lg p-3 mb-3">
      <div className="grid grid-cols-3 gap-1.5 mb-1.5">
        <div>
          <div className="text-[7px] text-gr mb-0.5">Transition ID</div>
          <input value={tid} onChange={(e) => setTid(e.target.value)} placeholder="TR-002" className="w-full px-2 py-1 rounded border border-lt text-[10px]" />
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">Type</div>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[10px]">
            <option value="spec_change">spec_change</option>
            <option value="new_product">new_product</option>
            <option value="discontinuation">discontinuation</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <div>
          <div className="text-[7px] text-gr mb-0.5">From name</div>
          <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="WCCB 12ct" className="w-full px-2 py-1 rounded border border-lt text-[10px]" />
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">To name</div>
          <input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="WCCB 8ct" className="w-full px-2 py-1 rounded border border-lt text-[10px]" />
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">From SKU</div>
          <input value={fromSku} onChange={(e) => setFromSku(e.target.value)} placeholder="optional" className="w-full px-2 py-1 rounded border border-lt text-[10px] font-mono" />
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">To SKU</div>
          <input value={toSku} onChange={(e) => setToSku(e.target.value)} placeholder="optional" className="w-full px-2 py-1 rounded border border-lt text-[10px] font-mono" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <div>
          <div className="text-[7px] text-gr mb-0.5">Cutoff date</div>
          <input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[10px]" />
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">Launch date</div>
          <input type="date" value={launch} onChange={(e) => setLaunch(e.target.value)} className="w-full px-2 py-1 rounded border border-lt text-[10px]" />
        </div>
      </div>
      <div className="mb-2">
        <div className="text-[7px] text-gr mb-0.5">Notes</div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="12 CU to 8 per case. New UPC." className="w-full px-2 py-1 rounded border border-lt text-[10px]" />
      </div>
      {err && <div className="text-[10px] text-red-600 mb-1.5">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="bg-pk text-white px-3 py-1 rounded text-[10px] font-semibold hover:bg-pm disabled:opacity-50">
          {saving ? 'Saving…' : 'Create Transition'}
        </button>
        <button onClick={onClose} className="text-[10px] text-gr hover:text-pk">Cancel</button>
      </div>
      <div className="mt-1.5 text-[7px] text-gr italic">
        Standard 6-step checklist is added automatically (UPC, NetSuite, packaging, Assemblers, DOT, depletion plan).
      </div>
    </div>
  );
}

function TransitionsView() {
  const { rows, loading, error, refresh } = useTransitions();
  const [adding, setAdding] = useState(false);

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;

  const onToggle = async (id, idx) => {
    const { error } = await toggleChecklistItem(id, idx);
    if (!error) refresh();
  };

  return (
    <div className="bg-cd border border-lt rounded-xl p-4">
      <div className="flex justify-between items-center mb-2">
        <div className="text-[8px] font-bold uppercase tracking-wider text-pk">
          Product transitions ({rows.length})
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${
            adding ? 'bg-pk text-white border-pk' : 'bg-bg border-lt text-pk hover:bg-pc'
          }`}
        >
          {adding ? 'Cancel' : '+ New'}
        </button>
      </div>

      {adding && (
        <NewTransitionForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {rows.length === 0 ? (
        <div className="text-[11px] text-gr italic py-6 text-center">
          No transitions yet — use "+ New" to start the next changeover (e.g. WCCB 12ct → 8ct).
        </div>
      ) : (
        rows.map((tr) => <TransitionCard key={tr.id} tr={tr} onToggle={onToggle} />)
      )}
    </div>
  );
}

const VIEWS = [
  { key: 'products', label: 'Finished Goods' },
  { key: 'raw', label: 'Raw Materials' },
  { key: 'transitions', label: 'Transitions' },
];

export default function Reference() {
  const [params] = useSearchParams();
  const material = params.get('material'); // deep-link from Inventory > Warehouse
  const [view, setView] = useState(material ? 'raw' : 'products');

  return (
    <div>
      <h1 className="text-xl font-bold text-dk mb-3">Reference</h1>

      <div className="flex gap-1.5 mb-3">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={[
              'px-3 py-1.5 rounded-md text-[11px] font-semibold border',
              view === v.key ? 'border-pk bg-pink-50 text-pk' : 'border-lt bg-cd text-gr hover:text-pk',
            ].join(' ')}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'products' && <ProductsView />}
      {view === 'raw' && <RawMaterialsReference />}
      {view === 'transitions' && <TransitionsView />}
    </div>
  );
}
