import { useState } from 'react';
import { Server, MoreVertical, Trash2, RefreshCw, BookOpen } from 'lucide-react';
import { Sparkline } from './MetricsChart';
import type { Server as ServerType } from '../api/client';

interface ServerCardProps {
  server: ServerType;
  /** Show the dropdown menu with actions */
  showMenu?: boolean;
  /** Whether user can manage (delete, regenerate token) */
  canManage?: boolean;
  /** Callbacks for menu actions */
  onViewGuide?: (serverName: string) => void;
  onRegenerateToken?: (serverId: string, serverName: string) => void;
  onDelete?: (serverId: string) => void;
}

/**
 * Reusable server card component showing status and metrics
 */
export function ServerCard({
  server,
  showMenu = false,
  canManage = false,
  onViewGuide,
  onRegenerateToken,
  onDelete,
}: ServerCardProps) {
  const [openMenu, setOpenMenu] = useState(false);

  const showMenuButton = showMenu && canManage && !server.isCore;

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server size={18} className="text-accent" />
          <span className="font-medium">{server.name}</span>
          {server.isCore && (
            <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded">Core</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${
            server.agentStatus === 'online'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {server.agentStatus}
          </span>
          {showMenuButton && (
            <div className="relative">
              <button
                onClick={() => setOpenMenu(!openMenu)}
                className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
              >
                <MoreVertical size={16} />
              </button>
              {openMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-10">
                  <button
                    onClick={() => {
                      setOpenMenu(false);
                      onViewGuide?.(server.name);
                    }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--bg-tertiary)] flex items-center gap-2"
                  >
                    <BookOpen size={14} />
                    Setup Guide
                  </button>
                  <button
                    onClick={() => {
                      setOpenMenu(false);
                      onRegenerateToken?.(server.id, server.name);
                    }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--bg-tertiary)] flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Generate New Token
                  </button>
                  <button
                    onClick={() => {
                      setOpenMenu(false);
                      onDelete?.(server.id);
                    }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-[var(--bg-tertiary)] text-red-400 flex items-center gap-2"
                  >
                    <Trash2 size={14} />
                    Delete Server
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Host */}
      {server.host && (
        <p className="text-sm text-muted mb-3">{server.host}</p>
      )}

      {/* Metrics */}
      {server.agentStatus === 'online' && server.metrics && (
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <span className="text-xs text-muted">CPU</span>
            <div className="text-xs font-medium">{server.metrics.cpuPercent?.toFixed(0)}%</div>
            <div className="flex justify-center mt-1">
              <Sparkline serverId={server.id} metric="cpu" height={24} width={90} />
            </div>
          </div>
          <div className="text-center">
            <span className="text-xs text-muted">Memory</span>
            <div className="text-xs font-medium">
              {(server.metrics.memoryUsed / (1024 * 1024 * 1024)).toFixed(1)}/{(server.metrics.memoryTotal / (1024 * 1024 * 1024)).toFixed(0)}GB
            </div>
            <div className="flex justify-center mt-1">
              <Sparkline serverId={server.id} metric="memory" height={24} width={90} total={server.metrics.memoryTotal} />
            </div>
          </div>
          <div className="text-center">
            <span className="text-xs text-muted">Disk</span>
            <div className="text-xs font-medium">
              {(server.metrics.diskUsed / (1024 * 1024 * 1024)).toFixed(0)}/{(server.metrics.diskTotal / (1024 * 1024 * 1024)).toFixed(0)}GB
            </div>
            <div className="flex justify-center mt-1">
              <Sparkline serverId={server.id} metric="disk" height={24} width={90} total={server.metrics.diskTotal} />
            </div>
          </div>
        </div>
      )}

      {/* Offline state */}
      {server.agentStatus !== 'online' && (
        <p className="text-sm text-muted">Agent offline</p>
      )}
    </div>
  );
}
