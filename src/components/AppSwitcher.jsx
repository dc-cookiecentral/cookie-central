import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Waffle app-switcher. Role-aware: the Cortina sales role sees ONLY Sample
// Central; internal roles (admin/finance/ops) see every app. Apps map to routes.
const APPS = [
  { key: 'dashboard', name: 'Cookie Central', tag: 'Ops dashboard', icon: '📦', bg: '#E7EEF5', to: '/orders', internalOnly: true },
  { key: 'spec', name: 'Spec Sheet', tag: 'BOM engine', icon: '📊', bg: '#F3ECDD', to: '/spec-sheet', internalOnly: true },
  { key: 'sample', name: 'Sample Central', tag: 'Cortina sampling', icon: '🍪', bg: '#FDF0F6', to: '/sample-central', internalOnly: false },
];

export default function AppSwitcher() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isCortina = profile?.role === 'cortina';
  const apps = APPS.filter((a) => !isCortina || !a.internalOnly);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch app"
        className="w-8 h-8 rounded-md border border-lt bg-cd text-gr hover:text-pk flex items-center justify-center text-[15px] leading-none"
      >
        ▦
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 bg-cd border border-lt rounded-xl shadow-xl p-3 w-[260px]">
            <div className="text-[8px] font-bold uppercase tracking-wider text-gr mb-2">Cookie Central · Apps</div>
            <div className="grid grid-cols-2 gap-2">
              {apps.map((a) => (
                <button
                  key={a.key}
                  onClick={() => { setOpen(false); navigate(a.to); }}
                  className="text-left border border-lt rounded-lg p-2 hover:border-pk hover:bg-pc"
                >
                  <div className="w-8 h-8 rounded-md flex items-center justify-center text-[16px] mb-1" style={{ background: a.bg }}>{a.icon}</div>
                  <div className="text-[11px] font-bold text-dk leading-tight">{a.name}</div>
                  <div className="text-[9px] text-gr">{a.tag}</div>
                </button>
              ))}
            </div>
            {isCortina && (
              <div className="text-[9px] text-gr mt-2 pt-2 border-t border-lt">🔒 Internal tools are hidden for your role — Sample Central only.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
