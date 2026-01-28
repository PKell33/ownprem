import { useSystemStatus } from '../hooks/useApi';

export default function Settings() {
  const { data: status } = useSystemStatus();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">Settings</h1>
        <p className="text-gray-400">Configure your Nodefoundry instance</p>
      </div>

      {/* System Info */}
      <section>
        <h2 className="text-lg font-semibold mb-4">System Information</h2>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3">
          <InfoRow label="Status" value={status?.status || 'Unknown'} />
          <InfoRow label="Servers" value={`${status?.servers.online || 0} / ${status?.servers.total || 0} online`} />
          <InfoRow label="Deployments" value={`${status?.deployments.running || 0} / ${status?.deployments.total || 0} running`} />
          <InfoRow label="Last Updated" value={status?.timestamp ? new Date(status.timestamp).toLocaleString() : 'Never'} />
        </div>
      </section>

      {/* Configuration */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Configuration</h2>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <p className="text-gray-400 text-sm">
            Configuration options will be available in a future update.
          </p>
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-lg font-semibold mb-4">About</h2>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3">
          <InfoRow label="Version" value="0.1.0" />
          <InfoRow label="Project" value="Nodefoundry" />
          <div className="pt-2">
            <a
              href="https://github.com/PKell33/nodefoundry"
              target="_blank"
              rel="noopener noreferrer"
              className="text-bitcoin hover:underline text-sm"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
