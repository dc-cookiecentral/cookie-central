import { useState } from 'react';
import WarehouseView from '../components/WarehouseView';
import ProductView from '../components/ProductView';
import ReorderView from '../components/ReorderView';
import LandingView from '../components/LandingView';
import ReorderCalculator from '../components/ReorderCalculator';

const VIEWS = [
  { key: 'warehouse', label: 'By Warehouse' },
  { key: 'product', label: 'By Product' },
  { key: 'reorder', label: 'Reorder' },
  { key: 'calculator', label: 'Reorder Calculator' },
];

export default function Inventory() {
  const [view, setView] = useState('warehouse');

  return (
    <div>
      <h1 className="text-xl font-bold text-dk mb-3">Inventory</h1>

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

      {/* Incoming first (Landing / Receiving), then current stock — Ops sees what's
          arriving before what's on hand. */}
      {view === 'warehouse' && (
        <div className="space-y-4">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-pk mb-2">
              Incoming — Landing / Receiving
            </div>
            <LandingView />
          </div>
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-pk mb-2">
              Current Stock
            </div>
            <WarehouseView />
          </div>
        </div>
      )}

      {view === 'product' && <ProductView />}

      {view === 'reorder' && (
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-pk mb-2">
            Raw Ingredient Reorder
          </div>
          <ReorderView />
        </div>
      )}

      {view === 'calculator' && (
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-pk mb-2">
            Scenario-Based Reorder Calculator
          </div>
          <ReorderCalculator />
        </div>
      )}
    </div>
  );
}
