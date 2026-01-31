import { memo } from 'react';
import { Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { Sparkline } from '../MetricsChart';
import MetricItem from './MetricItem';
import { formatBytes } from './utils';
import type { Server } from '../../api/client';

interface ServerCardMetricsProps {
  server: Server;
}

/**
 * Server metrics display showing CPU, RAM, and Disk usage with sparklines.
 */
const ServerCardMetrics = memo(function ServerCardMetrics({ server }: ServerCardMetricsProps) {
  const metrics = server.metrics;

  if (!metrics || server.agentStatus !== 'online') {
    return null;
  }

  return (
    <div className="grid grid-cols-3 gap-1 md:gap-2 mt-2 md:mt-3 pt-2 md:pt-3 border-t border-[var(--border-color)]">
      <MetricItem
        icon={<Cpu size={12} />}
        label="CPU"
        value={`${metrics.cpuPercent}%`}
        sparkline={<Sparkline serverId={server.id} metric="cpu" />}
      />
      <MetricItem
        icon={<MemoryStick size={12} />}
        label="RAM"
        value={formatBytes(metrics.memoryUsed)}
        sparkline={<Sparkline serverId={server.id} metric="memory" total={metrics.memoryTotal} />}
      />
      <MetricItem
        icon={<HardDrive size={12} />}
        label="Disk"
        value={formatBytes(metrics.diskUsed)}
        sparkline={<Sparkline serverId={server.id} metric="disk" total={metrics.diskTotal} />}
      />
    </div>
  );
});

export default ServerCardMetrics;
