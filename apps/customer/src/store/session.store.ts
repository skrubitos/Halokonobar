import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NfcTapResponse } from '@halokonobar/types';

interface SessionState {
  sessionToken: string | null;
  expiresAt: string | null;
  club: NfcTapResponse['club'] | null;
  zone: NfcTapResponse['zone'] | null;
  tag: NfcTapResponse['tag'] | null;

  setSession: (data: NfcTapResponse) => void;
  clearSession: () => void;
  isValid: () => boolean;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessionToken: null,
      expiresAt: null,
      club: null,
      zone: null,
      tag: null,

      setSession: (data) =>
        set({
          sessionToken: data.sessionToken,
          expiresAt: data.expiresAt,
          club: data.club,
          zone: data.zone,
          tag: data.tag,
        }),

      clearSession: () =>
        set({ sessionToken: null, expiresAt: null, club: null, zone: null, tag: null }),

      isValid: () => {
        const { sessionToken, expiresAt } = get();
        if (!sessionToken || !expiresAt) return false;
        return new Date(expiresAt) > new Date();
      },
    }),
    { name: 'hk_session' }
  )
);
