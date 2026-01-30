import { useState, useEffect } from 'react';
import { api, ProxyRoute } from '../api/client';
import { Loader2, AlertCircle, Globe, Server, ArrowRight } from 'lucide-react';

interface CaddyRoutesPanelProps {
  isVisible: boolean;
}

export default function CaddyRoutesPanel({ isVisible }: CaddyRoutesPanelProps) {
  const [routes, setRoutes] = useState<ProxyRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isVisible) return;

    const fetchRoutes = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getProxyRoutes();
        setRoutes(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load routes');
      } finally {
        setLoading(false);
      }
    };

    fetchRoutes();
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="pt-4 border-t border-[var(--border-color)]">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={16} className="text-muted" />
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">Active Proxy Routes</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      ) : routes.length === 0 ? (
        <div className="text-sm text-muted py-2">No active routes configured</div>
      ) : (
        <div className="space-y-2">
          {routes.map((route, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-2 bg-[var(--bg-primary)] rounded-lg text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <code className="text-blue-400 truncate">{route.path}</code>
                <ArrowRight size={12} className="text-muted flex-shrink-0" />
                <code className="text-green-400 truncate">{route.upstream}</code>
              </div>
              <div className="flex items-center gap-1 text-muted text-xs flex-shrink-0">
                <Server size={12} />
                <span>{route.serverName}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
