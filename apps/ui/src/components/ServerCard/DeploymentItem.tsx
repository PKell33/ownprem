import { memo, useCallback } from 'react';
import { Play, Square, RotateCw, ExternalLink, Link, Settings, FileText, Trash2 } from 'lucide-react';
import StatusBadge from '../StatusBadge';
import AppIcon from '../AppIcon';
import { formatAppName } from './utils';
import type { DeploymentItemProps } from './types';

/**
 * Memoized deployment item - prevents re-render when other deployments change.
 * Displays a single deployed app with action buttons.
 */
const DeploymentItem = memo(function DeploymentItem({
  deployment,
  app,
  canManage,
  canOperate,
  onAppClick,
  onStartApp,
  onSetConfirmAction,
  onSetConnectionInfo,
  onSetLogsDeployment,
  onSetEditConfigData,
}: DeploymentItemProps) {
  const appDisplayName = app?.displayName || formatAppName(deployment.appName);
  const isRunning = deployment.status === 'running';
  const canControl = !['installing', 'configuring', 'uninstalling'].includes(deployment.status);
  const hasServices = app?.provides && app.provides.length > 0;
  const hasEditableConfig = app?.configSchema?.some(f => !f.generated && !f.inheritFrom) ?? false;
  const isSystemApp = app?.system ?? false;

  const handleStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onStartApp?.(deployment.id);
  }, [onStartApp, deployment.id]);

  const handleStop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSetConfirmAction({ type: 'stop', deploymentId: deployment.id, appName: appDisplayName });
  }, [onSetConfirmAction, deployment.id, appDisplayName]);

  const handleRestart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSetConfirmAction({ type: 'restart', deploymentId: deployment.id, appName: appDisplayName });
  }, [onSetConfirmAction, deployment.id, appDisplayName]);

  const handleUninstall = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSetConfirmAction({ type: 'uninstall', deploymentId: deployment.id, appName: appDisplayName });
  }, [onSetConfirmAction, deployment.id, appDisplayName]);

  const handleConnectionInfo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSetConnectionInfo(deployment);
  }, [onSetConnectionInfo, deployment]);

  const handleLogs = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSetLogsDeployment({ deployment, appName: appDisplayName });
  }, [onSetLogsDeployment, deployment, appDisplayName]);

  const handleSettings = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (app) {
      onSetEditConfigData({ deployment, app });
    }
  }, [onSetEditConfigData, deployment, app]);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg ${
        isSystemApp
          ? 'bg-purple-500/10 border border-purple-500/20'
          : 'bg-[var(--bg-secondary)]'
      }`}
    >
      {/* App icon - clickable */}
      <button
        onClick={(e) => onAppClick(deployment, e)}
        className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity"
        title={`View ${appDisplayName} details`}
      >
        <AppIcon appName={deployment.appName} size={20} />
        <span className="text-sm">{appDisplayName}</span>
        <StatusBadge status={deployment.status} size="sm" />
      </button>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Start button */}
        {canControl && canOperate && !isRunning && (
          <button
            onClick={handleStart}
            aria-label={`Start ${appDisplayName}`}
            className="p-1.5 rounded hover:bg-green-600/20 text-green-500 transition-colors"
          >
            <Play size={14} aria-hidden="true" />
          </button>
        )}

        {/* Stop button */}
        {canControl && canOperate && isRunning && (
          <button
            onClick={handleStop}
            aria-label={`Stop ${appDisplayName}`}
            className="p-1.5 rounded hover:bg-yellow-600/20 text-yellow-500 transition-colors"
          >
            <Square size={14} aria-hidden="true" />
          </button>
        )}

        {/* Restart button */}
        {canControl && canOperate && isRunning && (
          <button
            onClick={handleRestart}
            aria-label={`Restart ${appDisplayName}`}
            className="p-1.5 rounded hover:bg-blue-600/20 text-blue-500 transition-colors"
          >
            <RotateCw size={14} aria-hidden="true" />
          </button>
        )}

        {/* Open Web UI */}
        {app?.webui?.enabled && isRunning && (
          <a
            href={app.webui.basePath}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Open ${appDisplayName} web interface`}
            className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
          >
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}

        {/* Connection Info */}
        {hasServices && canManage && (
          <button
            onClick={handleConnectionInfo}
            aria-label={`View ${appDisplayName} connection info`}
            className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
          >
            <Link size={14} aria-hidden="true" />
          </button>
        )}

        {/* Settings */}
        {hasEditableConfig && canManage && app && (
          <button
            onClick={handleSettings}
            aria-label={`${appDisplayName} settings`}
            className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
          >
            <Settings size={14} aria-hidden="true" />
          </button>
        )}

        {/* View Logs */}
        {canOperate && (
          <button
            onClick={handleLogs}
            aria-label={`View ${appDisplayName} logs`}
            className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
          >
            <FileText size={14} aria-hidden="true" />
          </button>
        )}

        {/* Uninstall button - hidden for mandatory system apps */}
        {canControl && canManage && !app?.mandatory && (
          <button
            onClick={handleUninstall}
            aria-label={`Uninstall ${appDisplayName}`}
            className="p-1.5 rounded hover:bg-red-600/20 text-red-500 transition-colors"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
});

export default DeploymentItem;
