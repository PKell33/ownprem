import { useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '../stores/useStore';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { updateServerStatus, updateDeploymentStatus, setConnected } = useStore();

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
        lastSeen: data.timestamp,
      });
    });

    socket.on('server:connected', (data: { serverId: string }) => {
      updateServerStatus(data.serverId, { agentStatus: 'online' });
    });

    socket.on('server:disconnected', (data: { serverId: string }) => {
      updateServerStatus(data.serverId, { agentStatus: 'offline' });
    });

    socket.on('deployment:status', (data: DeploymentStatusEvent) => {
      updateDeploymentStatus(data.deploymentId, data.status, data.message);
    });

    socket.on('command:result', (data: CommandResultEvent) => {
      console.log(`Command ${data.commandId}: ${data.status}`);
    });

    socketRef.current = socket;
  }, [updateServerStatus, updateDeploymentStatus, setConnected]);

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
}

interface DeploymentStatusEvent {
  deploymentId: string;
  status: string;
  message?: string;
}

interface CommandResultEvent {
  serverId: string;
  commandId: string;
  status: 'success' | 'error';
  message?: string;
}
