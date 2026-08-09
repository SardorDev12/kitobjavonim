import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Copy .env.example to .env and fill in ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.'
  );
}

/**
 * Session storage backed by the device keychain.
 *
 * SecureStore rejects values over 2048 bytes, and a Supabase session carrying a
 * JWT with custom claims goes past that comfortably. So the value is split into
 * fixed-size chunks under indexed keys, with a small header recording how many
 * there are. Falls back to AsyncStorage only if the keychain is unavailable,
 * which happens on some rooted or heavily-modified Android builds.
 */
const CHUNK_SIZE = 1800;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const header = await SecureStore.getItemAsync(key);
      if (header === null) return null;

      const chunkCount = Number(header);
      if (!Number.isInteger(chunkCount) || chunkCount < 1) return header;

      const parts = await Promise.all(
        Array.from({ length: chunkCount }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`))
      );
      if (parts.some((part) => part === null)) return null;
      return parts.join('');
    } catch {
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await clearChunks(key);

      const chunkCount = Math.ceil(value.length / CHUNK_SIZE);
      await SecureStore.setItemAsync(key, String(chunkCount));
      await Promise.all(
        Array.from({ length: chunkCount }, (_, i) =>
          SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))
        )
      );
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await clearChunks(key);
      await SecureStore.deleteItemAsync(key);
    } catch {
      await AsyncStorage.removeItem(key);
    }
  },
};

async function clearChunks(key: string) {
  const header = await SecureStore.getItemAsync(key);
  const chunkCount = Number(header);
  if (!Number.isInteger(chunkCount) || chunkCount < 1) return;
  await Promise.all(
    Array.from({ length: chunkCount }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`))
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // On web, leaving `storage` undefined lets supabase-js use localStorage,
    // which is what makes the OAuth redirect land back in a signed-in session.
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Native has no URL to read the callback out of; the deep-link handler in
    // src/features/auth/session.ts feeds the tokens in explicitly instead.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
