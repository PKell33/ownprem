const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw new ApiError(
      response.status,
      error.error?.code || 'UNKNOWN_ERROR',
      error.error?.message || 'Request failed'
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  // Servers
  async getServers() {
    const res = await fetch(`${API_BASE}/servers`);
    return handleResponse<Server[]>(res);
  },

  async getServer(id: string) {
    const res = await fetch(`${API_BASE}/servers/${id}`);
    return handleResponse<Server>(res);
  },

  async addServer(data: { name: string; host: string }) {
    const res = await fetch(`${API_BASE}/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ server: Server; bootstrapCommand: string }>(res);
  },

  async deleteServer(id: string) {
    const res = await fetch(`${API_BASE}/servers/${id}`, { method: 'DELETE' });
    return handleResponse<void>(res);
  },

  // Apps
  async getApps() {
    const res = await fetch(`${API_BASE}/apps`);
    return handleResponse<AppManifest[]>(res);
  },

  async getApp(name: string) {
    const res = await fetch(`${API_BASE}/apps/${name}`);
    return handleResponse<AppManifest>(res);
  },

  // Deployments
  async getDeployments(serverId?: string) {
    const url = serverId ? `${API_BASE}/deployments?serverId=${serverId}` : `${API_BASE}/deployments`;
    const res = await fetch(url);
    return handleResponse<Deployment[]>(res);
  },

  async getDeployment(id: string) {
    const res = await fetch(`${API_BASE}/deployments/${id}`);
    return handleResponse<Deployment>(res);
  },

  async validateInstall(serverId: string, appName: string) {
    const res = await fetch(`${API_BASE}/deployments/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId, appName }),
    });
    return handleResponse<ValidationResult>(res);
  },

  async installApp(serverId: string, appName: string, config?: Record<string, unknown>) {
    const res = await fetch(`${API_BASE}/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId, appName, config }),
    });
    return handleResponse<Deployment>(res);
  },

  async updateDeployment(id: string, config: Record<string, unknown>) {
    const res = await fetch(`${API_BASE}/deployments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    return handleResponse<Deployment>(res);
  },

  async startDeployment(id: string) {
    const res = await fetch(`${API_BASE}/deployments/${id}/start`, { method: 'POST' });
    return handleResponse<Deployment>(res);
  },

  async stopDeployment(id: string) {
    const res = await fetch(`${API_BASE}/deployments/${id}/stop`, { method: 'POST' });
    return handleResponse<Deployment>(res);
  },

  async restartDeployment(id: string) {
    const res = await fetch(`${API_BASE}/deployments/${id}/restart`, { method: 'POST' });
    return handleResponse<Deployment>(res);
  },

  async uninstallDeployment(id: string) {
    const res = await fetch(`${API_BASE}/deployments/${id}`, { method: 'DELETE' });
    return handleResponse<void>(res);
  },

  // Services
  async getServices() {
    const res = await fetch(`${API_BASE}/services`);
    return handleResponse<Service[]>(res);
  },

  // System
  async getSystemStatus() {
    const res = await fetch(`${API_BASE}/system/status`);
    return handleResponse<SystemStatus>(res);
  },
};

// Types
export interface Server {
  id: string;
  name: string;
  host: string | null;
  isFoundry: boolean;
  agentStatus: 'online' | 'offline' | 'error';
  metrics?: ServerMetrics;
  lastSeen: string | null;
  createdAt: string;
}

export interface ServerMetrics {
  cpuPercent: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  loadAverage: [number, number, number];
}

export interface AppManifest {
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: string;
  webui?: { enabled: boolean; port: number; basePath: string };
  configSchema: ConfigField[];
  requires?: ServiceRequirement[];
  provides?: ServiceDefinition[];
}

export interface ConfigField {
  name: string;
  type: string;
  label: string;
  description?: string;
  default?: unknown;
  options?: string[];
  required?: boolean;
  generated?: boolean;
  secret?: boolean;
  inheritFrom?: string;
}

export interface ServiceRequirement {
  service: string;
  optional?: boolean;
  locality: string;
}

export interface ServiceDefinition {
  name: string;
  port: number;
  protocol: string;
}

export interface Deployment {
  id: string;
  serverId: string;
  appName: string;
  version: string;
  config: Record<string, unknown>;
  status: string;
  statusMessage?: string;
  installedAt: string;
  updatedAt: string;
}

export interface Service {
  id: string;
  serviceName: string;
  serverId: string;
  host: string;
  port: number;
  status: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  dependencies: Array<{
    service: string;
    optional: boolean;
    locality: string;
    providers: Array<{ serverId: string; host: string; port: number }>;
    satisfied: boolean;
  }>;
}

export interface SystemStatus {
  status: string;
  servers: { total: number; online: number };
  deployments: { total: number; running: number };
  timestamp: string;
}
