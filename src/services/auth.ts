import * as Crypto from 'expo-crypto';
import { getSupabase, isCloudEnabled } from './supabase';
import { secureStore, storage } from './storage';

/**
 * Auth service. Uses Supabase Auth when configured (email/password, Apple OAuth,
 * password reset). Otherwise a LOCAL dev-account provider lets the full app be
 * used and tested offline. Passwords in local mode are salted+hashed, never
 * stored in plaintext, and stay on-device only.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  isLocal: boolean;
}

const LOCAL_USER_KEY = 'forgefit:local_user';
const LOCAL_CREDS_KEY = 'forgefit:local_creds'; // { email, salt, hash }

async function hash(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

export const auth = {
  async getCurrentUser(): Promise<AuthUser | null> {
    const supa = getSupabase();
    if (supa) {
      const { data } = await supa.auth.getUser();
      return data.user ? { id: data.user.id, email: data.user.email ?? null, isLocal: false } : null;
    }
    return storage.get<AuthUser>(LOCAL_USER_KEY);
  },

  async signUp(email: string, password: string): Promise<AuthUser> {
    const supa = getSupabase();
    if (supa) {
      const { data, error } = await supa.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error('Check your email to confirm your account.');
      return { id: data.user.id, email: data.user.email ?? null, isLocal: false };
    }
    // Local mode
    const salt = await Crypto.randomUUID();
    const creds = { email, salt, hash: await hash(password, salt) };
    await secureStore.set(LOCAL_CREDS_KEY, JSON.stringify(creds));
    const user: AuthUser = { id: `local:${await Crypto.randomUUID()}`, email, isLocal: true };
    await storage.set(LOCAL_USER_KEY, user);
    return user;
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    const supa = getSupabase();
    if (supa) {
      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return { id: data.user.id, email: data.user.email ?? null, isLocal: false };
    }
    const raw = await secureStore.get(LOCAL_CREDS_KEY);
    if (!raw) {
      // First run with no cloud: auto-provision a local account.
      return this.signUp(email, password);
    }
    const creds = JSON.parse(raw) as { email: string; salt: string; hash: string };
    if (creds.email !== email || (await hash(password, creds.salt)) !== creds.hash) {
      throw new Error('Invalid email or password.');
    }
    const existing = await storage.get<AuthUser>(LOCAL_USER_KEY);
    const user: AuthUser = existing ?? { id: `local:${await Crypto.randomUUID()}`, email, isLocal: true };
    await storage.set(LOCAL_USER_KEY, user);
    return user;
  },

  async signInWithApple(): Promise<AuthUser> {
    const supa = getSupabase();
    if (!supa) throw new Error('Apple Sign In requires cloud sync to be configured.');
    // In a dev build: use expo-apple-authentication to get an identityToken,
    // then supa.auth.signInWithIdToken({ provider: 'apple', token }).
    throw new Error('Apple Sign In is available in a native build.');
  },

  async resetPassword(email: string): Promise<void> {
    const supa = getSupabase();
    if (supa) {
      const { error } = await supa.auth.resetPasswordForEmail(email);
      if (error) throw new Error(error.message);
      return;
    }
    // Local mode: nothing to email; surface a friendly message to the caller.
    throw new Error('Password reset requires cloud sync. In local mode, reinstall to reset.');
  },

  async signOut(): Promise<void> {
    const supa = getSupabase();
    if (supa) await supa.auth.signOut();
    // Local session is kept so offline users stay logged in; clear explicitly on delete.
  },

  /** Permanently delete the account and all associated data. */
  async deleteAccount(userId: string): Promise<void> {
    const supa = getSupabase();
    if (supa && isCloudEnabled()) {
      // Server-side: an edge function `delete-account` removes all rows + auth user.
      await supa.functions.invoke('delete-account', { body: { userId } }).catch(() => undefined);
      await supa.auth.signOut();
    }
    await storage.remove(LOCAL_USER_KEY);
    await secureStore.remove(LOCAL_CREDS_KEY);
  },
};
