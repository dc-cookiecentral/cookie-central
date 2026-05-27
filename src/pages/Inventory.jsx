import { useState } from 'react';
import ReorderView from '../components/ReorderView';
import LandingView from '../components/LandingView';

const VIEWS = [
  { key: 'warehouse', label: 'By Warehouse' },
  { key: 'product', label: 'By Product' },
  { key: 'reorder', label: 'Reorder' },
];

function Placeholder({ title, day }) {
  return (
    <div className="bg-cd border border-lt rounded-xl p-8 text-center">
      <div className="text-sm font-semibold text-dk mb-1">{title}</div>
      <div className="text-xs text-gr">Built Day {day}.</div>
    </div>
  );
}

export default function Inventory() {
  const [view, setView] = useState('reorder');
  // Bumped when a reorder creates new orders, so the landing list refetches.
  const [landingReload, setLandingReload] = useState(0);

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

      {view === 'warehouse' && <Placeholder title="Warehouse view" day={4} />}
      {view === 'product' && <Placeholder title="Product view" day="5.1" />}
      {view === 'reorder' && (
        <div className="space-y-4">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-pk mb-2">
              Raw Ingredient Reorder
            </div>
            <ReorderView onOrdersCreated={() => setLandingReload((k) => k + 1)} />
          </div>
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-pk mb-2">
              Landing / Receiving
            </div>
            <LandingView reloadKey={landingReload} />
          </div>
        </div>
      )}
    </div>
  );
}
