import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth, type AuthUser } from '../services/auth';
import { analytics } from '../services/analytics';
import { jsonStorage, STORE_KEYS } from './persist';

interface AuthState {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      status: 'loading',
      error: null,

      hydrate: async () => {
        try {
          const user = await auth.getCurrentUser();
          set({ user, status: user ? 'authenticated' : 'unauthenticated' });
        } catch {
          set({ status: 'unauthenticated' });
        }
      },

      signIn: async (email, password) => {
        set({ error: null });
        try {
          const user = await auth.signIn(email.trim(), password);
          set({ user, status: 'authenticated' });
        } catch (e) {
          set({ error: (e as Error).message });
          throw e;
        }
      },

      signUp: async (email, password) => {
        set({ error: null });
        try {
          const user = await auth.signUp(email.trim(), password);
          set({ user, status: 'authenticated' });
        } catch (e) {
          set({ error: (e as Error).message });
          throw e;
        }
      },

      signOut: async () => {
        await auth.signOut();
        set({ user: null, status: 'unauthenticated' });
      },

      deleteAccount: async () => {
        const u = get().user;
        if (u) await auth.deleteAccount(u.id);
        analytics.track('subscription_cancelled', { result: 'account_deleted' });
        set({ user: null, status: 'unauthenticated' });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: STORE_KEYS.auth,
      storage: jsonStorage(),
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => (state) => {
        // After rehydrating a persisted user, confirm against the auth provider.
        state?.hydrate();
      },
    },
  ),
);
