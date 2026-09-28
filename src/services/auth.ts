import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { getSupabase, isCloudEnabled } from './supabase';
import { secureStore, storage } from './storage';
import { EMPTY_CALLBACK_MESSAGE, readOAuthCallback } from '../domain/oauthCallback';

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
const APPLE_NAME_KEY = 'forgefit:apple_name';

/** Apply whatever the redirect handed back. Parsing lives in the domain. */
async function completeOAuthCallback(
  supa: NonNullable<ReturnType<typeof getSupabase>>,
  callbackUrl: string,
): Promise<void> {
  const result = readOAuthCallback(callbackUrl);

  if (result.kind === 'code') {
    const { error } = await supa.auth.exchangeCodeForSession(result.code);
    if (error) throw new Error(error.message);
    return;
  }
  if (result.kind === 'session') {
    const { error } = await supa.auth.setSession({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
    if (error) throw new Error(error.message);
    return;
  }
  // The provider can report a refusal by redirecting rather than by failing.
  if (result.kind === 'denied') throw new Error(result.reason);
  throw new Error(EMPTY_CALLBACK_MESSAGE);
}

async function hash(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

/**
 * Whether there is an account server at all.
 *
 * Without one, an account is a lock on this phone: the password is salted,
 * hashed and kept in the secure store, and it protects the data here, but
 * nothing is backed up and nothing follows you to another device. Screens
 * read this to say so rather than let "Create Account" imply otherwise.
 */
export const isLocalOnly = (): boolean => !getSupabase();

export const SOCIAL_NEEDS_BACKEND =
  'Signing in with Google or Apple needs an account server, and none is connected yet. Use an email and password — it keeps your data locked on this phone.';

export const LOCAL_ACCOUNT_NOTE =
  'No account server is connected, so this account lives on this phone only. Your password locks it here; nothing is backed up yet.';

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
    // No backend means no Google: there is nothing to exchange a Google
    // sign-in with. This used to invent a device-only account with the
    // address google-user@forgefit.local and say nothing, so somebody who
    // tapped "Google" reasonably believed their data was tied to their Google
    // account and would follow them to a new phone. It would not.
    if (!supa) throw new Error(SOCIAL_NEEDS_BACKEND);
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
      if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new Error('Google sign in was cancelled.');
      }
      if (result.type !== 'success' || !result.url) throw new Error('Google sign in did not come back.');

      await completeOAuthCallback(supa, result.url);

      const { data: u } = await supa.auth.getUser();
      if (!u.user) throw new Error('Google signed you in but no session came back. Check that the redirect URL is allowed in your Supabase auth settings.');
      return { id: u.user.id, email: u.user.email ?? null, isLocal: false };
    } catch (e) {
      throw new Error((e as Error).message || 'Google sign in failed.');
    }
  },

  /**
   * Apple Sign In: native identity token straight to Supabase.
   *
   * Two things here are easy to get wrong and both are silent.
   *
   * The nonce: Apple embeds a *hashed* nonce in the identity token, and
   * Supabase verifies it against the raw one. Send the token without the raw
   * nonce and a project with nonce checking on rejects it with a message
   * about nothing in particular.
   *
   * The name: Apple returns the user's name on the *first* authorization and
   * never again. Not capturing it there means it is gone permanently — the
   * only recovery is the user deleting the app from their Apple ID settings.
   */
  async signInWithApple(): Promise<AuthUser> {
    const supa = getSupabase();
    if (Platform.OS !== 'ios') {
      if (!supa) throw new Error(SOCIAL_NEEDS_BACKEND);
      throw new Error('Apple Sign In runs on iOS. Use email or Google here.');
    }
    if (!supa) throw new Error(SOCIAL_NEEDS_BACKEND);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AppleAuthentication = require('expo-apple-authentication');

      // Present on an iPhone running iOS 13+, absent on a simulator with no
      // Apple ID signed in — where signInAsync throws something unhelpful.
      if (typeof AppleAuthentication.isAvailableAsync === 'function') {
        const available = await AppleAuthentication.isAvailableAsync();
        if (!available) {
          throw new Error('Apple Sign In is not available on this device. Sign in to an Apple ID in Settings first.');
        }
      }

      const rawNonce = await Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) throw new Error('No identity token from Apple.');

      const { data, error } = await supa.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) throw new Error(error.message);

      // Stash the name now or lose it forever.
      const name = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (name) {
        await storage.set(APPLE_NAME_KEY, name);
        await supa.auth.updateUser({ data: { full_name: name } }).catch(() => undefined);
      }

      return { id: data.user.id, email: data.user.email ?? null, isLocal: false };
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'ERR_REQUEST_CANCELED') throw new Error('Apple sign in was cancelled.');
      throw new Error(err.message || 'Apple sign in failed.');
    }
  },

  /** The name Apple gave on first sign-in, if it ever did. */
  async appleName(): Promise<string | null> {
    return (await storage.get<string>(APPLE_NAME_KEY)) ?? null;
  },

  /** Provision a local demo account (offline mode) tagged by provider. */

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
