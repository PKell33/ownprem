import { memo } from 'react';
import AppIcon from '../AppIcon';
import type { AppSelectButtonProps } from './types';

/**
 * Memoized button for selecting an app in the Add App modal.
 */
const AppSelectButton = memo(function AppSelectButton({
  app,
  onSelect,
}: AppSelectButtonProps) {
  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
        app.system
          ? 'border-purple-500/30 hover:border-purple-500 hover:bg-purple-500/10'
          : 'border-[var(--border-color)] hover:border-accent hover:bg-accent/5'
      }`}
    >
      <AppIcon appName={app.name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate flex items-center gap-2">
          {app.displayName}
          {app.system && (
            <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">System</span>
          )}
        </div>
        <div className="text-xs text-muted truncate">{app.description}</div>
      </div>
    </button>
  );
});

export default AppSelectButton;
