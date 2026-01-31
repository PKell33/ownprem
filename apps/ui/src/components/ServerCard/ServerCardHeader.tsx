import { memo, useState, useCallback } from 'react';
import { Server, MoreVertical, FileText, KeyRound, Trash2, Network } from 'lucide-react';
import StatusBadge from '../StatusBadge';
import type { Server as ServerType } from '../../api/client';

interface ServerCardHeaderProps {
  server: ServerType;
  canManage: boolean;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onViewGuide?: () => void;
}

/**
 * Server header with name, status, and dropdown menu.
 */
const ServerCardHeader = memo(function ServerCardHeader({
  server,
  canManage,
  onDelete,
  onRegenerate,
  onViewGuide,
}: ServerCardHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const handleMenuToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(prev => !prev);
    setConfirmDelete(false);
    setConfirmRegenerate(false);
  }, []);

  const handleMenuClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    setConfirmDelete(false);
    setConfirmRegenerate(false);
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete?.();
      setConfirmDelete(false);
      setShowMenu(false);
    } else {
      setConfirmDelete(true);
      setConfirmRegenerate(false);
    }
  }, [confirmDelete, onDelete]);

  const handleViewGuide = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onViewGuide?.();
    setShowMenu(false);
  }, [onViewGuide]);

  const handleRegenerate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      setConfirmDelete(false);
      return;
    }
    onRegenerate?.();
    setConfirmRegenerate(false);
    setShowMenu(false);
  }, [confirmRegenerate, onRegenerate]);

  return (
    <div className="flex items-start justify-between mb-2 md:mb-3">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <div className="p-1.5 md:p-2 rounded-lg flex-shrink-0 bg-[var(--bg-secondary)]">
          <Server size={18} className={server.isCore ? 'text-accent' : 'text-muted'} />
        </div>
        <div className="min-w-0">
          <h3 className="font-medium text-sm md:text-base truncate">{server.name}</h3>
          <p className="text-xs md:text-sm text-muted truncate">
            {server.isCore ? 'Orchestrator' : server.host || 'Unknown'}
          </p>
          {server.networkInfo?.ipAddress && (
            <p className="text-xs text-muted truncate flex items-center gap-1">
              <Network size={10} className="flex-shrink-0" />
              <span>{server.networkInfo.ipAddress}</span>
              {server.networkInfo.macAddress && (
                <span className="opacity-60">({server.networkInfo.macAddress})</span>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={server.agentStatus} />
        {canManage && !server.isCore && (
          <div className="relative">
            <button
              onClick={handleMenuToggle}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
              aria-label="Server options menu"
              aria-expanded={showMenu}
              aria-haspopup="menu"
            >
              <MoreVertical size={16} aria-hidden="true" />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={handleMenuClose}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="Server actions"
                  className="absolute right-0 top-full mt-1 z-20 py-1 rounded-lg shadow-lg min-w-[180px]
                    bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                >
                  <button
                    onClick={handleViewGuide}
                    role="menuitem"
                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors
                      text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                  >
                    <FileText size={14} aria-hidden="true" />
                    Setup Guide
                  </button>
                  <button
                    onClick={handleRegenerate}
                    role="menuitem"
                    className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors
                      ${confirmRegenerate
                        ? 'text-yellow-500 hover:bg-yellow-500/10'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                  >
                    <KeyRound size={14} aria-hidden="true" />
                    {confirmRegenerate ? 'Confirm (invalidates token)' : 'Generate New Token'}
                  </button>
                  <div className="my-1 border-t border-[var(--border-color)]" role="separator" />
                  <button
                    onClick={handleDelete}
                    role="menuitem"
                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors
                      text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {confirmDelete ? 'Confirm Delete' : 'Delete Server'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ServerCardHeader;
