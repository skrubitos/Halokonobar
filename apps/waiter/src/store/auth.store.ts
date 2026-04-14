import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Staff } from '@halokonobar/types';

interface AuthState {
  accessToken: string | null;
  staff: Omit<Staff, 'clubId'> | null;

  setAuth: (token: string, staff: Omit<Staff, 'clubId'>) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      staff: null,

      setAuth: (accessToken, staff) => set({ accessToken, staff }),
      clearAuth: () => set({ accessToken: null, staff: null }),
      isAuthenticated: () => !!get().accessToken,
    }),
    { name: 'hk_waiter_auth' }
  )
);
