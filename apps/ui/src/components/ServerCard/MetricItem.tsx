import { memo } from 'react';
import type { MetricItemProps } from './types';

/**
 * Memoized metric display component for CPU, RAM, Disk stats.
 */
const MetricItem = memo(function MetricItem({
  icon,
  label,
  value,
  sparkline
}: MetricItemProps) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-muted mb-0.5 md:mb-1">
        {icon}
        <span className="text-[10px] md:text-xs">{label}</span>
      </div>
      <div className="text-xs md:text-sm font-medium">{value}</div>
      {sparkline && <div className="flex justify-center mt-1">{sparkline}</div>}
    </div>
  );
});

export default MetricItem;
