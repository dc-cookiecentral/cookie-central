import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSupplies } from '../hooks/useSupplies';
import { buildSupplyMaps } from '../components/supplies/supplyUi';
import SupplyItems from '../components/supplies/SupplyItems';
import VendorRolodex from '../components/supplies/VendorRolodex';
import SupplyEditModal from '../components/supplies/SupplyEditModal';

// Supplies & Vendors (docs/SUPPLIES_SPEC.md, Phase V1 — READ-ONLY).
// One window, two tabs over the same data: Supplies (items → vendor price
// lines → terms/docs) and Vendors (the rolodex). The tab lives in ?tab= so
// vendor names can link across (?tab=vendors&vendor=<id>) and items back
// (?item=<id>). /vendors redirects here.
//
// Editing follows the Spec Sheet lock: admin/ops get the 🔒/🔓 toggle, and
// only while unlocked do the edit controls show (assumed cost per item; PO
// fulfillment, packing slip and pickup freight per PO line).

const TABS = [
  { key: 'supplies', label: 'Supplies' },
  { key: 'vendors', label: 'Vendors' },
];

export default function Supplies() {
  const { profile } = useAuth();
  const canEdit = ['admin', 'ops'].includes(profile?.role);
  const [editMode, setEditMode] = useState(false);
  const editing = canEdit && editMode;
  const [modal, setModal] = useState(null); // { kind: 'assumed', item } | { kind: 'po', quote, po, item }
  const { data, loading, error, refresh } = useSupplies();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'vendors' ? 'vendors' : 'supplies';
  const maps = useMemo(() => (data ? buildSupplyMaps(data) : null), [data]);

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <div>
          <h1 className="text-xl font-bold text-dk">Supplies &amp; Vendors <span className="text-gr font-normal text-sm">· ingredients, packaging &amp; who sells them</span></h1>
          <div className="text-[11px] text-gr">Who sells each ingredient and packaging component, at what price and terms, with the original quote or invoice.</div>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded border ${editing ? 'bg-pk text-white border-pk' : 'bg-cd border-lt text-pk hover:bg-pc'}`}
          >
            {editing ? '🔓 Editing — click to lock' : '🔒 Read-only — click to edit'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setParams(t.key === 'supplies' ? {} : { tab: t.key }, { replace: true })}
            className={
              tab === t.key
                ? 'px-3 py-1.5 rounded-lg text-[11px] font-bold bg-pk text-white'
                : 'px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-cd border border-lt text-md hover:border-pk hover:text-pk'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? ( // a refresh after a save keeps the current view on screen
        <div className="text-sm text-gr py-10 text-center">Loading Supplies…</div>
      ) : error ? (
        <div className="text-sm text-red-600 py-6">
          {error}
          <div className="text-[11px] text-gr mt-1">If tables are missing, apply the supplies migration + seed first.</div>
        </div>
      ) : tab === 'vendors' ? (
        <VendorRolodex data={data} maps={maps} />
      ) : (
        <SupplyItems data={data} maps={maps} editing={editing} setModal={setModal} />
      )}

      {modal && (
        <SupplyEditModal
          modal={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
