import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, CreateMountData, UpdateMountData, AssignMountData } from '../api/client';

// Server queries
export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: api.getServers,
    refetchInterval: 30000,
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
    staleTime: 30000, // Server list changes rarely
  });
}

export function useServer(id: string) {
  return useQuery({
    queryKey: ['servers', id],
    queryFn: () => api.getServer(id),
    enabled: !!id,
  });
}

// Umbrel App Store hooks
export function useUmbrelApps(category?: string) {
  return useQuery({
    queryKey: ['umbrelApps', category],
    queryFn: () => api.getApps(category),
    staleTime: 5 * 60 * 1000, // 5 minutes - app catalog is relatively stable
  });
}

export function useUmbrelApp(id: string) {
  return useQuery({
    queryKey: ['umbrelApps', id],
    queryFn: () => api.getApp(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUmbrelCategories() {
  return useQuery({
    queryKey: ['umbrelCategories'],
    queryFn: api.getAppCategories,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useUmbrelSyncStatus() {
  return useQuery({
    queryKey: ['umbrelSyncStatus'],
    queryFn: api.getAppSyncStatus,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useSyncUmbrelApps() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.syncApps,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['umbrelApps'] });
      queryClient.invalidateQueries({ queryKey: ['umbrelCategories'] });
      queryClient.invalidateQueries({ queryKey: ['umbrelSyncStatus'] });
    },
  });
}

// Start9 App Store hooks
export function useStart9Apps() {
  return useQuery({
    queryKey: ['start9Apps'],
    queryFn: api.getStart9Apps,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useStart9App(id: string) {
  return useQuery({
    queryKey: ['start9Apps', id],
    queryFn: () => api.getStart9App(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useStart9SyncStatus() {
  return useQuery({
    queryKey: ['start9SyncStatus'],
    queryFn: api.getStart9SyncStatus,
    staleTime: 60 * 1000,
  });
}

export function useSyncStart9Apps() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.syncStart9Apps,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['start9Apps'] });
      queryClient.invalidateQueries({ queryKey: ['start9SyncStatus'] });
    },
  });
}

export function useLoadStart9Image() {
  return useMutation({
    mutationFn: (appId: string) => api.loadStart9Image(appId),
  });
}

// System status
export function useSystemStatus() {
  return useQuery({
    queryKey: ['system', 'status'],
    queryFn: api.getSystemStatus,
    refetchInterval: 10000,
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
    staleTime: 10000, // System status relatively stable
  });
}

// Mount queries
export function useMounts() {
  return useQuery({
    queryKey: ['mounts'],
    queryFn: api.getMounts,
    staleTime: 60000, // 1 minute - mount definitions change rarely
  });
}

export function useServerMounts() {
  return useQuery({
    queryKey: ['serverMounts'],
    queryFn: api.getServerMounts,
    refetchInterval: 30000,
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
    staleTime: 30000, // Mount status changes rarely
  });
}

// Mount mutations
export function useCreateMount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMountData) => api.createMount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounts'] });
    },
  });
}

export function useUpdateMount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMountData }) => api.updateMount(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounts'] });
    },
  });
}

export function useDeleteMount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteMount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounts'] });
      queryClient.invalidateQueries({ queryKey: ['serverMounts'] });
    },
  });
}

export function useAssignMount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AssignMountData) => api.assignMountToServer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverMounts'] });
    },
  });
}

export function useMountStorage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverMountId: string) => api.mountStorage(serverMountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverMounts'] });
    },
  });
}

export function useUnmountStorage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverMountId: string) => api.unmountStorage(serverMountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverMounts'] });
    },
  });
}

export function useDeleteServerMount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverMountId: string) => api.deleteServerMount(serverMountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverMounts'] });
    },
  });
}
