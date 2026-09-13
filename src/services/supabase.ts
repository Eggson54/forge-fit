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
      detectSessionInUrl: false,
    },
  });
  return client;
}

export const isCloudEnabled = () => config.supabase.enabled;
