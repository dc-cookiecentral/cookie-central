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
const NAV = [
  { to: '/weekly',     label: 'Weekly Report', hidden: true },
  { to: '/eos',        label: 'EOS' },
  { kind: 'divider' },
  { to: '/orders',     label: 'Product Orders', hidden: true },
  { to: '/payments',   label: 'Payments', hidden: true },
  { kind: 'divider' },
  { to: '/inventory',  label: 'Inventory' },
  { to: '/snapshot',   label: 'EOM Snapshot', hidden: true },
  { to: '/trace',      label: 'Lot Trace', hidden: true },
  { kind: 'divider' },
  { to: '/spec-sheet',    label: 'Spec Sheet' },
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

export default function Sidebar() {
  const { uom, setUom, options } = useUOM();
  const { profile, signOut } = useAuth();
  const nav = profile?.role === 'cortina' ? CORTINA_NAV : visibleNav(NAV);

  return (
    <aside className="w-[190px] bg-dk min-h-screen flex flex-col flex-shrink-0">
      <div className="px-[14px] py-[18px] border-b border-[#3D2D4D]">
        <div className="text-[17px] font-black italic text-pk">cookie central</div>
        <div className="text-[8px] text-gr mt-[3px] uppercase tracking-[0.08em]">
          Walmart + Kroger
        </div>
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
              className={({ isActive }) =>
                [
                  'block w-full px-[10px] py-[8px] rounded-[7px] text-[12px] mb-px text-left',
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
  );
}
