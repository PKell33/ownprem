import type { Socket, Server as SocketServer } from 'socket.io';
import { timingSafeEqual, createHash } from 'crypto';
import { getDb, runInTransaction } from '../db/index.js';
import { wsLogger } from '../lib/logger.js';
import { mutexManager } from '../lib/mutexManager.js';
import { authService } from '../services/authService.js';
import { proxyManager } from '../services/proxyManager.js';
import { broadcastDeploymentStatus } from './index.js';
import type { AgentStatusReport, CommandResult, CommandAck, ServerMetrics, LogResult, LogStreamLine, LogStreamStatus, MountCheckResult } from '@ownprem/shared';

// Type guard for MountCheckResult
function isMountCheckResult(data: unknown): data is MountCheckResult {
  return typeof data === 'object' && data !== null && 'mounted' in data;
}

interface AgentAuth {
  serverId?: string;
  token?: string | null;
}

// Track browser client connections
const browserClients = new Set<Socket>();

interface ServerRow {
  id: string;
  auth_token: string | null;
  is_core: number;
}

interface AgentConnection {
  socket: Socket;
  serverId: string;
  lastSeen: Date;
  heartbeatInterval?: NodeJS.Timeout;
}

const connectedAgents = new Map<string, AgentConnection>();

// Pending log requests - maps commandId to resolve/reject callbacks
const pendingLogRequests = new Map<string, {
  resolve: (result: LogResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  serverId: string;
}>();

// Pending commands - maps commandId to tracking info for ack/timeout
interface PendingCommand {
  resolve: (result: CommandResult) => void;
  reject: (error: Error) => void;
  ackTimeout: NodeJS.Timeout;
  completionTimeout?: NodeJS.Timeout;
  acknowledged: boolean;
  deploymentId?: string;
  action: string;
  serverId: string;
}

const pendingCommands = new Map<string, PendingCommand>();

// Timeout configuration (in milliseconds)
const ACK_TIMEOUT = 10000; // 10 seconds to acknowledge receipt

// Completion timeouts by action type
const COMPLETION_TIMEOUTS: Record<string, number> = {
  install: 10 * 60 * 1000,    // 10 minutes
  configure: 60 * 1000,        // 1 minute
  start: 30 * 1000,            // 30 seconds
  stop: 30 * 1000,             // 30 seconds
  restart: 60 * 1000,          // 1 minute
  uninstall: 2 * 60 * 1000,    // 2 minutes
  mountStorage: 60 * 1000,        // 1 minute
  unmountStorage: 30 * 1000,      // 30 seconds
  checkMount: 10 * 1000,          // 10 seconds
  configureKeepalived: 2 * 60 * 1000, // 2 minutes (may need to install package)
  checkKeepalived: 10 * 1000,     // 10 seconds
};

// Heartbeat configuration
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 90000;  // 90 seconds

// Log stream subscriptions: maps streamId to { deploymentId, subscribedClients }
interface LogStreamSubscription {
  deploymentId: string;
  serverId: string;
  appName: string;
  clients: Set<Socket>;
}
const activeLogStreams = new Map<string, LogStreamSubscription>();

// Map browser client socket to their subscribed stream IDs (for cleanup)
const clientLogSubscriptions = new Map<Socket, Set<string>>();

export function getConnectedAgents(): Map<string, Socket> {
  const result = new Map<string, Socket>();
  for (const [id, conn] of connectedAgents) {
    result.set(id, conn.socket);
  }
  return result;
}

export function isAgentConnected(serverId: string): boolean {
  return connectedAgents.has(serverId);
}

/**
 * Hash a token for storage
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Securely compare tokens using timing-safe comparison
 */
function verifyToken(providedToken: string, storedHash: string): boolean {
  const providedHash = hashToken(providedToken);
  const providedBuffer = Buffer.from(providedHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (providedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, storedBuffer);
}

export function setupAgentHandler(io: SocketServer): void {
  // Start cleanup interval for stale connections
  setInterval(() => {
    cleanupStaleConnections();
  }, HEARTBEAT_INTERVAL);

  io.on('connection', (socket: Socket) => {
    const auth = socket.handshake.auth as AgentAuth;
    const { serverId, token } = auth;
    const clientIp = socket.handshake.address;

    // Check if this is an agent connection (has serverId) or browser client
    if (!serverId) {
      // This is a browser client - validate JWT from cookie or auth header
      handleBrowserClient(io, socket, clientIp);
      return;
    }

    // Validate auth token
    const db = getDb();
    const server = db.prepare('SELECT id, auth_token, is_core FROM servers WHERE id = ?').get(serverId) as ServerRow | undefined;

    if (!server) {
      wsLogger.warn({ serverId, clientIp }, 'Agent connection rejected: unknown server');
      socket.disconnect();
      return;
    }

    // Core server doesn't need a token (local connection)
    // For other servers, verify the token
    if (!server.is_core) {
      if (!token) {
        wsLogger.warn({ serverId, clientIp }, 'Agent connection rejected: missing token');
        socket.disconnect();
        return;
      }

      // First, check agent_tokens table for new-style tokens with expiry support
      const tokenHash = hashToken(token);
      const agentTokenRow = db.prepare(`
        SELECT id FROM agent_tokens
        WHERE server_id = ? AND token_hash = ?
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `).get(serverId, tokenHash) as { id: string } | undefined;

      if (agentTokenRow) {
        // Valid token from agent_tokens table - update last_used_at
        db.prepare('UPDATE agent_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(agentTokenRow.id);
        wsLogger.debug({ serverId, tokenId: agentTokenRow.id }, 'Agent authenticated via agent_tokens');
      } else if (server.auth_token) {
        // Fall back to legacy servers.auth_token field
        if (!verifyToken(token, server.auth_token)) {
          wsLogger.warn({ serverId, clientIp }, 'Agent connection rejected: invalid token');
          socket.disconnect();
          return;
        }
        wsLogger.debug({ serverId }, 'Agent authenticated via legacy auth_token');
      } else {
        wsLogger.warn({ serverId, clientIp }, 'Agent connection rejected: no valid token');
        socket.disconnect();
        return;
      }
    }

    // Use mutex to safely handle connection replacement
    mutexManager.withServerLock(serverId, async () => {
      // Disconnect existing connection for this server (prevent duplicates)
      const existingConn = connectedAgents.get(serverId);
      if (existingConn) {
        wsLogger.info({ serverId }, 'Disconnecting existing agent connection');
        if (existingConn.heartbeatInterval) {
          clearInterval(existingConn.heartbeatInterval);
        }
        existingConn.socket.disconnect();
      }

      wsLogger.info({ serverId, clientIp }, 'Agent connected');

      // Create connection entry
      const connection: AgentConnection = {
        socket,
        serverId,
        lastSeen: new Date(),
      };

      // Set up heartbeat
      connection.heartbeatInterval = setInterval(() => {
        socket.emit('ping');
      }, HEARTBEAT_INTERVAL);

      connectedAgents.set(serverId, connection);

      // Update server status
      db.prepare(`
        UPDATE servers SET agent_status = 'online', last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(serverId);

      // Emit to clients that server is connected
      io.emit('server:connected', { serverId, timestamp: new Date() });

      // Request immediate status report to sync deployment statuses
      // This ensures the database is updated right away, not after the agent's interval
      socket.emit('request_status');
      wsLogger.debug({ serverId }, 'Requested immediate status report from agent');

      // Check for mounts that should be auto-mounted
      autoMountServerStorage(serverId).catch(err => {
        wsLogger.error({ serverId, err }, 'Error auto-mounting storage');
      });
    });

    // Handle pong (heartbeat response)
    socket.on('pong', () => {
      const conn = connectedAgents.get(serverId);
      if (conn) {
        conn.lastSeen = new Date();
      }
    });

    // Handle status reports from agent
    socket.on('status', (report: AgentStatusReport) => {
      const conn = connectedAgents.get(serverId);
      if (conn) {
        conn.lastSeen = new Date();
      }
      handleStatusReport(io, serverId, report).catch(err => {
        wsLogger.error({ serverId, err }, 'Error handling status report');
      });
    });

    // Handle command acknowledgment from agent
    socket.on('command:ack', (ack: CommandAck) => {
      handleCommandAck(serverId, ack);
    });

    // Handle command results from agent
    socket.on('command:result', (result: CommandResult) => {
      handleCommandResult(io, serverId, result).catch(err => {
        wsLogger.error({ serverId, commandId: result.commandId, err }, 'Error handling command result');
      });
    });

    // Handle log results from agent
    socket.on('logs:result', (result: LogResult) => {
      handleLogResult(serverId, result);
    });

    // Handle log stream lines from agent
    socket.on('logs:stream:line', (line: LogStreamLine) => {
      handleLogStreamLine(line);
    });

    // Handle log stream status from agent
    socket.on('logs:stream:status', (status: LogStreamStatus) => {
      handleLogStreamStatus(serverId, status);
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      wsLogger.info({ serverId, reason }, 'Agent disconnected');

      const conn = connectedAgents.get(serverId);
      if (conn?.heartbeatInterval) {
        clearInterval(conn.heartbeatInterval);
      }
      connectedAgents.delete(serverId);

      // Clean up pending commands for this server
      cleanupPendingCommandsForServer(serverId);

      // Clean up pending log requests for this server
      cleanupPendingLogRequestsForServer(serverId);

      // Clean up server mutex to prevent memory leak
      mutexManager.cleanupServerMutex(serverId);

      db.prepare(`
        UPDATE servers SET agent_status = 'offline', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(serverId);

      io.emit('server:disconnected', { serverId, timestamp: new Date() });
    });
  });
}

/**
 * Handle browser client WebSocket connections
 */
function handleBrowserClient(io: SocketServer, socket: Socket, clientIp: string): void {
  // Get JWT from cookie in handshake headers
  const cookies = socket.handshake.headers.cookie || '';
  const tokenMatch = cookies.match(/access_token=([^;]+)/);
  const accessToken = tokenMatch?.[1];

  if (!accessToken) {
    wsLogger.debug({ clientIp }, 'Browser client connection: no access token');
    // Allow connection without auth for now - they just won't see anything sensitive
    // The client will reconnect after login with proper auth
  } else {
    // Verify the token
    const payload = authService.verifyAccessToken(accessToken);
    if (!payload) {
      wsLogger.debug({ clientIp }, 'Browser client: invalid access token');
    } else {
      wsLogger.debug({ clientIp, userId: payload.userId }, 'Browser client authenticated');
    }
  }

  // Track this browser client
  browserClients.add(socket);
  clientLogSubscriptions.set(socket, new Set());
  wsLogger.info({ clientIp, totalClients: browserClients.size }, 'Browser client connected');

  // Emit connected status to this client
  socket.emit('connect_ack', { connected: true });

  // Handle log stream subscription
  socket.on('subscribe:logs', async (data: { deploymentId: string }) => {
    await handleLogSubscription(socket, data.deploymentId);
  });

  // Handle log stream unsubscription
  socket.on('unsubscribe:logs', (data: { deploymentId: string; streamId?: string }) => {
    handleLogUnsubscription(socket, data.streamId);
  });

  socket.on('disconnect', (reason) => {
    browserClients.delete(socket);

    // Clean up log stream subscriptions for this client
    const clientSubs = clientLogSubscriptions.get(socket);
    if (clientSubs) {
      for (const streamId of clientSubs) {
        const subscription = activeLogStreams.get(streamId);
        if (subscription) {
          subscription.clients.delete(socket);
          // If no more clients, stop the stream
          if (subscription.clients.size === 0) {
            stopLogStreamForDeployment(streamId, subscription.serverId);
            activeLogStreams.delete(streamId);
          }
        }
      }
      clientLogSubscriptions.delete(socket);
    }

    wsLogger.debug({ clientIp, reason, totalClients: browserClients.size }, 'Browser client disconnected');
  });
}

/**
 * Clean up connections that haven't responded to heartbeats
 */
function cleanupStaleConnections(): void {
  const now = Date.now();
  const db = getDb();

  for (const [serverId, conn] of connectedAgents) {
    const lastSeenMs = conn.lastSeen.getTime();
    if (now - lastSeenMs > HEARTBEAT_TIMEOUT) {
      wsLogger.warn({ serverId, lastSeen: conn.lastSeen }, 'Disconnecting stale agent connection');

      if (conn.heartbeatInterval) {
        clearInterval(conn.heartbeatInterval);
      }
      conn.socket.disconnect();
      connectedAgents.delete(serverId);

      db.prepare(`
        UPDATE servers SET agent_status = 'offline', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(serverId);
    }
  }
}

async function handleStatusReport(io: SocketServer, serverId: string, report: AgentStatusReport): Promise<void> {
  const db = getDb();

  // Update server metrics and network info (no mutex needed - single server update)
  db.prepare(`
    UPDATE servers SET metrics = ?, network_info = ?, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    JSON.stringify(report.metrics),
    report.networkInfo ? JSON.stringify(report.networkInfo) : null,
    serverId
  );

  // Track if any routes changed so we can reload Caddy once at the end
  let routesChanged = false;

  // Update deployment statuses - use per-deployment mutex to avoid race with command results
  // Status report only updates deployments in stable states (not installing/configuring/uninstalling)
  for (const app of report.apps) {
    // Get deployment info for this app on this server
    const deployment = db.prepare(`
      SELECT d.id, d.status, pr.active as route_active
      FROM deployments d
      LEFT JOIN proxy_routes pr ON pr.deployment_id = d.id
      WHERE d.server_id = ? AND d.app_name = ?
    `).get(serverId, app.name) as { id: string; status: string; route_active: number | null } | undefined;

    if (deployment) {
      const newStatus = mapAppStatusToDeploymentStatus(app.status);
      const previousStatus = deployment.status;
      // Only consider route state if a route exists (route_active is not null)
      const hasRoute = deployment.route_active !== null;
      const currentRouteActive = deployment.route_active === 1;
      const shouldRouteBeActive = newStatus === 'running';

      await mutexManager.withDeploymentLock(deployment.id, async () => {
        // Only update if not in a transient state (command results have priority)
        const result = db.prepare(`
          UPDATE deployments SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status != 'installing' AND status != 'configuring' AND status != 'uninstalling'
        `).run(newStatus, deployment.id);

        // Check if status actually changed (update was applied and status differs)
        const statusChanged = result.changes > 0 && previousStatus !== newStatus;

        // Update route if needed (running → active, stopped/error → inactive)
        // Only update if deployment has a proxy route
        if (hasRoute && currentRouteActive !== shouldRouteBeActive) {
          await proxyManager.setRouteActive(deployment.id, shouldRouteBeActive);
          routesChanged = true;
          wsLogger.info({
            deploymentId: deployment.id,
            appName: app.name,
            routeActive: shouldRouteBeActive,
          }, 'Route state updated based on agent status');
        }

        // Broadcast status change to UI clients (only if status actually changed)
        if (statusChanged) {
          broadcastDeploymentStatus({
            deploymentId: deployment.id,
            appName: app.name,
            serverId,
            status: newStatus,
            previousStatus,
            routeActive: hasRoute ? shouldRouteBeActive : undefined,
          });
        }
      });
    }
  }

  // Reload Caddy once if any routes changed
  if (routesChanged) {
    try {
      await proxyManager.updateAndReload();
      wsLogger.info({ serverId }, 'Caddy reloaded after route updates from status report');
    } catch (err) {
      wsLogger.error({ serverId, err }, 'Failed to reload Caddy after route updates');
    }
  }

  // Emit status update to clients
  io.emit('server:status', {
    serverId,
    timestamp: report.timestamp,
    metrics: report.metrics,
    networkInfo: report.networkInfo,
    apps: report.apps,
  });
}

function mapAppStatusToDeploymentStatus(appStatus: string): string {
  switch (appStatus) {
    case 'running':
      return 'running';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    default:
      return 'stopped';
  }
}

async function handleCommandResult(io: SocketServer, serverId: string, result: CommandResult): Promise<void> {
  const db = getDb();

  // Clean up pending command tracking
  const pending = pendingCommands.get(result.commandId);
  if (pending) {
    clearTimeout(pending.ackTimeout);
    if (pending.completionTimeout) {
      clearTimeout(pending.completionTimeout);
    }
    pendingCommands.delete(result.commandId);

    // Resolve the pending promise
    if (result.status === 'success') {
      pending.resolve(result);
    } else {
      pending.reject(new Error(result.message || 'Command failed'));
    }
  }

  // Get command info to update deployment status (read before acquiring mutex)
  const commandRow = db.prepare('SELECT deployment_id, action FROM command_log WHERE id = ?').get(result.commandId) as { deployment_id: string | null; action: string } | undefined;

  // Update command log (no mutex needed - single command update)
  db.prepare(`
    UPDATE command_log SET status = ?, result_message = ?, completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(result.status, result.message || null, result.commandId);

  // Update deployment status with mutex protection
  if (commandRow?.deployment_id) {
    await mutexManager.withDeploymentLock(commandRow.deployment_id, async () => {
      const newStatus = getDeploymentStatusFromCommand(commandRow.action, result.status);
      if (newStatus) {
        db.prepare(`
          UPDATE deployments SET status = ?, status_message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newStatus, result.message || null, commandRow.deployment_id);
      }
    });
  }

  // Emit result to clients
  io.emit('command:result', {
    serverId,
    ...result,
  });

  wsLogger.info({
    commandId: result.commandId,
    serverId,
    status: result.status,
    message: result.message,
  }, 'Command completed');
}

function getDeploymentStatusFromCommand(action: string, resultStatus: string): string | null {
  if (resultStatus === 'error') {
    return 'error';
  }

  switch (action) {
    case 'install':
      return resultStatus === 'success' ? 'stopped' : 'error';
    case 'configure':
      return resultStatus === 'success' ? 'stopped' : 'error';
    case 'start':
      return resultStatus === 'success' ? 'running' : 'error';
    case 'stop':
      return resultStatus === 'success' ? 'stopped' : 'error';
    case 'uninstall':
      return null; // Deployment is deleted, not updated
    default:
      return null;
  }
}

function handleLogResult(serverId: string, result: LogResult): void {
  const pending = pendingLogRequests.get(result.commandId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingLogRequests.delete(result.commandId);
    pending.resolve(result);
  }

  wsLogger.debug({
    commandId: result.commandId,
    serverId,
    status: result.status,
    lineCount: result.logs.length,
  }, 'Log result received');
}

/**
 * Handle a log stream line from an agent - forward to subscribed clients
 */
function handleLogStreamLine(line: LogStreamLine): void {
  const subscription = activeLogStreams.get(line.streamId);
  if (!subscription) {
    return; // No subscribers for this stream
  }

  // Forward to all subscribed browser clients
  for (const clientSocket of subscription.clients) {
    clientSocket.emit('deployment:log', {
      deploymentId: subscription.deploymentId,
      streamId: line.streamId,
      line: line.line,
      timestamp: line.timestamp,
    });
  }
}

/**
 * Handle log stream status from an agent
 */
function handleLogStreamStatus(serverId: string, status: LogStreamStatus): void {
  wsLogger.info({
    streamId: status.streamId,
    appName: status.appName,
    status: status.status,
    message: status.message,
  }, 'Log stream status update');

  const subscription = activeLogStreams.get(status.streamId);
  if (!subscription) {
    return;
  }

  // Notify subscribed clients
  for (const clientSocket of subscription.clients) {
    clientSocket.emit('deployment:log:status', {
      deploymentId: subscription.deploymentId,
      streamId: status.streamId,
      status: status.status,
      message: status.message,
    });
  }

  // Clean up if stream stopped or errored
  if (status.status === 'stopped' || status.status === 'error') {
    // Clean up client tracking
    for (const clientSocket of subscription.clients) {
      const clientSubs = clientLogSubscriptions.get(clientSocket);
      if (clientSubs) {
        clientSubs.delete(status.streamId);
      }
    }
    activeLogStreams.delete(status.streamId);
  }
}

/**
 * Handle browser client subscribing to log stream
 */
async function handleLogSubscription(clientSocket: Socket, deploymentId: string): Promise<void> {
  const db = getDb();

  // Look up deployment to get serverId and appName
  const deployment = db.prepare(`
    SELECT d.id, d.server_id, d.app_name, s.agent_status
    FROM deployments d
    JOIN servers s ON d.server_id = s.id
    WHERE d.id = ?
  `).get(deploymentId) as { id: string; server_id: string; app_name: string; agent_status: string } | undefined;

  if (!deployment) {
    clientSocket.emit('deployment:log:status', {
      deploymentId,
      status: 'error',
      message: 'Deployment not found',
    });
    return;
  }

  if (deployment.agent_status !== 'online') {
    clientSocket.emit('deployment:log:status', {
      deploymentId,
      status: 'error',
      message: 'Server is offline',
    });
    return;
  }

  // Generate a unique stream ID
  const streamId = `${deploymentId}-${Date.now()}`;

  // Check if there's already an active stream for this deployment
  for (const [existingStreamId, sub] of activeLogStreams) {
    if (sub.deploymentId === deploymentId) {
      // Reuse existing stream - just add this client
      sub.clients.add(clientSocket);
      const clientSubs = clientLogSubscriptions.get(clientSocket);
      if (clientSubs) {
        clientSubs.add(existingStreamId);
      }

      clientSocket.emit('deployment:log:status', {
        deploymentId,
        streamId: existingStreamId,
        status: 'started',
        message: 'Joined existing stream',
      });
      return;
    }
  }

  // Create new subscription
  activeLogStreams.set(streamId, {
    deploymentId,
    serverId: deployment.server_id,
    appName: deployment.app_name,
    clients: new Set([clientSocket]),
  });

  const clientSubs = clientLogSubscriptions.get(clientSocket);
  if (clientSubs) {
    clientSubs.add(streamId);
  }

  // Send command to agent to start streaming
  const agentConn = connectedAgents.get(deployment.server_id);
  if (!agentConn) {
    activeLogStreams.delete(streamId);
    clientSocket.emit('deployment:log:status', {
      deploymentId,
      status: 'error',
      message: 'Agent not connected',
    });
    return;
  }

  // Look up service name from manifest if available
  let serviceName = deployment.app_name;
  try {
    const manifest = db.prepare(`
      SELECT manifest FROM app_manifests WHERE name = ?
    `).get(deployment.app_name) as { manifest: string } | undefined;

    if (manifest) {
      const parsed = JSON.parse(manifest.manifest);
      if (parsed.logging?.serviceName) {
        serviceName = parsed.logging.serviceName;
      }
    }
  } catch {
    // Ignore manifest lookup errors, use default
  }

  agentConn.socket.emit('command', {
    id: streamId,
    action: 'streamLogs',
    appName: deployment.app_name,
    payload: {
      logOptions: {
        serviceName,
      },
    },
  });

  wsLogger.info({
    streamId,
    deploymentId,
    serverId: deployment.server_id,
    appName: deployment.app_name,
  }, 'Started log stream subscription');
}

/**
 * Handle browser client unsubscribing from log stream
 */
function handleLogUnsubscription(clientSocket: Socket, streamId?: string): void {
  const clientSubs = clientLogSubscriptions.get(clientSocket);
  if (!clientSubs) return;

  // If no streamId provided, unsubscribe from all
  const streamsToCheck = streamId ? [streamId] : [...clientSubs];

  for (const sid of streamsToCheck) {
    const subscription = activeLogStreams.get(sid);
    if (!subscription) continue;

    subscription.clients.delete(clientSocket);
    clientSubs.delete(sid);

    // If no more clients, stop the stream
    if (subscription.clients.size === 0) {
      stopLogStreamForDeployment(sid, subscription.serverId);
      activeLogStreams.delete(sid);
    }
  }
}

/**
 * Send stop command to agent to stop streaming logs
 */
function stopLogStreamForDeployment(streamId: string, serverId: string): void {
  const agentConn = connectedAgents.get(serverId);
  if (!agentConn) return;

  agentConn.socket.emit('command', {
    id: streamId,
    action: 'stopStreamLogs',
    appName: '', // Not needed for stop
  });

  wsLogger.info({ streamId, serverId }, 'Stopped log stream');
}

/**
 * Handle command acknowledgment from agent.
 * Clears the ack timeout and starts the completion timeout.
 */
function handleCommandAck(serverId: string, ack: CommandAck): void {
  const pending = pendingCommands.get(ack.commandId);
  if (!pending) {
    wsLogger.debug({ serverId, commandId: ack.commandId }, 'Received ack for unknown command');
    return;
  }

  if (pending.serverId !== serverId) {
    wsLogger.warn({ serverId, commandId: ack.commandId, expectedServerId: pending.serverId },
      'Received ack from wrong server');
    return;
  }

  // Clear ack timeout
  clearTimeout(pending.ackTimeout);
  pending.acknowledged = true;

  // Start completion timeout
  const completionTimeoutMs = COMPLETION_TIMEOUTS[pending.action] || 60000;
  pending.completionTimeout = setTimeout(() => {
    const stillPending = pendingCommands.get(ack.commandId);
    if (stillPending) {
      pendingCommands.delete(ack.commandId);

      // Update command log to timeout status
      const db = getDb();
      db.prepare(`
        UPDATE command_log SET status = 'timeout', result_message = 'Command completion timed out', completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(ack.commandId);

      // Update deployment status if applicable
      if (stillPending.deploymentId) {
        db.prepare(`
          UPDATE deployments SET status = 'error', status_message = 'Command timed out waiting for completion', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(stillPending.deploymentId);
      }

      stillPending.reject(new Error(`Command '${pending.action}' timed out waiting for completion`));
      wsLogger.error({
        commandId: ack.commandId,
        serverId,
        action: pending.action,
        timeoutMs: completionTimeoutMs,
      }, 'Command completion timeout');
    }
  }, completionTimeoutMs);

  wsLogger.info({
    commandId: ack.commandId,
    serverId,
    action: pending.action,
    receivedAt: ack.receivedAt,
  }, 'Command acknowledged');
}

/**
 * Clean up pending commands for a server (e.g., on disconnect).
 */
function cleanupPendingCommandsForServer(serverId: string): void {
  for (const [commandId, pending] of pendingCommands) {
    if (pending.serverId === serverId) {
      clearTimeout(pending.ackTimeout);
      if (pending.completionTimeout) {
        clearTimeout(pending.completionTimeout);
      }
      pendingCommands.delete(commandId);
      pending.reject(new Error('Agent disconnected'));

      // Update command log
      const db = getDb();
      db.prepare(`
        UPDATE command_log SET status = 'error', result_message = 'Agent disconnected', completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(commandId);
    }
  }
}

/**
 * Clean up pending log requests for a server (e.g., on disconnect).
 */
function cleanupPendingLogRequestsForServer(serverId: string): void {
  for (const [commandId, pending] of pendingLogRequests) {
    if (pending.serverId === serverId) {
      clearTimeout(pending.timeout);
      pendingLogRequests.delete(commandId);
      pending.reject(new Error('Agent disconnected'));
    }
  }
}

export async function requestLogs(
  serverId: string,
  appName: string,
  options: { lines?: number; since?: string; grep?: string; logPath?: string; serviceName?: string } = {},
  timeoutMs: number = 30000
): Promise<LogResult> {
  const conn = connectedAgents.get(serverId);
  if (!conn) {
    throw new Error(`Agent not connected: ${serverId}`);
  }

  const commandId = `logs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingLogRequests.delete(commandId);
      reject(new Error('Log request timed out'));
    }, timeoutMs);

    pendingLogRequests.set(commandId, { resolve, reject, timeout, serverId });

    conn.socket.emit('command', {
      id: commandId,
      action: 'getLogs',
      appName,
      payload: { logOptions: options },
    });

    wsLogger.info({ serverId, appName, commandId }, 'Log request sent');
  });
}

/**
 * Send a command to an agent.
 * Sets up acknowledgment and completion timeouts.
 * Returns true if the command was sent, false if the agent is not connected.
 */
export function sendCommand(serverId: string, command: { id: string; action: string; appName: string; payload?: unknown }, deploymentId?: string): boolean {
  const conn = connectedAgents.get(serverId);
  if (!conn) {
    wsLogger.warn({ serverId }, 'Cannot send command: agent not connected');
    return false;
  }

  // Log the command with deployment_id for status tracking
  const db = getDb();
  db.prepare(`
    INSERT INTO command_log (id, server_id, deployment_id, action, payload, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
  `).run(command.id, serverId, deploymentId || null, command.action, JSON.stringify({ appName: command.appName, ...(command.payload || {}) }));

  // Set up ack timeout
  const ackTimeout = setTimeout(() => {
    const pending = pendingCommands.get(command.id);
    if (pending && !pending.acknowledged) {
      pendingCommands.delete(command.id);

      // Update command log to timeout status
      db.prepare(`
        UPDATE command_log SET status = 'timeout', result_message = 'Agent did not acknowledge command', completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(command.id);

      // Update deployment status if applicable
      if (deploymentId) {
        db.prepare(`
          UPDATE deployments SET status = 'error', status_message = 'Agent did not acknowledge command', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(deploymentId);
      }

      wsLogger.error({
        commandId: command.id,
        serverId,
        action: command.action,
      }, 'Command acknowledgment timeout');
    }
  }, ACK_TIMEOUT);

  // Track the pending command
  pendingCommands.set(command.id, {
    resolve: () => {}, // Will be called by handleCommandResult
    reject: (err) => {
      wsLogger.error({ commandId: command.id, serverId, err }, 'Command rejected');
    },
    ackTimeout,
    acknowledged: false,
    deploymentId,
    action: command.action,
    serverId,
  });

  conn.socket.emit('command', command);
  wsLogger.info({ serverId, action: command.action, appName: command.appName, commandId: command.id }, 'Command sent');
  return true;
}

// Shutdown timeout for graceful shutdown
const SHUTDOWN_TIMEOUT = 30000; // 30 seconds

/**
 * Get the count of pending commands.
 */
export function getPendingCommandCount(): number {
  return pendingCommands.size;
}

/**
 * Gracefully shutdown the agent handler.
 * Broadcasts shutdown to all agents and waits for pending commands.
 */
export async function shutdownAgentHandler(io: import('socket.io').Server): Promise<void> {
  wsLogger.info('Starting graceful shutdown of agent handler');

  // Broadcast shutdown notification to all agents
  io.emit('server:shutdown', { timestamp: new Date() });
  wsLogger.info({ agentCount: connectedAgents.size }, 'Broadcast shutdown notification to agents');

  // Wait for pending commands to complete (with timeout)
  const startTime = Date.now();
  while (pendingCommands.size > 0) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= SHUTDOWN_TIMEOUT) {
      wsLogger.warn({ pendingCount: pendingCommands.size }, 'Shutdown timeout - aborting pending commands');

      // Reject remaining pending commands
      for (const [commandId, pending] of pendingCommands) {
        clearTimeout(pending.ackTimeout);
        if (pending.completionTimeout) {
          clearTimeout(pending.completionTimeout);
        }
        pending.reject(new Error('Orchestrator shutting down'));
        pendingCommands.delete(commandId);
      }
      break;
    }

    wsLogger.debug({ pendingCount: pendingCommands.size, elapsed }, 'Waiting for pending commands');
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Clear all heartbeat intervals and disconnect agents
  for (const [serverId, conn] of connectedAgents) {
    if (conn.heartbeatInterval) {
      clearInterval(conn.heartbeatInterval);
    }
    conn.socket.disconnect(true);
    mutexManager.cleanupServerMutex(serverId);
  }
  connectedAgents.clear();

  // Clear pending log requests
  for (const [commandId, pending] of pendingLogRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('Orchestrator shutting down'));
  }
  pendingLogRequests.clear();

  wsLogger.info('Agent handler shutdown complete');
}

