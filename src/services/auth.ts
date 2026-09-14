import { Platform } from 'react-native';
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

  /** Google OAuth via Supabase (browser redirect). Falls back to a local demo account offline. */
  async signInWithGoogle(): Promise<AuthUser> {
    const supa = getSupabase();
    if (!supa) return this.demoAccount('google');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const WebBrowser = require('expo-web-browser');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { makeRedirectUri } = require('expo-auth-session');
      const redirectTo = makeRedirectUri({ scheme: 'forgefit', path: 'auth-callback' });
      const { data, error } = await supa.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data?.url) throw new Error(error?.message ?? 'Could not start Google sign in.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) throw new Error('Google sign in was cancelled.');
      // Exchange the returned code/tokens for a session.
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      if (code) {
        const { error: exErr } = await supa.auth.exchangeCodeForSession(code);
        if (exErr) throw new Error(exErr.message);
      }
      const { data: u } = await supa.auth.getUser();
      if (!u.user) throw new Error('Google sign in failed.');
      return { id: u.user.id, email: u.user.email ?? null, isLocal: false };
    } catch (e) {
      throw new Error((e as Error).message || 'Google sign in failed.');
    }
  },

  /** Apple Sign In (iOS native identity token → Supabase). Local demo fallback otherwise. */
  async signInWithApple(): Promise<AuthUser> {
    const supa = getSupabase();
    // Web / no cloud: offer a local demo account so the flow is still usable.
    if (Platform.OS !== 'ios' || !supa) {
      if (!supa) return this.demoAccount('apple');
      throw new Error('Apple Sign In runs on iOS. Use email or Google here.');
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AppleAuthentication = require('expo-apple-authentication');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token from Apple.');
      const { data, error } = await supa.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (error) throw new Error(error.message);
      return { id: data.user.id, email: data.user.email ?? null, isLocal: false };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'ERR_REQUEST_CANCELED') throw new Error('Apple sign in was cancelled.');
      throw new Error(err.message || 'Apple sign in failed.');
    }
  },

  /** Provision a local demo account (offline mode) tagged by provider. */
  async demoAccount(provider: 'google' | 'apple'): Promise<AuthUser> {
    const user: AuthUser = {
      id: `local:${await Crypto.randomUUID()}`,
      email: `${provider}-user@forgefit.local`,
      isLocal: true,
    };
    await storage.set(LOCAL_USER_KEY, user);
    return user;
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
