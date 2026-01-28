import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Server, Package, Settings, Wifi, WifiOff } from 'lucide-react';
import { useStore } from '../stores/useStore';

export default function Layout() {
  const connected = useStore((state) => state.connected);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span className="text-bitcoin">N</span>odefoundry
          </h1>
        </div>

        <nav className="p-4 space-y-2">
          <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" />
          <NavItem to="/servers" icon={<Server size={20} />} label="Servers" />
          <NavItem to="/apps" icon={<Package size={20} />} label="Apps" />
          <NavItem to="/settings" icon={<Settings size={20} />} label="Settings" />
        </nav>

        <div className="absolute bottom-0 left-0 w-64 p-4 border-t border-gray-700">
          <div className="flex items-center gap-2 text-sm">
            {connected ? (
              <>
                <Wifi size={16} className="text-green-500" />
                <span className="text-gray-400">Connected</span>
              </>
            ) : (
              <>
                <WifiOff size={16} className="text-red-500" />
                <span className="text-gray-400">Disconnected</span>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          isActive
            ? 'bg-gray-700 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
