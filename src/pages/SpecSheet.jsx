import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSpecSheet, deleteSpecRow, toggleSampleEligible } from '../hooks/useSpecSheet';
import {
  buildMaps, cookieForm, cookieTier, cookieStorage, cookieOfEach, caseStorage,
  caseBrand, caseNetOz, ozToLb, casesPerPallet,
} from '../utils/cookulator';
import SpecTable from '../components/specsheet/SpecTable';
import EditModal from '../components/specsheet/EditModal';
import {
  Empty, TBD, Code, StoragePill, PrepPill, FormPill, TierPill, OzPill, BrandPill, SampleChip, SampleToggle,
} from '../components/specsheet/pills';

const TABS = [
  { key: 'wip', label: '1 · WIP' },
  { key: 'cookies', label: '2 · Cookies' },
  { key: 'eaches', label: '3 · Eaches' },
  { key: 'inners', label: '4 · Inner Case' },
  { key: 'master', label: '5 · Master Case' },
  { key: 'prices', label: '6 · Price Lists' },
];

const num = (v) => (v === '' || v == null ? <Empty /> : <span className="font-semibold text-dk">{v}</span>);
const lb = (oz) => (oz == null ? null : ozToLb(oz));

export default function SpecSheet() {
  const { profile } = useAuth();
  const canEdit = ['admin', 'ops'].includes(profile?.role);
  const { data, loading, error, refresh } = useSpecSheet();
  const [tab, setTab] = useState('wip');
  const [editMode, setEditMode] = useState(false);
  const [modal, setModal] = useState(null); // { kind, row }

  if (loading) return <div className="text-sm text-gr py-10 text-center">Loading Spec Sheet…</div>;
  if (error)
    return (
      <div className="text-sm text-red-600 py-6">
        {error}
        <div className="text-[11px] text-gr mt-1">If tables are missing, apply the Phase-1 migrations + seed first.</div>
      </div>
    );

  const maps = buildMaps(data);
  const editing = canEdit && editMode;

  const onDelete = async (table, keyCol, keyVal) => {
    if (!window.confirm(`Delete ${keyVal}? This cannot be undone.`)) return;
    const { error: e } = await deleteSpecRow(table, keyCol, keyVal);
    if (e) window.alert(e.message);
    else refresh();
  };
  const onToggleSample = async (table, keyCol, keyVal, next) => {
    const { error: e } = await toggleSampleEligible(table, keyCol, keyVal, next);
    if (e) window.alert(e.message);
    else refresh();
  };

  // actions column (edit + delete) — only in edit mode
  const actionsCol = (kind, table, keyCol) => ({
    key: '_act', label: '', sortable: false,
    render: (r) => (
      <div className="flex gap-1 whitespace-nowrap">
        <button onClick={() => setModal({ kind, row: r })} className="px-2 py-0.5 rounded text-[10px] border border-lt text-pk hover:bg-pc">Edit</button>
        <button onClick={() => onDelete(table, keyCol, r[keyCol])} className="px-2 py-0.5 rounded text-[10px] border border-lt text-red-600 hover:bg-red-50">Del</button>
      </div>
    ),
  });
  // sample column — toggle in edit mode, chip otherwise
  const sampleCol = (table, keyCol) => ({
    key: '_sample', label: 'Sample', sortable: false,
    value: (r) => (r.sample_eligible ? 'yes' : 'no'),
    render: (r) =>
      editing ? (
        <SampleToggle on={!!r.sample_eligible} onClick={() => onToggleSample(table, keyCol, r[keyCol], !r.sample_eligible)} />
      ) : (
        <SampleChip on={!!r.sample_eligible} />
      ),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <div>
          <h1 className="text-xl font-bold text-dk">Spec Sheet <span className="text-gr font-normal text-sm">· the Cookulator</span></h1>
          <div className="text-[11px] text-gr">Product master data — cookies → eaches → inners → master cases → price lists.</div>
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

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={['px-3 py-1.5 rounded-md text-[11px] font-semibold border', tab === t.key ? 'border-pk bg-pink-50 text-pk' : 'border-lt bg-cd text-gr hover:text-pk'].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'wip' && <WipTab data={data} editing={editing} setModal={setModal} actionsCol={actionsCol} />}
      {tab === 'cookies' && <CookiesTab data={data} maps={maps} editing={editing} setModal={setModal} actionsCol={actionsCol} sampleCol={sampleCol} />}
      {tab === 'eaches' && <EachesTab data={data} maps={maps} editing={editing} setModal={setModal} actionsCol={actionsCol} sampleCol={sampleCol} />}
      {tab === 'inners' && <InnersTab data={data} editing={editing} setModal={setModal} actionsCol={actionsCol} sampleCol={sampleCol} />}
      {tab === 'master' && <MasterTab data={data} maps={maps} editing={editing} setModal={setModal} actionsCol={actionsCol} sampleCol={sampleCol} />}
      {tab === 'prices' && <PricesTab data={data} />}

      {modal && (
        <EditModal
          kind={modal.kind}
          row={modal.row}
          data={data}
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

function AddBtn({ label, onClick }) {
  return (
    <button onClick={onClick} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-pk text-pk hover:bg-pc mb-2">{label}</button>
  );
}

// ── Tab 1: WIP (Raw Dough + Production Dough + Stuffings) ────────────────────
function WipTab({ data, editing, setModal, actionsCol }) {
  const rawCols = [
    { key: 'raw_sku', label: 'Raw SKU', render: (r) => <Code v={r.raw_sku} /> },
    { key: 'name', label: 'Raw Dough Name' },
    { key: 'family', label: 'Form', filterable: true, render: (r) => <FormPill v={r.family} /> },
    { key: 'subtype', label: 'Tier', filterable: true, render: (r) => <TierPill v={r.subtype} /> },
    { key: 'batch_wt_oz', label: 'Batch Wt (oz)', render: (r) => num(r.batch_wt_oz) },
    { key: 'co_mans', label: 'Co-Man(s)', value: (r) => (r.co_mans || []).join(', '), render: (r) => (r.co_mans?.length ? r.co_mans.join(', ') : <Empty />) },
    { key: 'notes', label: 'Notes', render: (r) => r.notes || <Empty /> },
    ...(editing ? [actionsCol('rawdough', 'raw_doughs', 'raw_sku')] : []),
  ];
  const wipCols = [
    { key: 'wip_sku', label: 'WIP SKU', render: (r) => <Code v={r.wip_sku} /> },
    { key: 'name', label: 'Production Dough' },
    { key: 'type', label: 'Form', filterable: true, render: (r) => <FormPill v={r.type === 'Mixed' ? 'Stuffed' : r.type} /> },
    { key: 'subtype', label: 'Tier', filterable: true, render: (r) => <TierPill v={r.subtype} /> },
    { key: 'raw_base', label: 'Base (Raw Dough)', render: (r) => (r.raw_base ? <span className="text-pk">↓ {r.raw_base}</span> : <Empty />) },
    { key: 'mixins', label: 'Mix-ins', render: (r) => r.mixins || <Empty /> },
    { key: 'mixin_wt_oz', label: 'Mix-in Wt (oz)', render: (r) => num(r.mixin_wt_oz) },
    { key: 'raw_dough_portion_oz', label: 'Raw Portion (oz)', render: (r) => (r.raw_dough_portion_oz == null || r.raw_dough_portion_oz === '' ? <TBD /> : num(r.raw_dough_portion_oz)) },
    { key: 'wip_batch_wt_oz', label: 'WIP Batch Wt (oz)', render: (r) => (r.wip_batch_wt_oz == null || r.wip_batch_wt_oz === '' ? <TBD /> : num(r.wip_batch_wt_oz)) },
    ...(editing ? [actionsCol('proddough', 'wip_doughs', 'wip_sku')] : []),
  ];
  const stufCols = [
    { key: 'stuffing_id', label: 'Stuffing ID', render: (r) => <Code v={r.stuffing_id} /> },
    { key: 'name', label: 'Stuffing Name' },
    { key: 'type', label: 'Type' },
    { key: 'no_flex', label: 'No Flex', value: (r) => (r.no_flex ? 'yes' : 'no'), render: (r) => (r.no_flex ? <span className="text-[10px] font-bold text-red-600">NO FLEX</span> : <Empty />) },
    { key: 'notes', label: 'Notes', render: (r) => r.notes || <Empty /> },
    ...(editing ? [actionsCol('stuffing', 'stuffings', 'stuffing_id')] : []),
  ];
  return (
    <div>
      <div className="text-[11px] text-gr mb-3 bg-cd border border-lt rounded-lg p-2.5">
        <b>WIP — Work In Progress doughs.</b> Raw Dough (base recipes) → Production Dough (raw + mix-ins) → rolls up into Cookies. Stuffings are the fillings added to stuffed cookies. <b>Form &amp; Tier are defined here</b> and inherit down to every cookie.
      </div>
      {editing && <AddBtn label="+ Add Raw Dough" onClick={() => setModal({ kind: 'rawdough', row: null })} />}
      <SpecTable columns={rawCols} rows={data.rawDoughs} bandLabel="Raw Dough — base recipes" bandColor="#B5651D" />
      {editing && <AddBtn label="+ Add Production Dough" onClick={() => setModal({ kind: 'proddough', row: null })} />}
      <SpecTable columns={wipCols} rows={data.wipDoughs} bandLabel="Production Dough — raw + mix-ins" bandColor="#C9943B" />
      {editing && <AddBtn label="+ Add Stuffing" onClick={() => setModal({ kind: 'stuffing', row: null })} />}
      <SpecTable columns={stufCols} rows={data.stuffings} bandLabel="Stuffing / Fillings" bandColor="#7A5BA0" />
    </div>
  );
}

// ── Tab 2: Cookies ──────────────────────────────────────────────────────────
function CookiesTab({ data, maps, editing, setModal, actionsCol, sampleCol }) {
  const cols = [
    { key: 'code', label: 'Cookie Code', render: (r) => <Code v={r.code} /> },
    { key: 'form', label: 'Form', filterable: true, value: (r) => cookieForm(r, maps), render: (r) => <FormPill v={cookieForm(r, maps)} /> },
    { key: 'description', label: 'Description', render: (r) => r.description || <Empty /> },
    { key: 'tier', label: 'Tier', filterable: true, value: (r) => cookieTier(r, maps), render: (r) => <TierPill v={cookieTier(r, maps)} /> },
    { key: 'outer_cookie', label: 'Outer Cookie', render: (r) => r.outer_cookie || <Empty /> },
    { key: 'stuffing', label: 'Stuffing', render: (r) => r.stuffing || <Empty label="— none" /> },
    { key: 'dough_oz', label: 'Dough oz', render: (r) => <OzPill v={r.dough_oz} /> },
    { key: 'prep', label: 'Prep', filterable: true, render: (r) => <PrepPill v={r.prep} /> },
    { key: 'storage', label: 'Storage', value: (r) => cookieStorage(r), render: (r) => <StoragePill v={cookieStorage(r)} /> },
    { key: 'wip_dough', label: 'Made From (Dough)', optional: true, defaultOn: false, group: 'Optional', render: (r) => (r.wip_dough ? <span className="text-pk">↓ {r.wip_dough}</span> : <Empty />) },
    { key: 'allergens', label: 'Allergens', optional: true, defaultOn: false, group: 'Optional', render: (r) => r.allergens || <Empty /> },
    sampleCol('products', 'code'),
    ...(editing ? [actionsCol('cookie', 'products', 'code')] : []),
  ];
  return (
    <div>
      <div className="text-[11px] text-gr mb-3 bg-cd border border-lt rounded-lg p-2.5">
        <b>Cookie (Component)</b> — the BOM atom. Form &amp; Tier inherit from the dough (WIP). <b>Storage is derived from prep</b> (Baked → Ambient, Raw → Frozen).
      </div>
      {editing && <AddBtn label="+ Add Cookie" onClick={() => setModal({ kind: 'cookie', row: null })} />}
      <SpecTable columns={cols} rows={data.products} bandLabel="Cookie" bandColor="#7A5BA0" />
    </div>
  );
}

// ── Tab 3: Eaches (retail sell units — carry a UPC) ─────────────────────────
function EachesTab({ data, maps, editing, setModal, actionsCol, sampleCol }) {
  const retail = data.eaches.filter((e) => (e.each_upc || '').trim() !== '');
  const ck = (r) => cookieOfEach(r, maps);
  const cols = [
    { key: 'each_sku', label: 'Each SKU', render: (r) => <Code v={r.each_sku} /> },
    { key: 'each_upc', label: 'UPC (12-digit)', render: (r) => <Code v={r.each_upc} /> },
    { key: 'brand', label: 'Brand', filterable: true, render: (r) => <BrandPill v={r.brand} /> },
    { key: 'cookie_desc', label: 'Cookie', optional: true, group: 'From Cookies', value: (r) => ck(r)?.description || '', render: (r) => ck(r)?.description || <Empty /> },
    { key: 'outer', label: 'Outer Cookie', optional: true, defaultOn: false, group: 'From Cookies', value: (r) => ck(r)?.outer_cookie || '', render: (r) => ck(r)?.outer_cookie || <Empty /> },
    { key: 'stuffing', label: 'Stuffing', optional: true, defaultOn: false, group: 'From Cookies', value: (r) => ck(r)?.stuffing || '', render: (r) => ck(r)?.stuffing || <Empty label="— none" /> },
    { key: 'form', label: 'Form', optional: true, defaultOn: false, group: 'From Cookies', value: (r) => cookieForm(ck(r) || {}, maps), render: (r) => <FormPill v={cookieForm(ck(r) || {}, maps)} /> },
    { key: 'tier', label: 'Tier', optional: true, defaultOn: false, group: 'From Cookies', value: (r) => cookieTier(ck(r) || {}, maps), render: (r) => <TierPill v={cookieTier(ck(r) || {}, maps)} /> },
    { key: 'oz', label: 'Dough oz', optional: true, defaultOn: false, group: 'From Cookies', value: (r) => ck(r)?.dough_oz || '', render: (r) => <OzPill v={ck(r)?.dough_oz} /> },
    { key: 'net_wt', label: 'Net Wt', render: (r) => r.net_wt || <Empty /> },
    { key: 'gross_wt_oz', label: 'Gross Wt (oz)', render: (r) => (r.gross_wt_oz == null || r.gross_wt_oz === '' ? <TBD label="enter" /> : num(r.gross_wt_oz)) },
    { key: 'pack_type', label: 'Pack Type', render: (r) => r.pack_type || <Empty /> },
    { key: 'prep', label: 'Prep', value: (r) => ck(r)?.prep || '', render: (r) => <PrepPill v={ck(r)?.prep} /> },
    { key: 'retail_price', label: 'Retail Price', render: (r) => (r.retail_price == null || r.retail_price === '' ? <TBD /> : <span className="font-semibold text-green-700">${r.retail_price}</span>) },
    sampleCol('eaches', 'each_sku'),
    ...(editing ? [actionsCol('each', 'eaches', 'each_sku')] : []),
  ];
  return (
    <div>
      <div className="text-[11px] text-gr mb-3 bg-cd border border-lt rounded-lg p-2.5">
        <b>Each (Sell Unit)</b> — retail units scanned at the register, each carrying a consumer UPC. Bulk/wholesale units aren't eaches.
      </div>
      {editing && <AddBtn label="+ Add Each" onClick={() => setModal({ kind: 'each', row: null })} />}
      <SpecTable columns={cols} rows={retail} bandLabel="Each" bandColor="#3A6EA5" emptyNote="No retail eaches (an each needs a UPC to appear here)." />
    </div>
  );
}

// ── Tab 4: Inner Case ───────────────────────────────────────────────────────
function InnersTab({ data, editing, setModal, actionsCol, sampleCol }) {
  const cols = [
    { key: 'inner_sku', label: 'Inner SKU', render: (r) => <Code v={r.inner_sku} /> },
    { key: 'name', label: 'Inner Case Name', render: (r) => r.name || <Empty /> },
    { key: 'each_sku', label: 'Holds Each', render: (r) => (r.each_sku ? <span className="text-pk">↓ {r.each_sku}</span> : <Empty />) },
    { key: 'eaches_per_inner', label: 'Eaches / Inner', render: (r) => num(r.eaches_per_inner) },
    { key: 'sellable', label: 'Sellable?', optional: true, group: 'Optional', filterable: true, value: (r) => (r.sellable ? 'Yes' : 'No'), render: (r) => (r.sellable ? 'Yes' : 'No') },
    { key: 'gtin14', label: 'GTIN-14', optional: true, defaultOn: false, group: 'Optional', render: (r) => (r.gtin14 ? <Code v={r.gtin14} /> : <TBD label="assign" />) },
    sampleCol('inners', 'inner_sku'),
    ...(editing ? [actionsCol('inner', 'inners', 'inner_sku')] : []),
  ];
  return (
    <div>
      <div className="text-[11px] text-gr mb-3 bg-cd border border-lt rounded-lg p-2.5">
        <b>Inner Case</b> — a grouping of eaches inside the master case. Eaches-per-inner is the factor.
      </div>
      {editing && <AddBtn label="+ Add Inner Case" onClick={() => setModal({ kind: 'inner', row: null })} />}
      <SpecTable columns={cols} rows={data.inners} bandLabel="Inner Case" bandColor="#2E7D6B" />
    </div>
  );
}

// ── Tab 5: Master Case (Retail + Wholesale) ─────────────────────────────────
function MasterTab({ data, maps, editing, setModal, actionsCol, sampleCol }) {
  const mcCols = () => [
    { key: 'brand', label: 'Brand', filterable: true, value: (r) => caseBrand(r, maps), render: (r) => <BrandPill v={caseBrand(r, maps)} /> },
    { key: 'name', label: 'Case Name', render: (r) => r.name || <Empty /> },
    { key: 'storage', label: 'Storage', optional: true, group: 'Optional', value: (r) => caseStorage(r, maps), render: (r) => <StoragePill v={caseStorage(r, maps)} /> },
    { key: 'units', label: 'Units in Case', value: (r) => Number(r.unit_qty) || 0, render: (r) => (r.unit_qty == null || r.unit_qty === '' ? <TBD /> : <span><b className="text-violet-700">{r.unit_qty}</b> <span className="text-[9px] text-gr">{r.composed_of}</span></span>) },
    { key: 'composed_of', label: 'Made Up Of', optional: true, defaultOn: false, group: 'Optional', filterable: true, render: (r) => <span className="text-[10px] px-1.5 py-px rounded bg-sky-50 text-sky-700">{r.composed_of || 'eaches'}</span> },
    { key: 'dims', label: 'L × W × H', optional: true, defaultOn: false, group: 'Optional', value: (r) => [r.length_in, r.width_in, r.height_in].filter(Boolean).join('x'), render: (r) => ((r.length_in || r.width_in || r.height_in) ? <Code v={`${r.length_in || '?'} × ${r.width_in || '?'} × ${r.height_in || '?'}`} /> : <TBD label="set dims" />) },
    { key: 'gross_wt_lb', label: 'Gross Wt (lb)', optional: true, defaultOn: false, group: 'Optional', render: (r) => (r.gross_wt_lb == null || r.gross_wt_lb === '' ? <TBD label="enter" /> : num(r.gross_wt_lb)) },
    { key: 'net_derived', label: 'Net Wt (derived)', optional: true, group: 'Optional', sortable: true, value: (r) => lb(caseNetOz(r, maps)) ?? -1, render: (r) => { const l = lb(caseNetOz(r, maps)); return l == null ? <TBD label="needs parts" /> : <span className="font-semibold text-emerald-700">{l.toFixed(2)} lb</span>; } },
    { key: 'gtin14', label: 'GTIN', render: (r) => (r.gtin14 ? <Code v={r.gtin14} /> : <TBD label="assign" />) },
    { key: 'net_wt_manual', label: 'Net Wt (sheet)', optional: true, defaultOn: false, group: 'Case detail', render: (r) => (r.net_wt_manual == null || r.net_wt_manual === '' ? <Empty /> : <span>{r.net_wt_manual} lb</span>) },
    { key: 'cube_cuft', label: 'Cube (ft³)', optional: true, defaultOn: false, group: 'Case detail', render: (r) => num(r.cube_cuft) },
    { key: 'ti', label: 'Ti', optional: true, defaultOn: false, group: 'Pallet', render: (r) => num(r.ti) },
    { key: 'hi', label: 'Hi', optional: true, defaultOn: false, group: 'Pallet', render: (r) => num(r.hi) },
    { key: 'cpp', label: 'Cases / Pallet', optional: true, defaultOn: false, group: 'Pallet', value: (r) => casesPerPallet(r) ?? '', render: (r) => { const c = casesPerPallet(r); return c == null ? <TBD /> : <span className="font-semibold text-lime-700">{c}</span>; } },
    { key: 'pallet_size', label: 'Pallet Size', optional: true, defaultOn: false, group: 'Pallet', render: (r) => (r.pallet_size ? <Code v={r.pallet_size} /> : <Empty />) },
    { key: 'shelf_life', label: 'Shelf Life', optional: true, defaultOn: false, group: 'Case detail', render: (r) => r.shelf_life || <Empty /> },
    { key: 'country', label: 'Country', optional: true, defaultOn: false, group: 'Case detail', render: (r) => r.country || <Empty /> },
    { key: 'status', label: 'Status', optional: true, defaultOn: false, group: 'Optional', filterable: true, render: (r) => (r.status ? <span className="text-[10px] px-1.5 py-px rounded bg-emerald-50 text-emerald-700">{r.status}</span> : <Empty />) },
    sampleCol('master_cases', 'case_id'),
    ...(editing ? [actionsCol('mastercase', 'master_cases', 'case_id')] : []),
  ];
  const retail = data.masterCases.filter((m) => m.channel === 'Retail' || m.channel === 'Walmart');
  const wholesale = data.masterCases.filter((m) => m.channel === 'Wholesale');
  const other = data.masterCases.filter((m) => !['Retail', 'Walmart', 'Wholesale'].includes(m.channel));
  return (
    <div>
      <div className="text-[11px] text-gr mb-3 bg-cd border border-lt rounded-lg p-2.5">
        <b>Master Case — the outer pack, by channel.</b> <b>Net weight is derived</b> (green) from composition; dims, gross weight, and GTIN are manual. DTC shipping boxes are out of scope until the e-commerce phase.
      </div>
      {editing && <AddBtn label="+ Add Master Case" onClick={() => setModal({ kind: 'mastercase', row: null })} />}
      <div className="text-[11px] font-bold text-sky-800 uppercase tracking-wide mt-1 mb-1">Retail — Master Cases</div>
      <SpecTable columns={mcCols()} rows={retail} bandLabel="Retail Master Cases" bandColor="#1E5F8A" emptyNote="No retail master cases." />
      <div className="text-[11px] font-bold text-violet-800 uppercase tracking-wide mt-3 mb-1">Wholesale — Master Cases</div>
      <SpecTable columns={mcCols()} rows={wholesale} bandLabel="Wholesale Master Cases" bandColor="#5B3A86" emptyNote="No wholesale master cases." />
      {other.length > 0 && (
        <>
          <div className="text-[11px] font-bold text-gr uppercase tracking-wide mt-3 mb-1">Other channels</div>
          <SpecTable columns={mcCols()} rows={other} bandLabel="Other Master Cases" bandColor="#6B7280" />
        </>
      )}
    </div>
  );
}

// ── Tab 6: Price Lists (over the price_list view, level-grouped columns) ─────
function PricesTab({ data }) {
  const rows = data.priceList || [];
  const cols = [
    { key: 'case_name', label: 'Case Name', render: (r) => r.case_name || <Empty /> },
    { key: 'channel', label: 'Channel', filterable: true, render: (r) => (r.channel ? <span className="text-[10px] px-1.5 py-px rounded bg-violet-50 text-violet-700">{r.channel}</span> : <Empty />) },
    { key: 'unit_qty', label: 'Units', value: (r) => Number(r.unit_qty) || 0, render: (r) => (r.unit_qty == null ? <TBD /> : <span><b className="text-violet-700">{r.unit_qty}</b> <span className="text-[9px] text-gr">{r.composed_of}</span></span>) },
    { key: 'storage', label: 'Storage', optional: true, group: 'Master Case', value: (r) => r.storage || '', render: (r) => <StoragePill v={r.storage} /> },
    { key: 'net_wt_lb_derived', label: 'Net Wt', optional: true, group: 'Master Case', value: (r) => (r.net_wt_lb_derived == null ? -1 : Number(r.net_wt_lb_derived)), render: (r) => (r.net_wt_lb_derived == null ? <TBD /> : <span className="font-semibold text-emerald-700">{Number(r.net_wt_lb_derived).toFixed(2)} lb</span>) },
    { key: 'gtin14', label: 'GTIN', optional: true, defaultOn: false, group: 'Master Case', render: (r) => (r.gtin14 ? <Code v={r.gtin14} /> : <TBD label="assign" />) },
    { key: 'cookie_description', label: 'Cookie', optional: true, group: 'Cookie', value: (r) => r.cookie_description || '', render: (r) => r.cookie_description || <Empty /> },
    { key: 'flavor', label: 'Flavor', optional: true, defaultOn: false, group: 'Cookie', render: (r) => r.flavor || <Empty /> },
    { key: 'tier', label: 'Tier', optional: true, defaultOn: false, group: 'Cookie', filterable: true, render: (r) => <TierPill v={r.tier} /> },
    { key: 'form', label: 'Form', optional: true, defaultOn: false, group: 'Cookie', filterable: true, render: (r) => <FormPill v={r.form} /> },
    { key: 'prep', label: 'Prep', optional: true, defaultOn: false, group: 'Cookie', render: (r) => <PrepPill v={r.prep} /> },
    { key: 'allergens', label: 'Allergens', optional: true, defaultOn: false, group: 'Cookie', render: (r) => r.allergens || <Empty /> },
    { key: 'each_upc', label: 'UPC', optional: true, defaultOn: false, group: 'Each', render: (r) => (r.each_upc ? <Code v={r.each_upc} /> : <Empty />) },
    { key: 'brand', label: 'Brand', optional: true, defaultOn: false, group: 'Each', render: (r) => <BrandPill v={r.brand} /> },
    { key: 'retail_price', label: 'Retail Price', optional: true, defaultOn: false, group: 'Each', render: (r) => (r.retail_price == null ? <TBD /> : <span className="text-green-700">${r.retail_price}</span>) },
    { key: 'list_price', label: 'List Price', render: (r) => (r.list_price == null ? <TBD /> : <span className="font-bold text-green-700">${Number(r.list_price).toFixed(2)}</span>) },
  ];
  return (
    <div>
      <div className="text-[11px] text-gr mb-3 bg-cd border border-lt rounded-lg p-2.5">
        <b>Price Lists — composition views.</b> Each row is a Master Case; packaging + specs are pulled live from the <span className="font-mono">price_list</span> view. Use <b>Columns ▾</b> to add fields by level. Prices show <b>TBD</b> until set.
      </div>
      <SpecTable columns={cols} rows={rows} bandLabel="Price List — one row per master case" bandColor="#7A4F9A" emptyNote="No master cases to price yet." />
    </div>
  );
}
