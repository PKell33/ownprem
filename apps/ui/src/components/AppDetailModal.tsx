import { useState } from 'react';
import { ExternalLink, Play, Square, RotateCw, Trash2, Download, Github, GitBranch, Link, Ban, FileText, Settings, Plus, Server, Shield } from 'lucide-react';
import type { AppManifest, Deployment, Server as ServerType } from '../api/client';
import StatusBadge from './StatusBadge';
import AppIcon from './AppIcon';
import Modal from './Modal';
import ConnectionInfoModal from './ConnectionInfoModal';
import LogViewerModal from './LogViewerModal';
import EditConfigModal from './EditConfigModal';
import CaddyRoutesPanel from './CaddyRoutesPanel';

interface AppDetailModalProps {
  app: AppManifest;
  deployments?: Deployment[];
  servers?: ServerType[];
  conflictsWith?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onInstall?: () => void;
  onStart?: (deploymentId: string) => void;
  onStop?: (deploymentId: string) => void;
  onRestart?: (deploymentId: string) => void;
  onUninstall?: (deploymentId: string) => void;
  onConfigSaved?: () => void;
  canManage?: boolean;
  canOperate?: boolean;
}

type ConfirmAction = {
  type: 'stop' | 'restart' | 'uninstall';
  deploymentId: string;
  serverName: string;
};

