import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ value: null as string | null }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => store.value),
    setItem: vi.fn(async (_key: string, value: string) => {
      store.value = value;
    }),
  },
}));

// The window is read once when the module loads, so each case sets the stored
// timestamp first and then imports a fresh copy.
async function load(lastActiveMsAgo: number | null) {
  store.value = lastActiveMsAgo === null ? null : String(Date.now() - lastActiveMsAgo);
  vi.resetModules();
  return import('./resumeWindow');
}

afterEach(() => {
  store.value = null;
});

describe('resumedRecently', () => {
  it('is true when the user was here a minute ago', async () => {
    const { resumedRecently } = await load(60_000);
    expect(await resumedRecently).toBe(true);
  });

  it('is false after more than five minutes away', async () => {
    const { resumedRecently, RESUME_WINDOW_MS } = await load(6 * 60_000);
    expect(RESUME_WINDOW_MS).toBe(5 * 60_000);
    expect(await resumedRecently).toBe(false);
  });

  it('is false on the very first launch, with nothing stored', async () => {
    const { resumedRecently } = await load(null);
    expect(await resumedRecently).toBe(false);
  });

  it('is false for a garbage value', async () => {
    store.value = 'not-a-number';
    vi.resetModules();
    const { resumedRecently } = await import('./resumeWindow');
    expect(await resumedRecently).toBe(false);
  });
});