// ==================
// Mount Storage Support
// ==================

interface ServerMountRow {
  id: string;
  server_id: string;
  mount_id: string;
  mount_point: string;
  options: string | null;
  purpose: string | null;
  auto_mount: number;
  status: string;
  mount_type: string;
  source: string;
  default_options: string | null;
}

interface MountCredentialsRow {
  data: string;
}

/**
 * Send a mount-related command to an agent and wait for result.
 * Returns a promise that resolves with the command result.
 */
export function sendMountCommand(
  serverId: string,
  command: {
    id: string;
    action: 'mountStorage' | 'unmountStorage' | 'checkMount';
    appName: string;
    payload: { mountOptions: import('@ownprem/shared').MountCommandPayload };
  }
): Promise<import('@ownprem/shared').CommandResult> {
  const conn = connectedAgents.get(serverId);
  if (!conn) {
    return Promise.reject(new Error(`Agent not connected: ${serverId}`));
  }

  return new Promise((resolve, reject) => {
    // Set up ack timeout
    const ackTimeout = setTimeout(() => {
      const pending = pendingCommands.get(command.id);
      if (pending && !pending.acknowledged) {
        pendingCommands.delete(command.id);
        reject(new Error('Agent did not acknowledge command'));
      }
    }, ACK_TIMEOUT);

    // Track the pending command
    pendingCommands.set(command.id, {
      resolve,
      reject,
      ackTimeout,
      acknowledged: false,
      deploymentId: undefined,
      action: command.action,
      serverId,
    });

    conn.socket.emit('command', command);
    wsLogger.info({ serverId, action: command.action, commandId: command.id }, 'Mount command sent');
  });
}

