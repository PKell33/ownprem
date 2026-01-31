import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Download, Search, X, ChevronDown, Database, FileText, Radio } from 'lucide-react';
import { api, LogsResponse } from '../api/client';
import { useLogStream } from '../hooks/useLogStream';
import Modal from './Modal';

interface LogViewerModalProps {
  deploymentId: string;
  appName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function LogViewerModal({
  deploymentId,
  appName,
  isOpen,
  onClose,
}: LogViewerModalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'journalctl' | 'file' | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [streamMode, setStreamMode] = useState(false);
  const [lines, setLines] = useState(100);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket log streaming
  const logStream = useLogStream(streamMode && isOpen ? deploymentId : null, {
    maxLines: 1000,
  });

  const fetchLogs = useCallback(async (grep?: string, lineCount?: number) => {
    setLoading(true);
    setError(null);

    try {
      const result: LogsResponse = await api.getDeploymentLogs(deploymentId, {
        lines: lineCount || lines,
        grep: grep || undefined,
      });

      if (result.status === 'error') {
        setError(result.message || 'Failed to fetch logs');
        setLogs([]);
      } else {
        setLogs(result.logs);
        setSource(result.source);
        setHasMore(result.hasMore);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [deploymentId, lines]);

  useEffect(() => {
    if (isOpen) {
      if (!streamMode) {
        fetchLogs();
      }
    } else {
      // Reset state when modal closes
      setLogs([]);
      setError(null);
      setFilter('');
      setAppliedFilter('');
      setAutoRefresh(false);
      setStreamMode(false);
    }
  }, [isOpen, fetchLogs, streamMode]);

  // Handle stream mode changes
  useEffect(() => {
    if (streamMode && isOpen) {
      logStream.subscribe();
      setAutoRefresh(false); // Disable polling when streaming
    } else {
      logStream.unsubscribe();
    }
  }, [streamMode, isOpen, logStream]);

  // Combine HTTP-fetched logs with streamed logs when streaming
  const displayLogs = streamMode ? [...logs, ...logStream.lines] : logs;

  useEffect(() => {
    if (autoRefresh && isOpen) {
      autoRefreshIntervalRef.current = setInterval(() => {
        fetchLogs(appliedFilter);
      }, 5000);
    }

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, isOpen, appliedFilter, fetchLogs]);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleRefresh = () => {
    fetchLogs(appliedFilter);
  };

  const handleApplyFilter = () => {
    setAppliedFilter(filter);
    fetchLogs(filter);
  };

  const handleClearFilter = () => {
    setFilter('');
    setAppliedFilter('');
    fetchLogs('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApplyFilter();
    }
  };

  const handleLoadMore = () => {
    const newLines = Math.min(lines + 200, 1000);
    setLines(newLines);
    fetchLogs(appliedFilter, newLines);
  };

  const handleDownload = () => {
    const content = displayLogs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-logs-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Logs: ${appName}`} size="lg">
      <div className="flex flex-col h-[70vh]">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Filter input */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Filter logs (regex supported)"
              className="w-full pl-9 pr-8 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {filter && (
              <button
                onClick={handleClearFilter}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Clear filter"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          <button
            onClick={handleApplyFilter}
            className="px-3 py-2 bg-accent hover:bg-accent/90 text-slate-900 text-sm font-medium rounded-lg transition-colors"
          >
            Apply
          </button>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh logs"
            aria-label="Refresh logs"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>

          {/* Stream toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer" title="Real-time log streaming">
            <input
              type="checkbox"
              checked={streamMode}
              onChange={(e) => setStreamMode(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-accent focus:ring-accent"
            />
            <Radio size={14} className={logStream.isStreaming ? 'text-green-500' : ''} />
            Stream
          </label>

          {/* Auto-refresh toggle (only when not streaming) */}
          {!streamMode && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-accent focus:ring-accent"
              />
              Auto-refresh
            </label>
          )}

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={displayLogs.length === 0}
            className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Download logs"
          >
            <Download size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Log source indicator */}
        {source && (
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
            {source === 'journalctl' ? (
              <><Database size={12} /> Reading from systemd journal</>
            ) : (
              <><FileText size={12} /> Reading from log file</>
            )}
            {appliedFilter && (
              <span className="ml-2 px-2 py-0.5 bg-accent/20 text-accent rounded">
                Filtered: {appliedFilter}
              </span>
            )}
          </div>
        )}

        {/* Log display - always dark for readability */}
        <div
          ref={logContainerRef}
          className="flex-1 bg-gray-800 dark:bg-gray-900 rounded-lg overflow-auto font-mono text-xs p-4"
        >
          {loading && displayLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <RefreshCw className="animate-spin mr-2" size={16} />
              Loading logs...
            </div>
          ) : logStream.isConnecting ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <RefreshCw className="animate-spin mr-2" size={16} />
              Connecting to log stream...
            </div>
          ) : (error || logStream.error) ? (
            <div className="flex items-center justify-center h-full text-red-400">
              {error || logStream.error}
            </div>
          ) : displayLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              {streamMode ? 'Waiting for new log lines...' : 'No logs available'}
            </div>
          ) : (
            <div className="space-y-0.5">
              {displayLogs.map((line, index) => (
                <div
                  key={index}
                  className="text-gray-200 hover:bg-gray-700 dark:hover:bg-gray-800 px-1 -mx-1 rounded whitespace-pre-wrap break-all"
                >
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Load more button */}
        {hasMore && !loading && (
          <button
            onClick={handleLoadMore}
            className="mt-3 w-full py-2 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 transition-colors"
          >
            <ChevronDown size={16} />
            Load more logs ({lines}/1000)
          </button>
        )}

        {/* Status bar */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            {displayLogs.length} line{displayLogs.length !== 1 ? 's' : ''} shown
            {streamMode && logStream.lines.length > 0 && (
              <span className="text-green-500 ml-2">
                (+{logStream.lines.length} streamed)
              </span>
            )}
          </span>
          {logStream.isStreaming && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Streaming live
            </span>
          )}
          {autoRefresh && !streamMode && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Auto-refreshing every 5s
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
