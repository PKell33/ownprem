import { create } from 'zustand';
import type { ServerMetrics } from '../api/client';

interface MetricsDataPoint {
  timestamp: number;
  cpu: number;
  memoryPercent: number;
  memoryUsed: number;
  diskPercent: number;
  diskUsed: number;
}

interface MetricsState {
  history: Record<string, MetricsDataPoint[]>;
  maxDataPoints: number;
  addMetrics: (serverId: string, metrics: ServerMetrics) => void;
  getServerHistory: (serverId: string) => MetricsDataPoint[];
  clearHistory: (serverId?: string) => void;
}

const MAX_DATA_POINTS = 60; // Keep last 60 data points (e.g., 60 minutes if updated every minute)

export const useMetricsStore = create<MetricsState>((set, get) => ({
  history: {},
  maxDataPoints: MAX_DATA_POINTS,

  addMetrics: (serverId: string, metrics: ServerMetrics) => {
    const timestamp = Date.now();
    const memoryPercent = metrics.memoryTotal > 0
      ? (metrics.memoryUsed / metrics.memoryTotal) * 100
      : 0;
    const diskPercent = metrics.diskTotal > 0
      ? (metrics.diskUsed / metrics.diskTotal) * 100
      : 0;

    const dataPoint: MetricsDataPoint = {
      timestamp,
      cpu: metrics.cpuPercent,
      memoryPercent: Math.round(memoryPercent * 10) / 10,
      memoryUsed: metrics.memoryUsed,
      diskPercent: Math.round(diskPercent * 10) / 10,
      diskUsed: metrics.diskUsed,
    };

    set((state) => {
      const current = state.history[serverId] || [];
      const updated = [...current, dataPoint].slice(-MAX_DATA_POINTS);
      return {
        history: {
          ...state.history,
          [serverId]: updated,
        },
      };
    });
  },

  getServerHistory: (serverId: string) => {
    return get().history[serverId] || [];
  },

  clearHistory: (serverId?: string) => {
    if (serverId) {
      set((state) => {
        const { [serverId]: _, ...rest } = state.history;
        return { history: rest };
      });
    } else {
      set({ history: {} });
    }
  },
}));

// Helper to format data for Recharts
export function formatMetricsForChart(history: MetricsDataPoint[]) {
  return history.map((point, index) => ({
    time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    index,
    cpu: point.cpu,
    memory: point.memoryPercent,
    disk: point.diskPercent,
  }));
}
