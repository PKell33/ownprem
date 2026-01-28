import { Server, Cpu, HardDrive, MemoryStick } from 'lucide-react';
import type { Server as ServerType } from '../api/client';
import StatusBadge from './StatusBadge';

interface ServerCardProps {
  server: ServerType;
  deploymentCount?: number;
  onClick?: () => void;
}

export default function ServerCard({ server, deploymentCount = 0, onClick }: ServerCardProps) {
  const metrics = server.metrics;

  return (
    <div
      onClick={onClick}
      className={`bg-gray-800 rounded-lg p-4 border border-gray-700 ${
        onClick ? 'cursor-pointer hover:border-gray-600 transition-colors' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-700 rounded-lg">
            <Server size={20} className={server.isFoundry ? 'text-bitcoin' : 'text-gray-400'} />
          </div>
          <div>
            <h3 className="font-medium">{server.name}</h3>
            <p className="text-sm text-gray-400">
              {server.isFoundry ? 'Orchestrator' : server.host || 'Unknown'}
            </p>
          </div>
        </div>
        <StatusBadge status={server.agentStatus} />
      </div>

      {metrics && server.agentStatus === 'online' && (
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-700">
          <MetricItem
            icon={<Cpu size={14} />}
            label="CPU"
            value={`${metrics.cpuPercent}%`}
          />
          <MetricItem
            icon={<MemoryStick size={14} />}
            label="RAM"
            value={formatBytes(metrics.memoryUsed)}
          />
          <MetricItem
            icon={<HardDrive size={14} />}
            label="Disk"
            value={formatBytes(metrics.diskUsed)}
          />
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-700 text-sm text-gray-400">
        {deploymentCount} app{deploymentCount !== 1 ? 's' : ''} deployed
      </div>
    </div>
  );
}

function MetricItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
