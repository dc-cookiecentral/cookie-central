import { NavLink } from 'react-router-dom';
import { useUOM } from '../contexts/UOMContext';
import { useAuth } from '../contexts/AuthContext';

// Mirrors prototype `navItems` order. `kind: 'divider' | 'spacer'` mark visual
// elements that aren't routes.
const NAV = [
  { to: '/weekly',     label: 'Weekly Report' },
  { kind: 'divider' },
  { to: '/orders',     label: 'Product Orders' },
  { to: '/payments',   label: 'Payments' },
  { kind: 'divider' },
  { to: '/inventory',  label: 'Inventory' },
  { to: '/snapshot',   label: 'EOM Snapshot' },
  { kind: 'divider' },
  { kind: 'spacer' },
  { kind: 'divider' },
  { to: '/reference',  label: 'Reference' },
  { to: '/audit',      label: 'Audit Log' },
  { to: '/uploads',    label: 'Uploads' },
];

export default function Sidebar() {
  const { uom, setUom, options } = useUOM();
  const { profile, signOut } = useAuth();

  return (
    <aside className="w-[190px] bg-dk min-h-screen flex flex-col flex-shrink-0">
      <div className="px-[14px] py-[18px] border-b border-[#3D2D4D]">
        <div className="text-[17px] font-black italic text-pk">cookie central</div>
        <div className="text-[8px] text-gr mt-[3px] uppercase tracking-[0.08em]">
          Walmart + Kroger
        </div>
      </div>

      <nav className="px-[6px] py-[8px] flex-1 flex flex-col">
        {NAV.map((n, i) => {
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
