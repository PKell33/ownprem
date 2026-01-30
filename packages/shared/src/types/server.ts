export interface Server {
  id: string;
  name: string;
  host: string | null;
  isCore: boolean;
  agentStatus: 'online' | 'offline' | 'error';
  authToken: string | null;
  metrics?: ServerMetrics;
  networkInfo?: NetworkInfo;
  lastSeen: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerMetrics {
  cpuPercent: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  loadAverage: [number, number, number];
}

export interface NetworkInfo {
  ipAddress: string | null;
  macAddress: string | null;
}

export type AgentStatus = 'online' | 'offline' | 'error';
