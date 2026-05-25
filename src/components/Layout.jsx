import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-bg text-dk font-sans">
      <Sidebar />
      <main className="flex-1 min-w-0 max-h-screen overflow-y-auto">
        <div className="px-[22px] py-[18px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
