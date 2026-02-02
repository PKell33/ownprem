import { create } from 'zustand';

export interface SyncProgress {
  syncId: string;
  storeType: string;
  registryId: string;
  registryName: string;
  phase: 'fetching' | 'processing' | 'complete';
  currentApp?: string;
  processed: number;
  total: number;
  errors: string[];
  timestamp: string;
}

export interface SyncComplete {
  syncId: string;
  storeType: string;
  registryId: string;
  registryName: string;
  synced: number;
  updated: number;
  removed: number;
  errors: string[];
  duration: number;
  timestamp: string;
}

interface SyncProgressState {
  // Current sync progress (null when not syncing)
  currentSync: SyncProgress | null;

  // Last completed sync result (for showing summary)
  lastComplete: SyncComplete | null;

  // Actions
  updateProgress: (progress: SyncProgress) => void;
  setComplete: (complete: SyncComplete) => void;
  clear: () => void;
}

export const useSyncProgressStore = create<SyncProgressState>((set) => ({
  currentSync: null,
  lastComplete: null,

  updateProgress: (progress) => set({ currentSync: progress }),

  setComplete: (complete) => set({
    currentSync: null,
    lastComplete: complete
  }),

  clear: () => set({ currentSync: null, lastComplete: null }),
}));
