import type { ServerMetrics, NetworkInfo } from './server.js';
import type { MountCommandPayload, MountCheckResult } from './mount.js';
import type { DataDirectory } from './app.js';

export interface AgentCommand {
  id: string;
  action: 'mountStorage' | 'unmountStorage' | 'checkMount'
        | 'docker:deploy' | 'docker:start' | 'docker:stop' | 'docker:remove'
        | 'docker:restart' | 'docker:logs' | 'docker:status';
  appName?: string;
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
  // Docker-specific options
  docker?: DockerCommandPayload;
}

export interface DockerCommandPayload {
  appId: string;
  composeYaml?: string;           // For docker:deploy
  lines?: number;                 // For docker:logs (default 100)
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
  data?: MountCheckResult | DockerDeployResult | DockerStatusResult | DockerLogsResult;
}

export interface DockerDeployResult {
  success: boolean;
  containers: string[];
  error?: string;
}

export interface DockerStatusResult {
  containers: DockerContainerStatus[];
}

export interface DockerLogsResult {
  logs: string;
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
  docker?: DockerInfo;
}

export interface DockerInfo {
  available: boolean;
  version?: string;
  error?: string;
  containers?: DockerContainerStatus[];
}

export interface DockerContainerStatus {
  appId: string;
  name: string;
  service: string;
  state: string;
  status: string;
  health?: string;
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

export interface LogStreamPayload {
  grep?: string;
  source?: 'journalctl' | 'file' | 'auto';
  serviceName?: string;
  logPath?: string;
}

export interface LogStreamLine {
  streamId: string;
  appName: string;
  line: string;
  timestamp: string;
}

export interface LogStreamStatus {
  streamId: string;
  appName: string;
  status: 'started' | 'stopped' | 'error';
  message?: string;
}

export type CommandAction = AgentCommand['action'];
