import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { api, AuditLogEntry } from '../../../api/client';

const PAGE_SIZE = 20;

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState<string>('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAuditLogs({
        limit: PAGE_SIZE,
        offset,
        action: selectedAction || undefined,
      });
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchActions = async () => {
    try {
      const data = await api.getAuditLogActions();
      setActions(data);
    } catch {
      // Ignore errors for action list
    }
  };

  useEffect(() => {
    fetchActions();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [offset, selectedAction]);

  const handlePrevPage = () => {
    setOffset(Math.max(0, offset - PAGE_SIZE));
  };

  const handleNextPage = () => {
    if (offset + PAGE_SIZE < total) {
      setOffset(offset + PAGE_SIZE);
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('failed') || action.includes('deleted')) return 'text-red-500';
    if (action.includes('created') || action === 'login') return 'text-green-500';
    if (action.includes('changed')) return 'text-yellow-500';
    return 'text-muted';
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted" />
          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setOffset(0);
            }}
            className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm"
          >
            <option value="">All actions</option>
            {actions.map(action => (
              <option key={action} value={action}>{formatAction(action)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted" />
          </div>
        ) : error ? (
          <div className="p-4 flex items-center gap-3 text-red-500">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-muted">
            No audit logs found
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted">Time</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted">Action</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted">User</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted">IP Address</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-[var(--bg-secondary)]">
                      <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${getActionColor(log.action)}`}>
                          {formatAction(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {log.username || <span className="text-muted">-</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted font-mono">
                        {log.ipAddress || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {log.details && Object.keys(log.details).length > 0 ? (
                          <span className="text-xs bg-[var(--bg-tertiary)] px-2 py-1 rounded font-mono">
                            {JSON.stringify(log.details)}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-[var(--border-color)] flex items-center justify-between">
              <span className="text-sm text-muted">
                Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={offset === 0}
                  className="p-2 hover:bg-[var(--bg-tertiary)] rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={offset + PAGE_SIZE >= total}
                  className="p-2 hover:bg-[var(--bg-tertiary)] rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
