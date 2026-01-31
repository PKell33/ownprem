import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserGroupMembership {
  groupId: string;
  groupName: string;
  role: 'admin' | 'operator' | 'viewer';
  totpRequired: boolean;
}

interface User {
  userId: string;
  username: string;
  isSystemAdmin: boolean;
  groups: UserGroupMembership[];
  totpEnabled?: boolean;
  totpRequired?: boolean;
}

interface AuthState {
  // User info only - tokens are now stored in httpOnly cookies (not accessible to JS)
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  totpSetupRequired: boolean;

  // Actions
  setAuthenticated: (user: User) => void;
  setUser: (user: User) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setTotpSetupRequired: (required: boolean) => void;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      totpSetupRequired: false,

      setAuthenticated: (user) =>
        set({
          user,
          isAuthenticated: true,
          error: null,
        }),

      setUser: (user) => set({ user }),

      setError: (error) => set({ error, isLoading: false }),

      setLoading: (isLoading) => set({ isLoading }),

      setTotpSetupRequired: (required) => set({ totpSetupRequired: required }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          error: null,
          totpSetupRequired: false,
        }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'ownprem-auth',
      // Only persist user info and auth state - tokens are in httpOnly cookies
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        totpSetupRequired: state.totpSetupRequired,
      }),
    }
  )
);
