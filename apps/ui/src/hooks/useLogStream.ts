import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface LogStreamState {
  lines: string[];
  status: 'idle' | 'connecting' | 'streaming' | 'error' | 'stopped';
  error: string | null;
  streamId: string | null;
}

interface UseLogStreamOptions {
  maxLines?: number;
  onLine?: (line: string) => void;
}

export function useLogStream(
  deploymentId: string | null,
  options: UseLogStreamOptions = {}
) {
  const { maxLines = 1000, onLine } = options;
  const [state, setState] = useState<LogStreamState>({
    lines: [],
    status: 'idle',
    error: null,
    streamId: null,
  });

  const socketRef = useRef<Socket | null>(null);
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  const subscribe = useCallback(() => {
    if (!deploymentId || socketRef.current?.connected) {
      return;
    }

    setState(prev => ({ ...prev, status: 'connecting', error: null }));

    const socket = io({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      // Subscribe to log stream for this deployment
      socket.emit('subscribe:logs', { deploymentId });
    });

    socket.on('disconnect', () => {
      setState(prev => ({ ...prev, status: 'stopped', error: null }));
    });

    // Handle log lines
    socket.on('deployment:log', (data: {
      deploymentId: string;
      streamId: string;
      line: string;
      timestamp: string;
    }) => {
      if (data.deploymentId !== deploymentId) return;

      setState(prev => {
        const newLines = [...prev.lines, data.line];
        // Trim to maxLines
        if (newLines.length > maxLines) {
          newLines.splice(0, newLines.length - maxLines);
        }
        return {
          ...prev,
          lines: newLines,
          streamId: data.streamId,
        };
      });

      if (onLineRef.current) {
        onLineRef.current(data.line);
      }
    });

    // Handle stream status updates
    socket.on('deployment:log:status', (data: {
      deploymentId: string;
      streamId?: string;
      status: 'started' | 'stopped' | 'error';
      message?: string;
    }) => {
      if (data.deploymentId !== deploymentId) return;

      if (data.status === 'started') {
        setState(prev => ({
          ...prev,
          status: 'streaming',
          streamId: data.streamId || prev.streamId,
          error: null,
        }));
      } else if (data.status === 'error') {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: data.message || 'Stream error',
        }));
      } else if (data.status === 'stopped') {
        setState(prev => ({
          ...prev,
          status: 'stopped',
        }));
      }
    });

    socketRef.current = socket;
  }, [deploymentId, maxLines]);

  const unsubscribe = useCallback(() => {
    if (socketRef.current) {
      if (state.streamId) {
        socketRef.current.emit('unsubscribe:logs', {
          deploymentId,
          streamId: state.streamId,
        });
      }
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setState({
      lines: [],
      status: 'idle',
      error: null,
      streamId: null,
    });
  }, [deploymentId, state.streamId]);

  const clearLines = useCallback(() => {
    setState(prev => ({ ...prev, lines: [] }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    ...state,
    subscribe,
    unsubscribe,
    clearLines,
    isStreaming: state.status === 'streaming',
    isConnecting: state.status === 'connecting',
  };
}
