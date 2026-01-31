import { useState, useCallback, useMemo, memo } from 'react';
import { Plus } from 'lucide-react';
import type { Deployment, AppManifest } from '../../api/client';
import AppDetailModal from '../AppDetailModal';
import ConnectionInfoModal from '../ConnectionInfoModal';
import LogViewerModal from '../LogViewerModal';
import EditConfigModal from '../EditConfigModal';
import InstallModal from '../InstallModal';
import ServerCardHeader from './ServerCardHeader';
import ServerCardMetrics from './ServerCardMetrics';
import DeploymentItem from './DeploymentItem';
import ConfirmActionModal from './modals/ConfirmActionModal';
import AddAppModal from './modals/AddAppModal';
import type { ServerCardProps, ConfirmAction } from './types';

/**
 * ServerCard - Displays server info, metrics, and deployed apps.
 * Wrapped in React.memo to prevent re-renders when parent state changes
 * but this server's data hasn't changed.
 */
const ServerCard = memo(function ServerCard({
  server,
  deployments = [],
  apps = [],
  onClick,
  onDelete,
  onRegenerate,
  onViewGuide,
  onStartApp,
  onStopApp,
  onRestartApp,
  onUninstallApp,
  canManage = false,
  canOperate = false,
}: ServerCardProps) {
  // Modal states
  const [selectedApp, setSelectedApp] = useState<{ app: AppManifest; deployment: Deployment } | null>(null);
  const [connectionInfoDeployment, setConnectionInfoDeployment] = useState<Deployment | null>(null);
  const [logsDeployment, setLogsDeployment] = useState<{ deployment: Deployment; appName: string } | null>(null);
  const [editConfigData, setEditConfigData] = useState<{ deployment: Deployment; app: AppManifest } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [showAddAppModal, setShowAddAppModal] = useState(false);
  const [installAppName, setInstallAppName] = useState<string | null>(null);

  // Memoize computed values
  const installedAppNames = useMemo(() => deployments.map(d => d.appName), [deployments]);

  const availableApps = useMemo(() =>
    apps.filter(app => !installedAppNames.includes(app.name) && !app.mandatory),
    [apps, installedAppNames]
  );

  const sortedDeployments = useMemo(() => {
    const getApp = (appName: string) => apps.find(a => a.name === appName);
    return [...deployments].sort((a, b) => {
      const appA = getApp(a.appName);
      const appB = getApp(b.appName);
      if (appA?.system && !appB?.system) return -1;
      if (!appA?.system && appB?.system) return 1;
      return 0;
    });
  }, [deployments, apps]);

  // Callbacks
  const getAppForDeployment = useCallback((appName: string): AppManifest | undefined => {
    return apps.find(a => a.name === appName);
  }, [apps]);

  const handleAppClick = useCallback((deployment: Deployment, e: React.MouseEvent) => {
    e.stopPropagation();
    const app = getAppForDeployment(deployment.appName);
    if (app) {
      setSelectedApp({ app, deployment });
    }
  }, [getAppForDeployment]);

  const handleConfirmAction = useCallback(() => {
    if (!confirmAction) return;
    switch (confirmAction.type) {
      case 'stop':
        onStopApp?.(confirmAction.deploymentId);
        break;
      case 'restart':
        onRestartApp?.(confirmAction.deploymentId);
        break;
      case 'uninstall':
        onUninstallApp?.(confirmAction.deploymentId, confirmAction.appName);
        break;
    }
    setConfirmAction(null);
  }, [confirmAction, onStopApp, onRestartApp, onUninstallApp]);

  const handleAddAppClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAddAppModal(true);
  }, []);

  const handleSelectApp = useCallback((appName: string) => {
    setShowAddAppModal(false);
    setInstallAppName(appName);
  }, []);

  // Handle keyboard activation for card
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  }, [onClick]);

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? `View ${server.name} details` : undefined}
      className={`card p-3 md:p-4 ${onClick ? 'cursor-pointer card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]' : ''}`}
    >
      <ServerCardHeader
        server={server}
        canManage={canManage}
        onDelete={onDelete}
        onRegenerate={onRegenerate}
        onViewGuide={onViewGuide}
      />

      <ServerCardMetrics server={server} />

      {/* Deployments section */}
      <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-[var(--border-color)]">
        {sortedDeployments.length > 0 ? (
          <div className="space-y-2">
            {sortedDeployments.map((deployment) => (
              <DeploymentItem
                key={deployment.id}
                deployment={deployment}
                app={getAppForDeployment(deployment.appName)}
                canManage={canManage}
                canOperate={canOperate}
                onAppClick={handleAppClick}
                onStartApp={onStartApp}
                onSetConfirmAction={setConfirmAction}
                onSetConnectionInfo={setConnectionInfoDeployment}
                onSetLogsDeployment={setLogsDeployment}
                onSetEditConfigData={setEditConfigData}
              />
            ))}
          </div>
        ) : (
          <span className="text-xs md:text-sm text-muted">No apps deployed</span>
        )}

        {/* Add App Button */}
        {canManage && server.agentStatus === 'online' && availableApps.length > 0 && (
          <button
            onClick={handleAddAppClick}
            className="w-full mt-2 px-3 py-2 flex items-center justify-center gap-2 text-sm rounded-lg border border-dashed border-[var(--border-color)] hover:border-accent hover:text-accent transition-colors text-muted"
          >
            <Plus size={16} />
            Add App
          </button>
        )}
      </div>

      {/* Modals - conditionally rendered to prevent race conditions */}
      {selectedApp && (
        <AppDetailModal
          app={selectedApp.app}
          deployments={[selectedApp.deployment]}
          servers={[server]}
          isOpen={true}
          onClose={() => setSelectedApp(null)}
          canManage={canManage}
          canOperate={canOperate}
          onStart={(deploymentId) => onStartApp?.(deploymentId)}
          onStop={(deploymentId) => {
            setConfirmAction({ type: 'stop', deploymentId, appName: selectedApp.app.displayName });
          }}
          onRestart={(deploymentId) => {
            setConfirmAction({ type: 'restart', deploymentId, appName: selectedApp.app.displayName });
          }}
          onUninstall={(deploymentId) => {
            setConfirmAction({ type: 'uninstall', deploymentId, appName: selectedApp.app.displayName });
          }}
        />
      )}

      {confirmAction && (
        <ConfirmActionModal
          action={confirmAction}
          onConfirm={handleConfirmAction}
          onClose={() => setConfirmAction(null)}
        />
      )}

      {connectionInfoDeployment && (
        <ConnectionInfoModal
          deploymentId={connectionInfoDeployment.id}
          isOpen={true}
          onClose={() => setConnectionInfoDeployment(null)}
        />
      )}

      {logsDeployment && (
        <LogViewerModal
          deploymentId={logsDeployment.deployment.id}
          appName={logsDeployment.appName}
          isOpen={true}
          onClose={() => setLogsDeployment(null)}
        />
      )}

      {editConfigData && (
        <EditConfigModal
          deployment={editConfigData.deployment}
          app={editConfigData.app}
          isOpen={true}
          onClose={() => setEditConfigData(null)}
        />
      )}

      {showAddAppModal && (
        <AddAppModal
          serverName={server.name}
          availableApps={availableApps}
          onSelectApp={handleSelectApp}
          onClose={() => setShowAddAppModal(false)}
        />
      )}

      {installAppName && (
        <InstallModal
          appName={installAppName}
          servers={[server]}
          onClose={() => setInstallAppName(null)}
        />
      )}
    </div>
  );
});

export default ServerCard;
