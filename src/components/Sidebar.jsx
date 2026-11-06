import { NavLink } from 'react-router-dom';
import { useUOM } from '../contexts/UOMContext';
import { useAuth } from '../contexts/AuthContext';

// Mirrors prototype `navItems` order. `kind: 'divider' | 'spacer'` mark visual
// elements that aren't routes.
//
// `hidden: true` keeps an item out of the sidebar while leaving its ROUTE
// intact — the page is still reachable by typing the URL, which is what makes
// it possible to rework one without shipping it to everyone first. Hidden
// pending a rework (Aug 21 2026): Weekly Report, Product Orders, Payments,
// EOM Snapshot, Lot Trace. Delete the flag to bring one back; nothing else
// needs changing.
//
// ⚠️ HIDDEN IS NOT DEAD — DO NOT DELETE THESE PAGES OR THEIR PARSERS.
// Product Orders and the BOL flow are expected back around Oct 2026 with
// substantial changes (Caroline, Aug 23). The `systems@` email reader that
// feeds them is being KEPT, so `useGmail`, `InboxCard` and
// `src/parsers/cortinaPO.js` all stay live and in use.
//
// The one genuinely retired feed is the **weekly Bentonville Retail Link
// email** — `weekly_reports` stopped at 2026-07-06. Its parsers
// (`parsers/weeklyEmail.js`, `parsers/weeklyAttachments.js`) are kept anyway:
// they encode the real column names of the Walmart BI exports, which survive a
// change of transport.
const NAV = [
  { to: '/weekly',     label: 'Weekly Report', hidden: true },
  { to: '/eos',        label: 'EOS' },
  { to: '/demand-planner', label: 'Demand Planner' },
  { kind: 'divider' },
  { to: '/orders',     label: 'Product Orders', hidden: true },
  { to: '/payments',   label: 'Payments', hidden: true },
  { kind: 'divider' },
  { to: '/inventory',  label: 'Inventory' },
  { to: '/snapshot',   label: 'EOM Snapshot', hidden: true },
  { kind: 'divider' },
  { to: '/spec-sheet',    label: 'Spec Sheet' },
  { to: '/supplies',      label: 'Supplies & Vendors' },
  { to: '/sample-central', label: 'Sample Central' },
  { kind: 'spacer' },
  { kind: 'divider' },
  { to: '/reference',  label: 'Reference' },
  { to: '/audit',      label: 'Audit Log' },
  { to: '/uploads',    label: 'Uploads' },
];

// Drop hidden items, then collapse the dividers they orphaned — hiding four of
// the six routed items leaves runs of adjacent rules and a leading one, which
// read as broken chrome rather than as deliberate grouping.
function visibleNav(items) {
  const kept = items.filter((n) => !n.hidden);
  return kept.filter((n, i) => {
    if (n.kind !== 'divider') return true;
    const prev = kept.slice(0, i).reverse().find((x) => x.kind !== 'spacer');
    const next = kept.slice(i + 1).find((x) => x.kind !== 'spacer');
    return prev && next && prev.kind !== 'divider';
  });
}

// The Cortina sales role sees only Sample Central (role gate, Task 2.7).
const CORTINA_NAV = [{ to: '/sample-central', label: 'Sample Central' }];

// Desktop (md, 768px and up): a fixed 190px column, unchanged.
// Phone and narrow tablet: hidden off-canvas; Layout's top bar opens it as a
// drawer over the page (Nov 6 2026 — at 390px the fixed column left the page
// half the screen and cut it off on the right). `open` / `onClose` come from
// Layout; a nav tap closes it.
export default function Sidebar({ open = false, onClose = () => {} }) {
  const { uom, setUom, options } = useUOM();
  const { profile, signOut } = useAuth();
  const nav = profile?.role === 'cortina' ? CORTINA_NAV : visibleNav(NAV);

  return (
    <>
    {open && (
      <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />
    )}
    <aside
      id="app-sidebar"
      className={[
        'w-[230px] md:w-[190px] bg-dk flex flex-col flex-shrink-0',
        'fixed inset-y-0 left-0 z-50 overflow-y-auto transition-[transform,visibility] duration-200',
        'md:static md:min-h-screen md:overflow-visible md:translate-x-0 md:visible md:transition-none',
        open ? 'translate-x-0 visible shadow-2xl' : '-translate-x-full invisible',
      ].join(' ')}
    >
      <div className="px-[14px] py-[18px] border-b border-[#3D2D4D] flex items-start justify-between">
        <div>
        <div className="text-[17px] font-black italic text-pk">cookie central</div>
        <div className="text-[8px] text-gr mt-[3px] uppercase tracking-[0.08em]">
          Walmart + Kroger
        </div>
        </div>
        <button onClick={onClose} aria-label="Close menu"
          className="md:hidden -mr-1 -mt-1 w-9 h-9 flex items-center justify-center rounded-md text-[#B8A8C8] hover:bg-white/10 text-[20px] leading-none">
          ×
        </button>
      </div>

      <nav className="px-[6px] py-[8px] flex-1 flex flex-col">
        {nav.map((n, i) => {
          if (n.kind === 'divider') {
            return <div key={`d${i}`} className="h-px bg-[#3D2D4D] mx-[8px] my-[5px]" />;
          }
          if (n.kind === 'spacer') {
            return <div key={`s${i}`} className="flex-1" />;
          }
          return (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  'block w-full px-[10px] py-[11px] md:py-[8px] rounded-[7px] text-[14px] md:text-[12px] mb-px text-left',
                  isActive
                    ? 'bg-[rgba(194,24,91,0.15)] text-pk font-bold'
                    : 'bg-transparent text-[#B8A8C8] font-medium hover:bg-[rgba(194,24,91,0.08)]',
                ].join(' ')
              }
            >
              {n.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-[12px] py-[8px] border-t border-[#3D2D4D]">
        <div className="text-[7px] text-gr uppercase mb-[4px]">UOM</div>
        <div className="flex flex-wrap gap-[2px]">
          {options.map((u) => (
            <button
              key={u}
              onClick={() => setUom(u)}
              className={[
                'px-[6px] py-[2px] rounded text-[8px]',
                uom === u
                  ? 'bg-[rgba(194,24,91,0.2)] text-pk font-bold'
                  : 'bg-transparent text-[#B8A8C8] font-normal',
              ].join(' ')}
            >
              {u}
            </button>
          ))}
        </div>

        {profile && (
          <div className="mt-3 text-[8px] text-[#7D6D8D] leading-snug">
            <div className="text-[#B8A8C8] font-semibold">{profile.full_name}</div>
            <div className="capitalize">{profile.role}</div>
            <button
              onClick={signOut}
              className="mt-1 text-pk hover:text-pm underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
