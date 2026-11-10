import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "Where was the user?" only matters for a short while. Come back within this
 * window and the app reopens on the same tab (and scroll position); stay away
 * longer and it starts fresh on the Reading tab.
 */
export const RESUME_WINDOW_MS = 5 * 60 * 1000;

const LAST_ACTIVE_KEY = 'settings.lastActiveAt';

/**
 * Whether the previous session was active within the window — read once, when
 * this module first loads (at app start, before anything writes a newer
 * timestamp), so every screen that asks gets the same answer for this launch.
 */
export const resumedRecently: Promise<boolean> = AsyncStorage.getItem(LAST_ACTIVE_KEY)
  .then((raw) => {
    const last = Number(raw);
    return Number.isFinite(last) && last > 0 && Date.now() - last < RESUME_WINDOW_MS;
  })
  .catch(() => false);

/** Records "the user is here right now". Cheap enough to call every half minute. */
export function markActive(): void {
  AsyncStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())).catch(() => {});
}
