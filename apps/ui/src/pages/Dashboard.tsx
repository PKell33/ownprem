import { Link } from 'react-router-dom';
import { Server, Package, Activity, ExternalLink } from 'lucide-react';
import { useServers, useDeployments, useSystemStatus } from '../hooks/useApi';
import ServerCard from '../components/ServerCard';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const { data: servers, isLoading: serversLoading } = useServers();
  const { data: deployments, isLoading: deploymentsLoading } = useDeployments();
  const { data: status } = useSystemStatus();

  const runningDeployments = deployments?.filter((d) => d.status === 'running') || [];
  const appsWithWebUI = runningDeployments.filter((d) => {
    // We'd need the manifest to know if it has webui
    // For now, check common apps
    return ['mempool', 'rtl', 'thunderhub', 'mock-app'].includes(d.appName);
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-400">Overview of your Bitcoin infrastructure</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Server className="text-bitcoin" />}
          label="Servers"
          value={status?.servers.online || 0}
          subtext={`of ${status?.servers.total || 0} online`}
        />
        <StatCard
          icon={<Package className="text-green-500" />}
          label="Running Apps"
          value={status?.deployments.running || 0}
          subtext={`of ${status?.deployments.total || 0} deployed`}
        />
        <StatCard
          icon={<Activity className="text-blue-500" />}
          label="Status"
          value={status?.status === 'ok' ? 'Healthy' : 'Issues'}
          subtext="System status"
        />
      </div>

      {/* Servers */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Servers</h2>
          <Link to="/servers" className="text-sm text-gray-400 hover:text-white">
            View all
          </Link>
        </div>

        {serversLoading ? (
          <div className="text-gray-400">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers?.slice(0, 3).map((server) => {
              const serverDeployments = deployments?.filter((d) => d.serverId === server.id) || [];
              return (
                <ServerCard
                  key={server.id}
                  server={server}
                  deploymentCount={serverDeployments.length}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Apps with Web UI */}
      {appsWithWebUI.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Apps with Web UI</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {appsWithWebUI.map((deployment) => (
              <a
                key={deployment.id}
                href={`/apps/${deployment.appName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium capitalize">{deployment.appName}</span>
                  <ExternalLink size={16} className="text-gray-400" />
                </div>
                <div className="text-sm text-gray-400">{deployment.serverId}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Recent Deployments */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">All Deployments</h2>
          <Link to="/apps" className="text-sm text-gray-400 hover:text-white">
            Manage apps
          </Link>
        </div>

        {deploymentsLoading ? (
          <div className="text-gray-400">Loading...</div>
        ) : deployments?.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
            <Package size={48} className="mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400 mb-4">No apps deployed yet</p>
            <Link
              to="/apps"
              className="inline-flex items-center gap-2 px-4 py-2 bg-bitcoin hover:bg-bitcoin/90 text-black font-medium rounded transition-colors"
            >
              Browse Apps
            </Link>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">App</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Server</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Version</th>
                </tr>
              </thead>
              <tbody>
                {deployments?.map((deployment) => (
                  <tr key={deployment.id} className="border-b border-gray-700/50 last:border-0">
                    <td className="px-4 py-3 font-medium">{deployment.appName}</td>
                    <td className="px-4 py-3 text-gray-400">{deployment.serverId}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={deployment.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-gray-400">{deployment.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext: string;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-500">{subtext}</div>
    </div>
  );
}
