import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'household.pendingInviteCode';

/**
 * Carries an invite code from /join/[code] through sign-up/sign-in —
 * AsyncStorage, not an in-memory store like pendingAddQuery.ts/pendingBook.ts.
 * Those don't survive what completing auth here often means: a real page
 * reload (Google's OAuth redirect on web) or leaving the app entirely
 * (Telegram's browser hand-off). A join link has to still work after either.
 */
export async function setPendingInviteCode(code: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
}

/** Reads and clears the pending code in one step — it's only ever meant to be applied once. */
export async function consumePendingInviteCode(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(STORAGE_KEY);
    if (code) await AsyncStorage.removeItem(STORAGE_KEY);
    return code;
  } catch {
    return null;
  }
}
