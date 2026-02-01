import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, RefreshCw, Search, ExternalLink, Play, Loader2, Filter } from 'lucide-react';
import { api, type UmbrelApp, type Server } from '../api/client';
import { showSuccess, showError } from '../lib/toast';
import { InstallModal } from '../components/InstallModal';
import { AppDetailModal } from '../components/AppDetailModal';

/**
 * Apps page - Browse and install apps from the Umbrel App Store
 */
export default function Apps() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedApp, setSelectedApp] = useState<UmbrelApp | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch categories
  const { data: categoriesData, error: categoriesError } = useQuery({
    queryKey: ['apps', 'categories'],
    queryFn: () => api.getAppCategories(),
  });

  // Debug: log categories data
  if (categoriesError) {
    console.error('Categories error:', categoriesError);
  }

  // Fetch apps (filtered by category if selected)
  const { data: appsData, isLoading, error, refetch } = useQuery({
    queryKey: ['apps', selectedCategory],
    queryFn: () => api.getApps(selectedCategory || undefined),
  });

  // Fetch sync status
  const { data: syncStatus } = useQuery({
    queryKey: ['apps', 'status'],
    queryFn: () => api.getAppSyncStatus(),
  });

  // Fetch servers for installation target selection
  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api.getServers(),
  });

  // Fetch deployments to show installed status
  const { data: deploymentsData } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
  });

  // Sync apps mutation
  const syncMutation = useMutation({
    mutationFn: () => api.syncApps(),
    onSuccess: (data) => {
      showSuccess(`Synced ${data.synced} apps from Umbrel App Store`);
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => {
      showError(err instanceof Error ? err.message : 'Failed to sync apps');
    },
  });

  // Deploy app mutation
  const deployMutation = useMutation({
    mutationFn: ({ serverId, appId }: { serverId: string; appId: string }) =>
      api.deployApp(serverId, appId),
    onSuccess: (data) => {
      showSuccess(`Started deploying ${data.appName}`);
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setShowInstallModal(false);
      setSelectedApp(null);
    },
    onError: (err) => {
      showError(err instanceof Error ? err.message : 'Failed to deploy app');
    },
  });

  // Filter apps by search
  const filteredApps = appsData?.apps.filter((app) => {
    const query = searchQuery.toLowerCase();
    return (
      app.name.toLowerCase().includes(query) ||
      app.tagline.toLowerCase().includes(query) ||
      app.description.toLowerCase().includes(query)
    );
  }) || [];

  // Check if an app is installed
  const isAppInstalled = (appId: string) => {
    return deploymentsData?.deployments.some((d) => d.appId === appId);
  };

  // Get deployment for an app
  const getAppDeployment = (appId: string) => {
    return deploymentsData?.deployments.find((d) => d.appId === appId);
  };

  const handleAppClick = (app: UmbrelApp) => {
    setSelectedApp(app);
    setShowDetailModal(true);
  };

  const handleInstallClick = (app: UmbrelApp, e?: React.MouseEvent) => {
    e?.stopPropagation(); // Prevent opening detail modal
    setSelectedApp(app);
    setShowInstallModal(true);
  };

  const handleInstallFromDetail = () => {
    setShowDetailModal(false);
    setShowInstallModal(true);
  };

  const handleInstall = (serverId: string) => {
    if (!selectedApp) return;
    deployMutation.mutate({ serverId, appId: selectedApp.id });
  };

  // Show empty state if no apps synced yet
  if (!isLoading && syncStatus?.appCount === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Apps</h1>
          <p className="text-muted">Deploy and manage Docker applications</p>
        </div>

        <div className="card p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center mx-auto mb-6">
            <Package size={40} className="text-accent" />
          </div>

          <h2 className="text-xl font-semibold mb-3">Sync Apps from Umbrel</h2>

          <p className="text-muted max-w-md mx-auto mb-6">
            Click the button below to sync available apps from the Umbrel App Store.
            This will fetch Bitcoin apps that you can deploy to your servers.
          </p>

          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            {syncMutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Sync Apps
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">Apps</h1>
          <p className="text-muted">
            {syncStatus?.appCount || 0} apps available from Umbrel App Store
          </p>
        </div>

        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="btn btn-secondary inline-flex items-center gap-2"
        >
          {syncMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          Sync
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg focus:outline-none focus:border-accent"
          />
        </div>

        <div className="relative">
          <Filter
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="pl-10 pr-8 py-2 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg focus:outline-none focus:border-accent appearance-none cursor-pointer min-w-[180px]"
          >
            <option value="">All Categories ({categoriesData?.categories?.length ?? 0})</option>
            {categoriesData?.categories?.map((cat) => (
              <option key={cat.category} value={cat.category}>
                {cat.category.charAt(0).toUpperCase() + cat.category.slice(1)} ({cat.count})
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="text-muted">
              <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="card p-8 text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4 text-accent" />
          <p className="text-muted">Loading apps...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card p-8 text-center border-red-500">
          <p className="text-red-500 mb-4">
            {error instanceof Error ? error.message : 'Failed to load apps'}
          </p>
          <button onClick={() => refetch()} className="btn btn-secondary">
            Retry
          </button>
        </div>
      )}

      {/* Apps grid */}
      {!isLoading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredApps.map((app) => {
            const installed = isAppInstalled(app.id);
            const deployment = getAppDeployment(app.id);

            return (
              <div
                key={app.id}
                onClick={() => handleAppClick(app)}
                className="card p-4 flex flex-col hover:border-accent transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-4 mb-3">
                  <img
                    src={app.icon}
                    alt={app.name}
                    className="w-12 h-12 rounded-lg bg-[var(--bg-tertiary)]"
                    onError={(e) => {
                      // Fallback to Package icon on error
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{app.name}</h3>
                    <p className="text-sm text-muted truncate">{app.developer}</p>
                  </div>
                  <span className="text-xs text-muted">{app.version}</span>
                </div>

                <p className="text-sm text-[var(--text-secondary)] mb-4 line-clamp-2 flex-1">
                  {app.tagline}
                </p>

                <div className="flex items-center justify-between">
                  <a
                    href={app.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:underline inline-flex items-center gap-1"
                  >
                    Website
                    <ExternalLink size={12} />
                  </a>

                  {installed ? (
                    <span
                      className={`text-sm px-2 py-1 rounded ${
                        deployment?.status === 'running'
                          ? 'bg-green-500/20 text-green-500'
                          : deployment?.status === 'error'
                          ? 'bg-red-500/20 text-red-500'
                          : 'bg-yellow-500/20 text-yellow-500'
                      }`}
                    >
                      {deployment?.status || 'installed'}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleInstallClick(app)}
                      className="btn btn-primary btn-sm inline-flex items-center gap-1"
                    >
                      <Play size={14} />
                      Install
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No results */}
      {!isLoading && !error && filteredApps.length === 0 && searchQuery && (
        <div className="card p-8 text-center">
          <p className="text-muted">No apps matching "{searchQuery}"</p>
        </div>
      )}

      {/* Install Modal */}
      {showInstallModal && selectedApp && (
        <InstallModal
          app={selectedApp}
          servers={(servers || []).filter((s: Server) => s.agentStatus === 'online')}
          onInstall={handleInstall}
          onClose={() => {
            setShowInstallModal(false);
            setSelectedApp(null);
          }}
          isInstalling={deployMutation.isPending}
        />
      )}

      {/* App Detail Modal */}
      {showDetailModal && selectedApp && (
        <AppDetailModal
          app={selectedApp}
          servers={(servers || []).filter((s: Server) => s.agentStatus === 'online')}
          isInstalled={isAppInstalled(selectedApp.id) || false}
          deploymentStatus={getAppDeployment(selectedApp.id)?.status}
          onInstall={handleInstallFromDetail}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedApp(null);
          }}
        />
      )}
    </div>
  );
}
