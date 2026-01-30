import { useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../stores/useStore';
import { useMetricsStore } from '../stores/useMetricsStore';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const { updateServerStatus, updateDeploymentStatus, setConnected } = useStore();
  const { addMetrics } = useMetricsStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    const socket = io({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    socket.on('server:status', (data: ServerStatusEvent) => {
      updateServerStatus(data.serverId, {
        agentStatus: 'online',
        metrics: data.metrics,
        networkInfo: data.networkInfo,
        lastSeen: data.timestamp,
      });
      // Store metrics history for charts
      if (data.metrics) {
        addMetrics(data.serverId, data.metrics);
      }
    });

    socket.on('server:connected', (data: { serverId: string }) => {
      updateServerStatus(data.serverId, { agentStatus: 'online' });
    });

    socket.on('server:disconnected', (data: { serverId: string }) => {
      updateServerStatus(data.serverId, { agentStatus: 'offline' });
    });

    socket.on('deployment:status', (data: DeploymentStatusEvent) => {
      updateDeploymentStatus(data.deploymentId, data.status, data.message);
      // Invalidate deployments query to trigger a refetch with updated data
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    });

    socket.on('command:result', (data: CommandResultEvent) => {
      console.log(`Command ${data.commandId}: ${data.status}`);
    });

    socketRef.current = socket;
  }, [updateServerStatus, updateDeploymentStatus, setConnected, addMetrics, queryClient]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connect, disconnect };
}

interface ServerStatusEvent {
  serverId: string;
  timestamp: string;
  metrics: {
    cpuPercent: number;
    memoryUsed: number;
    memoryTotal: number;
    diskUsed: number;
    diskTotal: number;
    loadAverage: [number, number, number];
  };
  networkInfo?: {
    ipAddress: string | null;
    macAddress: string | null;
  };
}

interface DeploymentStatusEvent {
  deploymentId: string;
  appName: string;
  serverId: string;
  status: string;
  previousStatus?: string;
  routeActive?: boolean;
  message?: string;
  timestamp: string;
}

interface CommandResultEvent {
  serverId: string;
  commandId: string;
  status: 'success' | 'error';
  message?: string;
}
