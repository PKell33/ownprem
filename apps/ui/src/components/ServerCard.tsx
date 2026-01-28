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
      className={`card p-3 md:p-4 ${
        onClick ? 'cursor-pointer card-hover' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2 md:mb-3">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="p-1.5 md:p-2 rounded-lg flex-shrink-0 dark:bg-gray-700 light:bg-gray-100">
            <Server size={18} className={server.isFoundry ? 'text-bitcoin' : 'dark:text-gray-400 light:text-gray-500'} />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-sm md:text-base truncate">{server.name}</h3>
            <p className="text-xs md:text-sm dark:text-gray-400 light:text-gray-500 truncate">
              {server.isFoundry ? 'Orchestrator' : server.host || 'Unknown'}
            </p>
          </div>
        </div>
        <StatusBadge status={server.agentStatus} />
      </div>

      {metrics && server.agentStatus === 'online' && (
        <div className="grid grid-cols-3 gap-1 md:gap-2 mt-2 md:mt-3 pt-2 md:pt-3 border-t dark:border-gray-700 light:border-gray-200">
          <MetricItem
            icon={<Cpu size={12} />}
            label="CPU"
            value={`${metrics.cpuPercent}%`}
          />
          <MetricItem
            icon={<MemoryStick size={12} />}
            label="RAM"
            value={formatBytes(metrics.memoryUsed)}
          />
          <MetricItem
            icon={<HardDrive size={12} />}
            label="Disk"
            value={formatBytes(metrics.diskUsed)}
          />
        </div>
      )}

      <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t dark:border-gray-700 light:border-gray-200 text-xs md:text-sm dark:text-gray-400 light:text-gray-500">
        {deploymentCount} app{deploymentCount !== 1 ? 's' : ''} deployed
      </div>
    </div>
  );
}

function MetricItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 dark:text-gray-400 light:text-gray-500 mb-0.5 md:mb-1">
        {icon}
        <span className="text-[10px] md:text-xs">{label}</span>
      </div>
      <div className="text-xs md:text-sm font-medium">{value}</div>
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
