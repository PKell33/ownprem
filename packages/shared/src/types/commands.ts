import type { ServerMetrics, NetworkInfo } from './server.js';
import type { MountCommandPayload, MountCheckResult } from './mount.js';
import type { DataDirectory } from './app.js';

export interface AgentCommand {
  id: string;
  action: 'install' | 'configure' | 'start' | 'stop' | 'restart' | 'uninstall' | 'getLogs'
        | 'mountStorage' | 'unmountStorage' | 'checkMount'
        | 'configureKeepalived' | 'checkKeepalived';
  appName: string;
  payload?: CommandPayload;
}

export interface AppMetadata {
  name: string;
  displayName: string;
  version: string;
  serviceName: string;  // Systemd service name (may differ from app name)
  // Privileged setup info (from manifest)
  serviceUser?: string;
  serviceGroup?: string;
  dataDirectories?: DataDirectory[];
  capabilities?: string[];  // e.g., ['cap_net_bind_service=+ep']
}

export interface CommandPayload {
  version?: string;
  files?: ConfigFile[];
  env?: Record<string, string>;
  metadata?: AppMetadata;          // App metadata written to .ownprem.json
  logOptions?: LogRequestPayload;
  mountOptions?: MountCommandPayload;
  keepalivedConfig?: string;       // Keepalived configuration content
  enabled?: boolean;               // Enable/disable keepalived
}

export interface LogRequestPayload {
  lines?: number;
  since?: string;
  grep?: string;
  source?: 'journalctl' | 'file' | 'auto';
  // Custom log file path (supports ${dataDir}, ${appName} variables)
  logPath?: string;
  // Systemd service name if different from app name
  serviceName?: string;
}

export interface ConfigFile {
  path: string;
  content: string;
  mode?: string;
  owner?: string;
}

export interface KeepalivedStatus {
  installed: boolean;
  running: boolean;
  state?: string;
}

export interface CommandResult {
  commandId: string;
  status: 'success' | 'error';
  message?: string;
  duration?: number;
  data?: MountCheckResult | KeepalivedStatus;
}

export interface CommandAck {
  commandId: string;
  receivedAt: Date;
}

export interface AgentStatusReport {
  serverId: string;
  timestamp: Date;
  metrics: ServerMetrics;
  networkInfo?: NetworkInfo;
  apps: AppStatus[];
}

export interface AppStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'not-installed';
  version?: string;
  syncProgress?: number;
  blockHeight?: number;
  torAddresses?: Record<string, string>;
}

export interface LogResult {
  commandId: string;
  logs: string[];
  source: 'journalctl' | 'file';
  hasMore: boolean;
  status: 'success' | 'error';
  message?: string;
}

export type CommandAction = AgentCommand['action'];
