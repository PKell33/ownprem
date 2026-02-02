import type { Server as SocketServer } from 'socket.io';

/**
 * WebSocket instance holder and broadcast utilities.
 * Extracted to break circular dependency between agentHandler.ts, commandDispatcher.ts, and index.ts.
 */

let io: SocketServer | null = null;

/**
 * Set the WebSocket server instance.
 * Called by websocket/index.ts during initialization.
 */
export function setIo(server: SocketServer | null): void {
  io = server;
}

/**
 * Get the WebSocket server instance.
 */
export function getIo(): SocketServer {
  if (!io) {
    throw new Error('WebSocket server not initialized');
  }
  return io;
}

/**
 * Broadcast deployment status change to authenticated UI clients only.
 * Sensitive information should not be exposed to unauthenticated connections.
 */
export function broadcastDeploymentStatus(data: {
  deploymentId: string;
  appName: string;
  serverId: string;
  status: string;
  previousStatus?: string;
  routeActive?: boolean;
}): void {
  if (io) {
    // Emit only to authenticated clients (joined 'authenticated' room)
    io.to('authenticated').emit('deployment:status', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}

// ==================== Sync Progress Events ====================

export interface SyncProgressData {
  syncId: string;
  storeType: string;
  registryId: string;
  registryName: string;
  phase: 'fetching' | 'processing' | 'complete';
  currentApp?: string;
  processed: number;
  total: number;
  errors: string[];
}

export interface SyncCompleteData {
  syncId: string;
  storeType: string;
  registryId: string;
  registryName: string;
  synced: number;
  updated: number;
  removed: number;
  errors: string[];
  duration: number;
}

/**
 * Broadcast sync progress to authenticated UI clients.
 */
export function broadcastSyncProgress(data: SyncProgressData): void {
  if (io) {
    io.to('authenticated').emit('sync:progress', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Broadcast sync completion to authenticated UI clients.
 */
export function broadcastSyncComplete(data: SyncCompleteData): void {
  if (io) {
    io.to('authenticated').emit('sync:complete', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}
