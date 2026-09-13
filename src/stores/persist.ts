import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type PersistStorage } from 'zustand/middleware';

/**
 * Shared JSON storage backed by AsyncStorage for all persisted stores.
 * Data is stored per-device; cloud sync (Supabase + RLS) enforces true
 * per-user isolation. On sign-out, stores call their reset() to clear memory.
 */
export function jsonStorage<T>(): PersistStorage<T> | undefined {
  return createJSONStorage<T>(() => AsyncStorage);
}

export const STORE_KEYS = {
  auth: 'forgefit.auth',
  profile: 'forgefit.profile',
  logs: 'forgefit.logs',
  workouts: 'forgefit.workouts',
  gamification: 'forgefit.gamification',
  reminders: 'forgefit.reminders',
  protocols: 'forgefit.protocols',
} as const;
