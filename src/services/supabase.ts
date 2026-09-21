import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

/**
 * Supabase client. Returns null when not configured so callers can fall back to
 * local-only mode. Session tokens persist via AsyncStorage (RN has no window).
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!config.supabase.enabled) return null;
  if (client) return client;
  client = createClient(config.supabase.url, config.supabase.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no browser URL to read a session out of in a native app.
      detectSessionInUrl: false,
      /**
       * PKCE, explicitly.
       *
       * supabase-js defaults to the implicit flow, which returns the session
       * in the URL *fragment* — and a fragment never reaches
       * `exchangeCodeForSession`, so the Google callback handler found no
       * `?code=`, created no session, and reported "sign in failed" every
       * single time. PKCE returns the code as a query parameter, which is
       * what that handler is written for.
       *
       * PKCE also needs the code verifier to survive between opening the
       * browser and coming back; that is what `storage` above is for.
       */
      flowType: 'pkce',
    },
  });
  return client;
}

export const isCloudEnabled = () => config.supabase.enabled;
