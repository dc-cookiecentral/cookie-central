import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Pill from '../components/Pill';
import { ITEM_MASTER, ITEM_STATUS } from '../data/itemMaster';
import { useRawMaterials } from '../hooks/useRawMaterials';
import {
  useRawMaterialDetail,
  addDistributor,
  addManualOrder,
} from '../hooks/useRawMaterialDetail';
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

// ── Raw Materials — Day 6.4 ────────────────────────────────────────────

function MaterialsList({ onSelect }) {
  const { materials, loading, error } = useRawMaterials();
  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!materials.length) {
    return (
      <div className="bg-cd border border-lt rounded-xl p-8 text-center">
        <div className="text-sm font-semibold text-dk mb-1">No raw materials yet</div>
        <div className="text-xs text-md">
          Materials populate from the Assemblers Inventory upload.
        </div>
      </div>
    );
  }
  return (
    <div className="bg-cd border border-lt rounded-xl overflow-hidden">
      <div className="px-3 py-2 text-[8px] font-semibold uppercase text-pk border-b border-lt">
        Raw materials master · click for distributor detail
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-pc">
            <th className={TH}>Code</th>
            <th className={TH}>Ingredient</th>
            <th className={THR}>Qty</th>
            <th className={THR}>Lead</th>
            <th className={TH}>Distributors</th>
            <th className={THC}>Flag</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const dists = (m.raw_material_suppliers ?? [])
              .filter((s) => s.is_active !== false)
              .map((s) => s.distributor)
              .filter(Boolean);
            const distText = [...new Set(dists)].join(', ') || '--';
            return (
              <tr
                key={m.code}
                onClick={() => onSelect(m.code)}
                className="border-b border-bg cursor-pointer hover:bg-pc"
              >
                <td className="px-3 py-2 font-mono text-[9px] text-gr">{m.code}</td>
                <td className="px-3 py-2 font-semibold">{m.name}</td>
                <td className="px-3 py-2 text-right font-bold">
                  {qty(m.quantity)}
                  <span className="text-[9px] text-gr ml-1">{m.unit}</span>
                </td>
                <td className={`px-3 py-2 text-right ${m.default_lead_days >= 21 ? 'text-amber-700' : 'text-gr'}`}>
                  {m.default_lead_days}d
                </td>
                <td className="px-3 py-2 text-[10px] text-md">{distText}</td>
                <td className="px-3 py-2 text-center">
                  <Pill status={m.expiry_status || 'good'} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AddDistributorForm({ materialId, unit, onClose, onSaved }) {
  const [distributor, setDist] = useState('St Charles');
  const [brand, setBrand] = useState('');
  const [cost, setCost] = useState('');
  const [moq, setMoq] = useState('');
  const [lead, setLead] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!brand) {
      setErr('Brand is required.');
      return;
    }
    setSaving(true);
    const { error } = await addDistributor(materialId, {
      distributor,
      brand,
      cost_per_unit: Number(cost) || 0,
      moq: Number(moq) || 0,
      lead_time_days: Number(lead) || 14,
    });
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <div className="bg-bg border border-lt rounded-lg p-3 mb-3">
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <div>
          <div className="text-[7px] text-gr mb-0.5">Distributor</div>
          <select
            value={distributor}
            onChange={(e) => setDist(e.target.value)}
            className="w-full px-2 py-1 rounded border border-lt text-[10px]"
          >
            <option>St Charles</option>
            <option>Dawn</option>
            <option>Internal</option>
          </select>
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">Brand name</div>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Ardent Mills"
            className="w-full px-2 py-1 rounded border border-lt text-[10px]"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div>
          <div className="text-[7px] text-gr mb-0.5">Cost / {unit}</div>
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            className="w-full px-2 py-1 rounded border border-lt text-[10px] text-right"
          />
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">MOQ ({unit})</div>
          <input
            value={moq}
            onChange={(e) => setMoq(e.target.value)}
            placeholder="e.g. 25000"
            className="w-full px-2 py-1 rounded border border-lt text-[10px] text-right"
          />
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">Lead (days)</div>
          <input
            value={lead}
            onChange={(e) => setLead(e.target.value)}
            placeholder="14"
            className="w-full px-2 py-1 rounded border border-lt text-[10px] text-right"
          />
        </div>
      </div>
      {err && <div className="text-[10px] text-red-600 mb-1.5">{err}</div>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="bg-pk text-white px-3 py-1 rounded text-[10px] font-semibold hover:bg-pm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Distributor'}
        </button>
        <button onClick={onClose} className="text-[10px] text-gr hover:text-pk">
          Cancel
        </button>
      </div>
      <div className="mt-1.5 text-[7px] text-gr italic">
        Pricing changes are audit-logged via the audit_log table.
      </div>
    </div>
  );
}

function AddOrderForm({ material, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const suppliers = material.raw_material_suppliers ?? [];
  const [supplierIdx, setSupplierIdx] = useState(0);
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [orderDate, setOrderDate] = useState(today);
  const [expected, setExpected] = useState('');
  const [bol, setBol] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const supplier = suppliers[supplierIdx];

  const save = async () => {
    if (!quantity || Number(quantity) <= 0) {
      setErr('Quantity is required.');
      return;
    }
    setSaving(true);
    const { error } = await addManualOrder(material.id, {
      supplier_id: supplier?.id ?? null,
      distributor: supplier?.distributor ?? null,
      brand: supplier?.brand ?? null,
      quantity: Number(quantity),
      cost_per_unit: Number(cost) || supplier?.cost_per_unit || null,
      order_date: orderDate,
      expected_delivery: expected || null,
      bol_reference: bol || null,
    });
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  if (!suppliers.length) {
    return (
      <div className="bg-bg border border-lt rounded-lg p-3 mb-3 text-[10px] text-gr">
        Add a distributor first.{' '}
        <button onClick={onClose} className="text-pk underline">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="bg-bg border border-lt rounded-lg p-3 mb-3">
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        <div>
          <div className="text-[7px] text-gr mb-0.5">Distributor / Brand</div>
          <select
            value={supplierIdx}
            onChange={(e) => setSupplierIdx(Number(e.target.value))}
            className="w-full px-2 py-1 rounded border border-lt text-[10px]"
          >
            {suppliers.map((s, i) => (
              <option key={s.id} value={i}>
                {s.distributor} — {s.brand}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">BOL / Reference</div>
          <input
            value={bol}
            onChange={(e) => setBol(e.target.value)}
            placeholder="BOL-FL-2404"
            className="w-full px-2 py-1 rounded border border-lt text-[10px]"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-1.5">
        <div>
          <div className="text-[7px] text-gr mb-0.5">Qty ({material.unit})</div>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="25000"
            className="w-full px-2 py-1 rounded border border-lt text-[10px] text-right"
          />
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">Cost / {material.unit}</div>
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder={supplier ? supplier.cost_per_unit?.toString() ?? '' : '0.00'}
            className="w-full px-2 py-1 rounded border border-lt text-[10px] text-right"
          />
        </div>
        <div>
          <div className="text-[7px] text-gr mb-0.5">Order date</div>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="w-full px-2 py-1 rounded border border-lt text-[10px]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div>
          <div className="text-[7px] text-gr mb-0.5">Expected delivery</div>
          <input
            type="date"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            className="w-full px-2 py-1 rounded border border-lt text-[10px]"
          />
        </div>
      </div>
      {err && <div className="text-[10px] text-red-600 mb-1.5">{err}</div>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="bg-pk text-white px-3 py-1 rounded text-[10px] font-semibold hover:bg-pm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Order'}
        </button>
        <button onClick={onClose} className="text-[10px] text-gr hover:text-pk">
          Cancel
        </button>
      </div>
      <div className="mt-1.5 text-[7px] text-gr italic">
        Most orders auto-capture from systems@dirtycookie.com. Manual entry routes through this form.
      </div>
    </div>
  );
}

function MaterialDetail({ code, onBack }) {
  const { data, loading, error, refresh } = useRawMaterialDetail(code);
  const [addingDist, setAddingDist] = useState(false);
  const [addingOrder, setAddingOrder] = useState(false);

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) {
    return (
      <div className="bg-cd border border-lt rounded-xl p-8 text-center">
        <div className="text-sm font-semibold text-dk mb-1">No material with code "{code}"</div>
        <button onClick={onBack} className="text-xs font-semibold text-pk underline">
          Back
        </button>
      </div>
    );
  }

  const suppliers = data.raw_material_suppliers ?? [];
  const lots = (data.raw_material_lots ?? []).slice().sort((a, b) => a.fifo_order - b.fifo_order);
  const usage = data.bill_of_materials ?? [];
  const lead = data.default_lead_days ?? 14;

  return (
    <div className="bg-cd border border-lt rounded-xl p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-lg font-black text-dk">{data.name}</div>
          <div className="text-[9px] font-mono text-gr">Code: {data.code}</div>
        </div>
        <button onClick={onBack} className="bg-bg border border-lt rounded-md px-3 py-1 text-[10px] font-semibold text-md hover:text-pk">
          Back
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <Field label="On Hand" value={`${qty(data.quantity)} ${data.unit}`} />
        <div className={`rounded-lg px-2.5 py-1.5 border border-lt ${lead >= 21 ? 'bg-yellow-100' : 'bg-bg'}`}>
          <div className="text-[8px] font-semibold uppercase text-gr">Default Lead</div>
          <div className={`text-[11px] font-bold mt-0.5 ${lead >= 21 ? 'text-amber-700' : 'text-dk'}`}>{lead}d</div>
          <div className="text-[7px] text-gr">Per-distributor below</div>
        </div>
        <Field label="Lots" value={data.lot_count ?? lots.length} />
        <Field
          label="Expiry"
          value={data.expiry_status === 'partial_expired'
            ? `${qty(data.expired_quantity)} exp`
            : data.expiry_status === 'almost_expired'
            ? 'Expiring soon'
            : 'Good'}
        />
      </div>

      <div className="flex justify-between items-center mb-1.5 pb-1 border-b-2 border-lt">
        <div className="text-[8px] font-bold uppercase tracking-wider text-pk">
          Distributors and Brands
        </div>
        <button
          onClick={() => setAddingDist((v) => !v)}
          className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${
            addingDist ? 'bg-pk text-white border-pk' : 'bg-bg border-lt text-pk hover:bg-pc'
          }`}
        >
          {addingDist ? 'Cancel' : '+ Add Distributor'}
        </button>
      </div>
      {addingDist && (
        <AddDistributorForm
          materialId={data.id}
          unit={data.unit}
          onClose={() => setAddingDist(false)}
          onSaved={() => {
            setAddingDist(false);
            refresh();
          }}
        />
      )}
      {suppliers.length ? (
        <table className="w-full border-collapse text-[11px] mb-3">
          <thead>
            <tr className="bg-pc">
              <th className={TH}>Distributor</th>
              <th className={TH}>Brand</th>
              <th className={THR}>Cost/{data.unit}</th>
              <th className={THR}>MOQ</th>
              <th className={THR}>Lead</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-bg">
                <td className="px-3 py-2 font-bold">{s.distributor}</td>
                <td className="px-3 py-2">{s.brand}</td>
                <td className="px-3 py-2 text-right font-semibold">{usd(s.cost_per_unit)}</td>
                <td className="px-3 py-2 text-right">{s.moq > 0 ? qty(s.moq) : '--'}</td>
                <td className={`px-3 py-2 text-right ${s.lead_time_days >= 21 ? 'text-amber-700' : 'text-gr'}`}>
                  {s.lead_time_days}d
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-[10px] text-gr italic mb-3">No distributors yet — add the first one above.</div>
      )}
      <div className="text-[7px] text-gr italic mb-4">
        Cost / MOQ / lead time editable per distributor (Phase 2). Pricing edits will trigger audit log.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <div className="text-[8px] font-bold uppercase tracking-wider text-pk">Orders</div>
            <button
              onClick={() => setAddingOrder((v) => !v)}
              className={`text-[9px] font-semibold px-2 py-0.5 rounded border ${
                addingOrder ? 'bg-pk text-white border-pk' : 'bg-bg border-lt text-pk hover:bg-pc'
              }`}
            >
              {addingOrder ? 'Cancel' : '+ Add Order'}
            </button>
          </div>
          {addingOrder && (
            <AddOrderForm
              material={data}
              onClose={() => setAddingOrder(false)}
              onSaved={() => {
                setAddingOrder(false);
                refresh();
              }}
            />
          )}
          {data.orders.length ? (
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-pc">
                  <th className={TH}>Date</th>
                  <th className={TH}>Brand</th>
                  <th className={TH}>Dist</th>
                  <th className={THR}>Qty</th>
                  <th className={THR}>Cost</th>
                  <th className={THC}>Src</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-bg">
                    <td className="px-2 py-1 text-gr">{formatDate(o.order_date)}</td>
                    <td className="px-2 py-1 font-semibold">{o.brand || '--'}</td>
                    <td className="px-2 py-1 text-gr text-[9px]">{o.distributor || '--'}</td>
                    <td className="px-2 py-1 text-right">{qty(o.quantity)}</td>
                    <td className="px-2 py-1 text-right">{usd(o.cost_per_unit)}</td>
                    <td className="px-2 py-1 text-center">
                      <span
                        className={`px-1 py-px rounded text-[7px] font-semibold ${
                          o.source === 'email'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-gray-100 text-gr'
                        }`}
                      >
                        {o.source === 'email' ? 'A' : 'M'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-[10px] text-gr italic">No orders yet.</div>
          )}
        </div>

        <div>
          <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-1.5">Used in</div>
          {usage.length ? (
            <table className="w-full border-collapse text-[10px] mb-3">
              <tbody>
                {usage.map((u) => (
                  <tr key={u.id} className="border-b border-bg">
                    <td className="px-2 py-1 font-semibold">
                      {u.products?.short_name || u.products?.sku || '--'}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {qty(u.quantity_per_batch)} {u.unit || data.unit}/batch
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-[10px] text-gr italic mb-3">No BoM entries yet.</div>
          )}

          <div className="text-[8px] font-bold uppercase tracking-wider text-pk mb-1.5">
            FIFO Lots
          </div>
          {lots.length ? (
            <table className="w-full border-collapse text-[10px]">
              <tbody>
                {lots.map((l) => {
                  const exp = l.expiry_date ? new Date(l.expiry_date) : null;
                  const expired = exp && exp < new Date();
                  return (
                    <tr key={l.id} className={`border-b border-bg ${expired ? 'bg-red-50' : ''}`}>
                      <td className="px-2 py-1 font-mono">{l.lot_number || '--'}</td>
                      <td className="px-2 py-1 text-right">{qty(l.quantity)}</td>
                      <td className={`px-2 py-1 text-[9px] ${expired ? 'text-red-600 font-bold' : 'text-gr'}`}>
                        {expired ? 'EXPIRED' : formatDate(l.expiry_date)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-[10px] text-gr italic">No lots recorded.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RawMaterialsView({ initialCode }) {
  const [selectedCode, setSelectedCode] = useState(initialCode || null);
  // Deep-link via ?material=<code> takes precedence on mount; once the user
  // navigates back to the list we drop the URL param.
  useEffect(() => {
    if (initialCode) setSelectedCode(initialCode);
  }, [initialCode]);

  if (selectedCode) {
    return <MaterialDetail code={selectedCode} onBack={() => setSelectedCode(null)} />;
  }
  return <MaterialsList onSelect={setSelectedCode} />;
}

function Placeholder({ title, day, note }) {
  return (
    <div className="bg-cd border border-lt rounded-xl p-6">
      <div className="text-sm font-semibold text-dk mb-1">{title}</div>
      <div className="text-[10px] uppercase tracking-wider text-gr mb-2">Day {day} — coming soon</div>
      <div className="text-xs text-md max-w-xl">{note}</div>
    </div>
  );
}

const VIEWS = [
  { key: 'products', label: 'Products' },
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
      {view === 'raw' && <RawMaterialsView initialCode={material} />}
      {view === 'transitions' && (
        <Placeholder
          title="Product transitions"
          day="6.5"
          note="From/to SKU, launch + cutoff dates, and the changeover checklist (e.g. WCCB 12ct → 8ct). Builds in Day 6.5."
        />
      )}
    </div>
  );
}
