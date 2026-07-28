import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AppSwitcher from './AppSwitcher';

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-bg text-dk font-sans">
      <Sidebar />
      <main className="flex-1 min-w-0 max-h-screen overflow-y-auto">
        <div className="flex justify-end px-[22px] pt-[14px]">
          <AppSwitcher />
        </div>
        <div className="px-[22px] pb-[18px] pt-[6px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
