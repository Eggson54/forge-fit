import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth, type AuthUser } from '../services/auth';
import { analytics } from '../services/analytics';
import { jsonStorage, STORE_KEYS } from './persist';

interface AuthState {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  /**
   * Whether an account has ever been signed into on this device. It survives
   * signing out, which is the point: a returning user should land on sign-in,
   * and a first-run install should not be greeted with "Welcome back."
   */
  seenAccount: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      status: 'loading',
      seenAccount: false,
      error: null,

      hydrate: async () => {
        try {
          const user = await auth.getCurrentUser();
          set({
            user,
            status: user ? 'authenticated' : 'unauthenticated',
            seenAccount: get().seenAccount || !!user,
          });
        } catch {
          set({ status: 'unauthenticated' });
        }
      },

      signIn: async (email, password) => {
        set({ error: null });
        try {
          const user = await auth.signIn(email.trim(), password);
          set({ user, status: 'authenticated', seenAccount: true });
        } catch (e) {
          set({ error: (e as Error).message });
          throw e;
        }
      },

      signUp: async (email, password) => {
        set({ error: null });
        try {
          const user = await auth.signUp(email.trim(), password);
          set({ user, status: 'authenticated', seenAccount: true });
        } catch (e) {
          set({ error: (e as Error).message });
          throw e;
        }
      },

      signInWithGoogle: async () => {
        set({ error: null });
        try {
          const user = await auth.signInWithGoogle();
          set({ user, status: 'authenticated', seenAccount: true });
        } catch (e) {
          set({ error: (e as Error).message });
          throw e;
        }
      },

      signInWithApple: async () => {
        set({ error: null });
        try {
          const user = await auth.signInWithApple();
          set({ user, status: 'authenticated', seenAccount: true });
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
        if (u) await auth.deleteAccount();
        analytics.track('subscription_cancelled', { result: 'account_deleted' });
        // Deleting the account really does return the device to first-run, so
        // this flag goes with it rather than lingering as a trace.
        set({ user: null, status: 'unauthenticated', seenAccount: false });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: STORE_KEYS.auth,
      storage: jsonStorage(),
      partialize: (s) => ({ user: s.user, seenAccount: s.seenAccount }),
      onRehydrateStorage: () => (state) => {
        // After rehydrating a persisted user, confirm against the auth provider.
        state?.hydrate();
      },
    },
  ),
);
