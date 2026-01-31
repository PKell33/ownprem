import { create } from 'zustand';

interface StoreState {
  // WebSocket connection status
  connected: boolean;
  setConnected: (connected: boolean) => void;

  // UI state
  selectedServerId: string | null;
  setSelectedServerId: (id: string | null) => void;

  installModalOpen: boolean;
  installModalApp: string | null;
  openInstallModal: (appName: string) => void;
  closeInstallModal: () => void;
}

export const useStore = create<StoreState>((set) => ({
  // WebSocket connection status
  connected: false,
  setConnected: (connected) => set({ connected }),

  // UI state
  selectedServerId: null,
  setSelectedServerId: (id) => set({ selectedServerId: id }),

  installModalOpen: false,
  installModalApp: null,
  openInstallModal: (appName) => set({ installModalOpen: true, installModalApp: appName }),
  closeInstallModal: () => set({ installModalOpen: false, installModalApp: null }),
}));
