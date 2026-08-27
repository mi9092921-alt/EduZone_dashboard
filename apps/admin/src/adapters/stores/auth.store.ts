import { create } from 'zustand';
import { PermissionName } from '@eduzone/types';

/** Primary role types */
export type PrimaryRole = 'super_admin' | 'admin' | 'teacher' | 'student';

/** Authenticated user state */
export interface AuthUser {
  id: string;
  email: string;
  primary_role: PrimaryRole;
  tenant_id: string;
  token_version: number;
  /** Cached permissions for the user in the current tenant */
  permissions: PermissionName[];
}

interface AuthState {
  /** Current authenticated user (null = not authenticated) */
  user: AuthUser | null;
  /** Whether initial auth check has completed */
  isInitialized: boolean;
  /** Whether auth is currently loading */
  isLoading: boolean;

  /** Set the authenticated user */
  setUser: (user: AuthUser | null) => void;
  /** Mark auth as initialized (first load complete) */
  setInitialized: () => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Update current user's permissions */
  setPermissions: (permissions: PermissionName[]) => void;
  /** Clear auth state (logout) */
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isInitialized: false,
  isLoading: true,

  setUser: (user) => set({ user, isLoading: false }),
  setInitialized: () => set({ isInitialized: true }),
  setLoading: (isLoading) => set({ isLoading }),
  setPermissions: (permissions) => 
    set((state) => ({
      user: state.user ? { ...state.user, permissions } : null
    })),
  logout: () => set({ user: null, isLoading: false }),
}));

// ── Derived selectors ──────────────────────────────────────────
export const useAuthUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => s.user !== null);
export const useIsAdmin = () =>
  useAuthStore((s) => s.user?.primary_role === 'admin' || s.user?.primary_role === 'super_admin');
export const useIsSuperAdmin = () =>
  useAuthStore((s) => s.user?.primary_role === 'super_admin');
export const useIsTeacher = () =>
  useAuthStore((s) => s.user?.primary_role === 'teacher');
export const useAuthPermissions = () =>
  useAuthStore((s) => s.user?.permissions || []);
export const useAuthLoading = () =>
  useAuthStore((s) => s.isLoading || !s.isInitialized);

