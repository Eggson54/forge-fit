import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Storage abstraction.
 *  - `storage`     : general local persistence (AsyncStorage) for app data.
 *  - `secureStore` : encrypted keychain/keystore for sensitive values (tokens).
 *
 * Health/fitness records live in AsyncStorage locally and sync to Supabase when
 * configured (RLS-protected). Auth tokens and any secrets use SecureStore.
 */

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Swallow — persistence is best-effort; app keeps working from memory.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* noop */
    }
  },
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch {
      /* noop */
    }
  },
};

// SecureStore is unavailable on web; guard so the app still runs there.
const secureAvailable = SecureStore.isAvailableAsync;

export const secureStore = {
  async get(key: string): Promise<string | null> {
    try {
      if (!(await secureAvailable())) return AsyncStorage.getItem(`secure:${key}`);
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (!(await secureAvailable())) return void AsyncStorage.setItem(`secure:${key}`, value);
      await SecureStore.setItemAsync(key, value);
    } catch {
      /* noop */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (!(await secureAvailable())) return void AsyncStorage.removeItem(`secure:${key}`);
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* noop */
    }
  },
};

/** Namespaced key builder so per-user data never leaks across accounts. */
export const keyFor = (userId: string, slice: string) => `forgefit:${userId}:${slice}`;