export default function AppDetailModal({
  app,
  deployments = [],
  servers = [],
  conflictsWith,
  isOpen,
  onClose,
  onInstall,
  onStart,
  onStop,
  onRestart,
  onUninstall,
  onConfigSaved,
  canManage = true,
  canOperate = true,
}: AppDetailModalProps) {
  const [connectionInfoDeploymentId, setConnectionInfoDeploymentId] = useState<string | null>(null);
  const [logsDeployment, setLogsDeployment] = useState<{ id: string; serverName: string } | null>(null);
  const [editConfigDeployment, setEditConfigDeployment] = useState<Deployment | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const isInstalled = deployments.length > 0;
  const hasServices = app.provides && app.provides.length > 0;
  const isBlocked = !isInstalled && !!conflictsWith;
  const hasEditableConfig = app.configSchema?.some(f => !f.generated && !f.inheritFrom) ?? false;
  const isCaddy = app.name === 'ownprem-caddy';

  // Get server name by ID
  const getServerName = (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    return server?.name || serverId;
  };

  // Check if app can be installed on more servers
  const installedServerIds = deployments.map(d => d.serverId);
  const availableServers = servers.filter(s =>
    s.agentStatus === 'online' && !installedServerIds.includes(s.id)
  );
  const canInstallMore = canManage && availableServers.length > 0 && !conflictsWith;

  const handleConfirmAction = () => {
    if (!confirmAction) return;

    switch (confirmAction.type) {
      case 'stop':
        onStop?.(confirmAction.deploymentId);
        break;
      case 'restart':
        onRestart?.(confirmAction.deploymentId);
        break;
      case 'uninstall':
        onUninstall?.(confirmAction.deploymentId);
        break;
    }
    setConfirmAction(null);
  };

  const getConfirmModalContent = () => {
    if (!confirmAction) return { title: '', message: '', buttonText: '', buttonClass: '' };

    switch (confirmAction.type) {
      case 'stop':
        return {
          title: `Stop ${app.displayName} on ${confirmAction.serverName}?`,
          message: 'The app will be stopped and any active connections will be terminated.',
          buttonText: 'Stop',
          buttonClass: 'bg-yellow-600 hover:bg-yellow-700',
        };
      case 'restart':
        return {
          title: `Restart ${app.displayName} on ${confirmAction.serverName}?`,
          message: 'The app will be restarted. This may briefly interrupt service.',
          buttonText: 'Restart',
          buttonClass: 'bg-blue-600 hover:bg-blue-700',
        };
      case 'uninstall':
        return {
          title: `Uninstall ${app.displayName} from ${confirmAction.serverName}?`,
          message: 'This will remove the app and all its data from this server. This action cannot be undone.',
          buttonText: 'Uninstall',
          buttonClass: 'bg-red-600 hover:bg-red-700',
        };
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="lg">
      <div className="space-y-6">
        {/* Header with Icon and Name */}
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center overflow-hidden flex-shrink-0">
            <AppIcon appName={app.name} size={80} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold">{app.displayName}</h2>
              {app.system && (
                <span className="flex items-center gap-1 text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded">
                  <Shield size={12} />
                  System
                </span>
              )}
              {app.mandatory && (
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                  Auto-installed
                </span>
              )}
            </div>
            <p className="text-muted">v{app.version}</p>
            <p className="text-muted mt-2">{app.description}</p>
          </div>
        </div>

        {/* Conflict Warning */}
        {isBlocked && (
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-900/30 border border-amber-700 text-amber-400 rounded-lg">
            <Ban size={18} />
            <span>Cannot install - conflicts with {conflictsWith}</span>
          </div>
        )}

        {/* Deployments Section */}
        <div className="pt-4 border-t border-[var(--border-color)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[var(--text-secondary)]">
              {isInstalled ? `Installed on ${deployments.length} server${deployments.length !== 1 ? 's' : ''}` : 'Not installed'}
            </h3>
            {canInstallMore && (
              <button
                onClick={onInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent/90 text-slate-900 transition-colors"
              >
                <Plus size={14} />
                Install on Server
              </button>
            )}
            {!isInstalled && !isBlocked && canManage && (
              <button
                onClick={onInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent/90 text-slate-900 transition-colors"
              >
                <Download size={14} />
                Install
              </button>
            )}
          </div>

          {isInstalled && (
            <div className="space-y-2">
              {deployments.map((deployment) => {
                const serverName = getServerName(deployment.serverId);
                const isRunning = deployment.status === 'running';
                const canControl = !['installing', 'configuring', 'uninstalling'].includes(deployment.status);

                return (
                  <div
                    key={deployment.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]"
                  >
                    {/* Server info */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Server size={16} className="text-muted flex-shrink-0" />
                      <span className="font-medium truncate">{serverName}</span>
                      <StatusBadge status={deployment.status} size="sm" />
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Start */}
                      {canControl && canOperate && !isRunning && (
                        <button
                          onClick={() => onStart?.(deployment.id)}
                          title="Start"
                          className="p-1.5 rounded hover:bg-green-600/20 text-green-500 transition-colors"
                        >
                          <Play size={16} />
                        </button>
                      )}

                      {/* Stop - disabled for mandatory system apps */}
                      {canControl && canOperate && isRunning && !app.mandatory && (
                        <button
                          onClick={() => setConfirmAction({ type: 'stop', deploymentId: deployment.id, serverName })}
                          title="Stop"
                          className="p-1.5 rounded hover:bg-yellow-600/20 text-yellow-500 transition-colors"
                        >
                          <Square size={16} />
                        </button>
                      )}

                      {/* Restart */}
                      {canControl && canOperate && isRunning && (
                        <button
                          onClick={() => setConfirmAction({ type: 'restart', deploymentId: deployment.id, serverName })}
                          title="Restart"
                          className="p-1.5 rounded hover:bg-blue-600/20 text-blue-500 transition-colors"
                        >
                          <RotateCw size={16} />
                        </button>
                      )}

                      {/* Web UI */}
                      {app.webui?.enabled && isRunning && (
                        <a
                          href={app.webui.basePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open Web UI"
                          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
                        >
                          <ExternalLink size={16} />
                        </a>
                      )}

                      {/* Connection Info */}
                      {hasServices && canManage && (
                        <button
                          onClick={() => setConnectionInfoDeploymentId(deployment.id)}
                          title="Connection Info"
                          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
                        >
                          <Link size={16} />
                        </button>
                      )}

                      {/* Settings */}
                      {hasEditableConfig && canManage && (
                        <button
                          onClick={() => setEditConfigDeployment(deployment)}
                          title="Settings"
                          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
                        >
                          <Settings size={16} />
                        </button>
                      )}

                      {/* Logs */}
                      {canOperate && (
                        <button
                          onClick={() => setLogsDeployment({ id: deployment.id, serverName })}
                          title="View Logs"
                          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
                        >
                          <FileText size={16} />
                        </button>
                      )}

                      {/* Uninstall - disabled for mandatory system apps */}
                      {canControl && canManage && !app.mandatory && (
                        <button
                          onClick={() => setConfirmAction({ type: 'uninstall', deploymentId: deployment.id, serverName })}
                          title="Uninstall"
                          className="p-1.5 rounded hover:bg-red-600/20 text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      {app.mandatory && (
                        <span
                          title="Cannot uninstall mandatory system app"
                          className="p-1.5 text-gray-600 cursor-not-allowed"
                        >
                          <Trash2 size={16} />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--border-color)]">
          {/* Source */}
          <div>
            <h3 className="text-sm font-medium text-muted mb-3">Source</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted">
                {app.source.type === 'binary' && <Download size={14} />}
                {app.source.type === 'git' && <GitBranch size={14} />}
                <span className="capitalize">{app.source.type}</span>
              </div>
              {app.source.githubRepo && (
                <a
                  href={`https://github.com/${app.source.githubRepo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Github size={14} />
                  {app.source.githubRepo}
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>

          {/* Category */}
          <div>
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Category</h3>
            <span className="inline-block px-3 py-1 bg-[var(--bg-tertiary)] rounded-full text-sm capitalize">
              {app.category}
            </span>
          </div>

          {/* Services Provided */}
          {app.provides && app.provides.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Services Provided</h3>
              <div className="space-y-2">
                {app.provides.map((service) => (
                  <div key={service.name} className="flex items-center justify-between text-sm bg-[var(--bg-primary)] px-3 py-2 rounded-lg">
                    <span className="text-[var(--text-secondary)]">{service.name}</span>
                    <span className="text-muted">:{service.port} ({service.protocol})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dependencies */}
          {app.requires && app.requires.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Dependencies</h3>
              <div className="space-y-2">
                {app.requires.map((req) => (
                  <div key={req.service} className="flex items-center justify-between text-sm bg-[var(--bg-primary)] px-3 py-2 rounded-lg">
                    <span className="text-[var(--text-secondary)]">{req.service}</span>
                    <span className="text-muted text-xs">{req.locality}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conflicts */}
          {app.conflicts && app.conflicts.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Conflicts With</h3>
              <p className="text-xs text-muted mb-2">Only one of these can be installed at a time</p>
              <div className="flex flex-wrap gap-2">
                {app.conflicts.map((conflict) => (
                  <span key={conflict} className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded">
                    {conflict}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resources */}
          {app.resources && (app.resources.minDisk || app.resources.minMemory) && (
            <div>
              <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Requirements</h3>
              <div className="flex gap-4 text-sm text-muted">
                {app.resources.minDisk && <span>Disk: {app.resources.minDisk}</span>}
                {app.resources.minMemory && <span>Memory: {app.resources.minMemory}</span>}
              </div>
            </div>
          )}
        </div>

        {/* App-specific panels */}
        <CaddyRoutesPanel isVisible={isCaddy && isInstalled} />
      </div>

      {/* Confirm Action Modal */}
      {confirmAction && (
        <Modal
          isOpen={!!confirmAction}
          onClose={() => setConfirmAction(null)}
          title={getConfirmModalContent().title}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-[var(--text-secondary)]">
              {getConfirmModalContent().message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className={`flex-1 px-4 py-2 text-white rounded transition-colors ${getConfirmModalContent().buttonClass}`}
              >
                {getConfirmModalContent().buttonText}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Connection Info Modal */}
      {connectionInfoDeploymentId && (
        <ConnectionInfoModal
          deploymentId={connectionInfoDeploymentId}
          isOpen={!!connectionInfoDeploymentId}
          onClose={() => setConnectionInfoDeploymentId(null)}
        />
      )}

      {/* Log Viewer Modal */}
      {logsDeployment && (
        <LogViewerModal
          deploymentId={logsDeployment.id}
          appName={`${app.displayName} (${logsDeployment.serverName})`}
          isOpen={!!logsDeployment}
          onClose={() => setLogsDeployment(null)}
        />
      )}

      {/* Edit Config Modal */}
      {editConfigDeployment && (
        <EditConfigModal
          deployment={editConfigDeployment}
          app={app}
          isOpen={!!editConfigDeployment}
          onClose={() => setEditConfigDeployment(null)}
          onSaved={onConfigSaved}
        />
      )}
    </Modal>
  );
}
