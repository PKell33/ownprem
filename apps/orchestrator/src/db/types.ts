/**
 * Consolidated database row types and conversion functions.
 *
 * All Row interfaces represent the raw SQLite row format (snake_case fields).
 * Conversion functions transform rows to application types (camelCase).
 */

import type {
  Server,
  ServerMetrics,
  NetworkInfo,
  Mount,
  MountType,
  MountStatus,
  ServerMount,
  ServerMountWithDetails,
  DeploymentStatus,
} from '@ownprem/shared';

// ==================== Server Types ====================

export interface ServerRow {
  id: string;
  name: string;
  host: string | null;
  is_core: number;
  agent_status: string;
  auth_token: string | null;
  metrics: string | null;
  network_info: string | null;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToServer(row: ServerRow): Server {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    isCore: Boolean(row.is_core),
    agentStatus: row.agent_status as Server['agentStatus'],
    authToken: row.auth_token,
    metrics: row.metrics ? JSON.parse(row.metrics) as ServerMetrics : undefined,
    networkInfo: row.network_info ? JSON.parse(row.network_info) as NetworkInfo : undefined,
    lastSeen: row.last_seen ? new Date(row.last_seen) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ==================== Deployment Types ====================

export interface DeploymentRow {
  id: string;
  server_id: string;
  app_name: string;
  group_id: string | null;
  version: string;
  config: string;
  status: string;
  status_message: string | null;
  installed_at: string;
  updated_at: string;
}

export interface Deployment {
  id: string;
  serverId: string;
  appName: string;
  groupId: string | null;
  version: string;
  config: Record<string, unknown>;
  status: DeploymentStatus;
  statusMessage: string | null;
  installedAt: Date;
  updatedAt: Date;
}

export function rowToDeployment(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    serverId: row.server_id,
    appName: row.app_name,
    groupId: row.group_id,
    version: row.version,
    config: row.config ? JSON.parse(row.config) : {},
    status: row.status as DeploymentStatus,
    statusMessage: row.status_message,
    installedAt: new Date(row.installed_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ==================== User/Auth Types ====================

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  is_system_admin: number;
  totp_secret: string | null;
  totp_enabled: number;
  backup_codes: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  totp_required: number;
  created_at: string;
  updated_at: string;
}

export interface UserGroupRow {
  user_id: string;
  group_id: string;
  role: 'admin' | 'operator' | 'viewer';
  created_at: string;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  last_used_at: string | null;
  family_id: string | null;
  issued_at: string | null;
}

// ==================== Mount Types ====================

export interface MountRow {
  id: string;
  name: string;
  mount_type: string;
  source: string;
  default_options: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServerMountRow {
  id: string;
  server_id: string;
  mount_id: string;
  mount_point: string;
  options: string | null;
  purpose: string | null;
  auto_mount: number;
  status: string;
  status_message: string | null;
  last_checked: string | null;
  usage_bytes: number | null;
  total_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface ServerMountWithDetailsRow extends ServerMountRow {
  mount_name: string;
  mount_type: string;
  source: string;
  default_options: string | null;
  mount_description: string | null;
  server_name: string;
  has_credentials: number;
}

export interface MountCredentialsRow {
  id: string;
  mount_id: string;
  encrypted_credentials: string;
  created_at: string;
  updated_at: string;
}

export function rowToMount(row: MountRow, hasCredentials: boolean = false): Mount {
  return {
    id: row.id,
    name: row.name,
    mountType: row.mount_type as MountType,
    source: row.source,
    defaultOptions: row.default_options,
    hasCredentials,
    description: row.description,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToServerMount(row: ServerMountRow): ServerMount {
  return {
    id: row.id,
    serverId: row.server_id,
    mountId: row.mount_id,
    mountPoint: row.mount_point,
    options: row.options,
    purpose: row.purpose,
    autoMount: Boolean(row.auto_mount),
    status: row.status as MountStatus,
    statusMessage: row.status_message,
    lastChecked: row.last_checked ? new Date(row.last_checked) : null,
    usageBytes: row.usage_bytes,
    totalBytes: row.total_bytes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToServerMountWithDetails(row: ServerMountWithDetailsRow): ServerMountWithDetails {
  return {
    ...rowToServerMount(row),
    mount: {
      id: row.mount_id,
      name: row.mount_name,
      mountType: row.mount_type as MountType,
      source: row.source,
      defaultOptions: row.default_options,
      hasCredentials: Boolean(row.has_credentials),
      description: row.mount_description,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    },
    serverName: row.server_name,
  };
}

// ==================== Proxy Types ====================

export interface ProxyRouteRow {
  id: string;
  deployment_id: string;
  path: string;
  upstream: string;
  active: number;
  created_at: string;
}

export interface ServiceRouteRow {
  id: string;
  service_id: string;
  route_type: string;
  external_path: string | null;
  external_port: number | null;
  upstream_host: string;
  upstream_port: number;
  active: number;
  created_at: string;
}

// ==================== Audit Types ====================

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  username: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

export function rowToAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    userId: row.user_id,
    username: row.username,
    details: row.details ? JSON.parse(row.details) : null,
    ipAddress: row.ip_address,
    createdAt: new Date(row.timestamp),
  };
}

// ==================== Agent Token Types ====================

export interface AgentTokenRow {
  id: string;
  server_id: string;
  name: string | null;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface AgentToken {
  id: string;
  serverId: string;
  name: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export function rowToAgentToken(row: AgentTokenRow): AgentToken {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    createdAt: new Date(row.created_at),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
  };
}

// ==================== Certificate Types ====================

export interface CertificateRow {
  id: string;
  ca_deployment_id: string | null;
  name: string;
  type: string;
  subject_cn: string;
  subject_sans: string | null;
  cert_pem: string;
  key_encrypted: string;
  ca_cert_pem: string | null;
  serial_number: string;
  not_before: string;
  not_after: string;
  issued_to_server_id: string | null;
  issued_to_deployment_id: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  created_at: string;
}

// ==================== Command Log Types ====================

export interface CommandLogRow {
  id: string;
  server_id: string;
  deployment_id: string | null;
  action: string;
  payload: string | null;
  status: string | null;
  result_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// ==================== Store Types ====================

export interface StoreRegistryRow {
  id: string;
  store_type: string;
  name: string;
  url: string;
  enabled: number;
  last_sync: string | null;
  created_at: string;
}

export interface StoreAppCacheRow {
  id: string;
  store_type: string;
  registry: string;
  data: string;
  updated_at: string;
}

// ==================== Helper Types ====================

/** Count query result */
export interface CountRow {
  count: number;
}

/** Generic existence check result */
export interface ExistsRow {
  id: string;
}
