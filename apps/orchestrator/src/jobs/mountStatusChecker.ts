import { getDb } from '../db/index.js';
import { sendMountCommand, isAgentConnected } from '../websocket/agentHandler.js';
import logger from '../lib/logger.js';
import type { MountCheckResult } from '@ownprem/shared';

// Type guard for MountCheckResult
function isMountCheckResult(data: unknown): data is MountCheckResult {
  return typeof data === 'object' && data !== null && 'mounted' in data;
}

// Check mount status every 60 seconds
const CHECK_INTERVAL = 60 * 1000; // 60 seconds

let checkInterval: NodeJS.Timeout | null = null;

interface ServerMountRow {
  id: string;
  server_id: string;
  mount_id: string;
  mount_point: string;
  options: string | null;
  status: string;
  mount_type: string;
  source: string;
}

/**
 * Check the status of all mounted storage on connected servers.
 * Updates usage_bytes, total_bytes, and status.
 */
export async function checkMountStatuses(): Promise<void> {
  const db = getDb();

  // Get all server_mounts that are in 'mounted' status and the server is online
  const serverMounts = db.prepare(`
    SELECT sm.id, sm.server_id, sm.mount_id, sm.mount_point, sm.options, sm.status,
           m.mount_type, m.source
    FROM server_mounts sm
    JOIN mounts m ON m.id = sm.mount_id
    JOIN servers s ON s.id = sm.server_id
    WHERE sm.status = 'mounted' AND s.agent_status = 'online'
  `).all() as ServerMountRow[];

  if (serverMounts.length === 0) {
    return;
  }

  logger.debug({ count: serverMounts.length }, 'Checking mount statuses');

  // Group by server to batch check operations
  const byServer = new Map<string, ServerMountRow[]>();
  for (const sm of serverMounts) {
    const list = byServer.get(sm.server_id) || [];
    list.push(sm);
    byServer.set(sm.server_id, list);
  }

  // Check each server's mounts
  for (const [serverId, mounts] of byServer) {
    // Verify agent is connected
    if (!isAgentConnected(serverId)) {
      continue;
    }

    for (const sm of mounts) {
      try {
        const commandId = `check-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const result = await sendMountCommand(serverId, {
          id: commandId,
          action: 'checkMount',
          appName: 'storage',
          payload: {
            mountOptions: {
              mountType: sm.mount_type as 'nfs' | 'cifs',
              source: sm.source,
              mountPoint: sm.mount_point,
            },
          },
        });

        if (result.status === 'success' && result.data && isMountCheckResult(result.data)) {
          if (result.data.mounted) {
            db.prepare(`
              UPDATE server_mounts
              SET status = 'mounted',
                  usage_bytes = ?,
                  total_bytes = ?,
                  last_checked = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              result.data.usage?.used ?? null,
              result.data.usage?.total ?? null,
              sm.id
            );
          } else {
            // Mount was unmounted externally
            db.prepare(`
              UPDATE server_mounts
              SET status = 'unmounted',
                  status_message = 'Mount was unmounted externally',
                  usage_bytes = NULL,
                  total_bytes = NULL,
                  last_checked = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(sm.id);
            logger.warn({ serverId, mountPoint: sm.mount_point }, 'Mount was unmounted externally');
          }
        } else {
          db.prepare(`
            UPDATE server_mounts
            SET status = 'error',
                status_message = ?,
                last_checked = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(result.message || 'Check failed', sm.id);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        // Don't update status on transient errors like agent disconnect
        if (errorMessage.includes('Agent not connected') || errorMessage.includes('disconnected')) {
          continue;
        }
        db.prepare(`
          UPDATE server_mounts
          SET status_message = ?,
              last_checked = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(errorMessage, sm.id);
        logger.error({ serverId, mountPoint: sm.mount_point, err }, 'Error checking mount status');
      }
    }
  }
}

/**
 * Start the background mount status checker job.
 * Runs at CHECK_INTERVAL (60 seconds).
 */
export function startMountStatusChecker(): void {
  if (checkInterval) {
    logger.warn('Mount status checker job already running');
    return;
  }

  // Schedule periodic check
  checkInterval = setInterval(() => {
    checkMountStatuses().catch(err => {
      logger.error({ err }, 'Error in mount status checker');
    });
  }, CHECK_INTERVAL);

  logger.info({ intervalMs: CHECK_INTERVAL }, 'Mount status checker job started');
}

/**
 * Stop the background mount status checker job.
 */
export function stopMountStatusChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    logger.info('Mount status checker job stopped');
  }
}
