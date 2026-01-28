import { create } from 'zustand';
import type { Server, Deployment, ServerMetrics } from '../api/client';

interface StoreState {
  // Connection
  connected: boolean;
  setConnected: (connected: boolean) => void;

  // Servers cache
  servers: Map<string, Partial<Server>>;
  updateServerStatus: (serverId: string, update: Partial<Server>) => void;

  // Deployments cache
  deployments: Map<string, Partial<Deployment>>;
  updateDeploymentStatus: (deploymentId: string, status: string, message?: string) => void;

  // UI state
  selectedServerId: string | null;
  setSelectedServerId: (id: string | null) => void;

  installModalOpen: boolean;
  installModalApp: string | null;
  openInstallModal: (appName: string) => void;
  closeInstallModal: () => void;
}

export const useStore = create<StoreState>((set) => ({
  // Connection
  connected: false,
  setConnected: (connected) => set({ connected }),

  // Servers cache
  servers: new Map(),
  updateServerStatus: (serverId, update) =>
    set((state) => {
      const servers = new Map(state.servers);
      const existing = servers.get(serverId) || {};
      servers.set(serverId, { ...existing, ...update });
      return { servers };
    }),

  // Deployments cache
  deployments: new Map(),
  updateDeploymentStatus: (deploymentId, status, message) =>
    set((state) => {
      const deployments = new Map(state.deployments);
      const existing = deployments.get(deploymentId) || {};
      deployments.set(deploymentId, { ...existing, status, statusMessage: message });
      return { deployments };
    }),

  // UI state
  selectedServerId: null,
  setSelectedServerId: (id) => set({ selectedServerId: id }),

  installModalOpen: false,
  installModalApp: null,
  openInstallModal: (appName) => set({ installModalOpen: true, installModalApp: appName }),
  closeInstallModal: () => set({ installModalOpen: false, installModalApp: null }),
}));
