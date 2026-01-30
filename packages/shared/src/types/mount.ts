export type MountType = 'nfs' | 'cifs';
export type MountStatus = 'pending' | 'mounting' | 'mounted' | 'unmounted' | 'error';

export interface Mount {
  id: string;
  name: string;
  mountType: MountType;
  source: string;
  defaultOptions: string | null;
  hasCredentials: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerMount {
  id: string;
  serverId: string;
  mountId: string;
  mountPoint: string;
  options: string | null;
  purpose: string | null;
  autoMount: boolean;
  status: MountStatus;
  statusMessage: string | null;
  lastChecked: Date | null;
  usageBytes: number | null;
  totalBytes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServerMountWithDetails extends ServerMount {
  mount: Mount;
  serverName: string;
}

export interface MountCredentials {
  username: string;
  password: string;
  domain?: string;
}

export interface MountCommandPayload {
  mountType: MountType;
  source: string;
  mountPoint: string;
  options?: string;
  credentials?: MountCredentials;
}

export interface MountCheckResult {
  mounted: boolean;
  usage?: {
    used: number;
    total: number;
  };
}
