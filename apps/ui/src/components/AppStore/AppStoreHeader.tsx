import { RefreshCw, Settings, Loader2 } from 'lucide-react';
import { useSyncProgressStore } from '../../stores/useSyncProgressStore';

interface AppStoreHeaderProps {
  appCount: number;
  onSync: () => void;
  isSyncing: boolean;
  syncDisabled?: boolean;
  onOpenSettings?: () => void;
}

export function AppStoreHeader({
  appCount,
  onSync,
  isSyncing,
  syncDisabled = false,
  onOpenSettings,
}: AppStoreHeaderProps) {
  const currentSync = useSyncProgressStore((state) => state.currentSync);

  // Calculate progress percentage
  const progress = currentSync && currentSync.total > 0
    ? Math.round((currentSync.processed / currentSync.total) * 100)
    : 0;

  const showProgress = isSyncing && currentSync;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-muted text-sm">
          {appCount} app{appCount !== 1 ? 's' : ''} available
        </p>
        <div className="flex items-center gap-2">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="btn btn-secondary p-2"
              title="Manage Registries"
            >
              <Settings size={18} />
            </button>
          )}
          <button
            onClick={onSync}
            disabled={isSyncing || syncDisabled}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            {isSyncing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {showProgress ? `${progress}%` : 'Syncing...'}
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Sync
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sync progress bar */}
      {showProgress && (
        <div className="space-y-1">
          <div className="h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted truncate">
            {currentSync.phase === 'fetching' ? (
              `Fetching apps from ${currentSync.registryName}...`
            ) : currentSync.phase === 'processing' ? (
              `Processing ${currentSync.currentApp || '...'} (${currentSync.processed}/${currentSync.total})`
            ) : (
              'Completing...'
            )}
          </p>
        </div>
      )}
    </div>
  );
}
