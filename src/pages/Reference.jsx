import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ITEM_MASTER, ITEM_STATUS } from '../data/itemMaster';

// Reference master data. Products is built from the Walmart item master parsed
// out of the weekly sales report (parsers/weeklyAttachments.js → parseItemMaster).
// Raw Materials (6.4) + Transitions (6.5) are later builds; Raw Materials is also
// where Inventory > Warehouse deep-links via /reference?material=<code>.

const TH = 'px-3 py-2 text-left text-[9px] font-bold text-gr uppercase tracking-wider';
const THR = TH + ' text-right';

const usd = (n, dp = 2) => (n == null ? '--' : '$' + n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const pct = (n) => (n == null ? '--' : (n <= 1 ? n * 100 : n).toFixed(2) + '%');
const qty = (n) => (n == null ? '--' : n.toLocaleString());

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
        <button
          onClick={onBack}
          className="bg-bg border border-lt rounded-md px-3 py-1.5 text-[10px] font-semibold text-md hover:text-pk"
        >
          Back
        </button>
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
            <tr
              key={p.sku}
              onClick={() => setSel(p.sku)}
              className="border-b border-bg cursor-pointer hover:bg-pc"
            >
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
      {view === 'raw' && (
        <Placeholder
          title={material ? `Raw material: ${material}` : 'Raw Materials master'}
          day="6.4"
          note={
            material
              ? `Deep-linked from Inventory > Warehouse for code "${material}". The full raw-materials master — distributor/brand, FIFO lots, lead time, and audit — lands in Day 6.4.`
              : 'Distributor/brand table, + Add Distributor / + Add Order, FIFO lots, and audit log. Builds in Day 6.4.'
          }
        />
      )}
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
