import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import AppSwitcher from './AppSwitcher';

// Below md (768px) the sidebar is a drawer opened from the top bar; from md up
// it is the fixed left column, as before. See Sidebar.jsx.
export default function Layout() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  // Close on navigation (covers back/forward, not just nav taps) and on Escape.
  useEffect(() => { setNavOpen(false); }, [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className="min-h-screen flex bg-bg text-dk font-sans">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {/* dvh, not vh: on phones 100vh includes the browser toolbar and hides the page's bottom. */}
      <main className="flex-1 min-w-0 max-h-screen max-h-[100dvh] overflow-y-auto">
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-2.5 bg-dk">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            className="w-9 h-9 -ml-1 flex items-center justify-center rounded-md text-[#B8A8C8] hover:bg-white/10 text-[20px] leading-none"
          >
            ☰
          </button>
          <div className="text-[16px] font-black italic text-pk">cookie central</div>
          <div className="ml-auto"><AppSwitcher dark /></div>
        </div>
        <div className="hidden md:flex justify-end px-[22px] pt-[14px]">
          <AppSwitcher />
        </div>
        <div className="px-4 md:px-[22px] pb-[18px] pt-3 md:pt-[6px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