/**
 * Auto-mount storage for a server on agent connect.
 * Checks all server_mounts with auto_mount=true and mounts them if not already mounted.
 */
async function autoMountServerStorage(serverId: string): Promise<void> {
  const db = getDb();

  // Get all mounts for this server that should be auto-mounted
  const serverMounts = db.prepare(`
    SELECT sm.*, m.mount_type, m.source, m.default_options
    FROM server_mounts sm
    JOIN mounts m ON m.id = sm.mount_id
    WHERE sm.server_id = ? AND sm.auto_mount = TRUE
  `).all(serverId) as ServerMountRow[];

  if (serverMounts.length === 0) {
    return;
  }

  wsLogger.info({ serverId, mountCount: serverMounts.length }, 'Auto-mounting storage');

  for (const sm of serverMounts) {
    try {
      // First check if already mounted
      const checkId = `check-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const checkResult = await sendMountCommand(serverId, {
        id: checkId,
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

      if (checkResult.status === 'success' && isMountCheckResult(checkResult.data) && checkResult.data.mounted) {
        // Already mounted, update status and usage
        db.prepare(`
          UPDATE server_mounts
          SET status = 'mounted',
              usage_bytes = ?,
              total_bytes = ?,
              last_checked = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          checkResult.data.usage?.used ?? null,
          checkResult.data.usage?.total ?? null,
          sm.id
        );
        wsLogger.info({ serverId, mountPoint: sm.mount_point }, 'Mount already mounted');
        continue;
      }

      // Not mounted, need to mount
      db.prepare(`
        UPDATE server_mounts SET status = 'mounting', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(sm.id);

      // Get credentials for CIFS mounts
      let credentials: { username: string; password: string; domain?: string } | undefined;
      if (sm.mount_type === 'cifs') {
        const { secretsManager } = await import('../services/secretsManager.js');
        const credRow = db.prepare(`
          SELECT data FROM mount_credentials WHERE mount_id = ?
        `).get(sm.mount_id) as MountCredentialsRow | undefined;

        if (credRow) {
          credentials = secretsManager.decrypt(credRow.data) as typeof credentials;
        }
      }

      const mountId = `mount-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const mountResult = await sendMountCommand(serverId, {
        id: mountId,
        action: 'mountStorage',
        appName: 'storage',
        payload: {
          mountOptions: {
            mountType: sm.mount_type as 'nfs' | 'cifs',
            source: sm.source,
            mountPoint: sm.mount_point,
            options: sm.options || sm.default_options || undefined,
            credentials,
          },
        },
      });

      if (mountResult.status === 'success') {
        db.prepare(`
          UPDATE server_mounts
          SET status = 'mounted',
              status_message = NULL,
              last_checked = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(sm.id);
        wsLogger.info({ serverId, mountPoint: sm.mount_point }, 'Mount successful');
      } else {
        db.prepare(`
          UPDATE server_mounts
          SET status = 'error',
              status_message = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(mountResult.message || 'Mount failed', sm.id);
        wsLogger.error({ serverId, mountPoint: sm.mount_point, error: mountResult.message }, 'Mount failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      db.prepare(`
        UPDATE server_mounts
        SET status = 'error',
            status_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(errorMessage, sm.id);
      wsLogger.error({ serverId, mountPoint: sm.mount_point, err }, 'Error auto-mounting storage');
    }
  }
}
