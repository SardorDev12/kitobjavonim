import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LookupUnavailableError, lookupByIsbn } from './metadata';

// lookupByIsbn hits Google Books then Open Library over real fetch() calls —
// mocked here so these run offline and deterministically, and so the retry
// path (a genuine setTimeout-based delay in the source) doesn't actually
// wait — fake timers plus a manual tick past it.
const ISBN = '9780134685991';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

describe('lookupByIsbn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns a candidate when Google Books has a match', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 'g1', volumeInfo: { title: 'Effective Java' } }] })
    );

    const result = await lookupByIsbn(ISBN);
    expect(result?.title).toBe('Effective Java');
    expect(result?.source).toBe('google_books');
  });

  it('falls back to Open Library when Google Books has no match', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ items: [] })) // Google: no items
      .mockResolvedValueOnce(jsonResponse({ docs: [{ title: 'Fallback Title', isbn: [ISBN] }] }));

    const result = await lookupByIsbn(ISBN);
    expect(result?.title).toBe('Fallback Title');
    expect(result?.source).toBe('open_library');
  });

  it('returns null when both providers genuinely have no match', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ docs: [] }));

    const result = await lookupByIsbn(ISBN);
    expect(result).toBeNull();
  });

  it('retries Google Books once after a rate-limit before giving up on it', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({}, false)) // 429 on first try
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'g1', volumeInfo: { title: 'Retried OK' } }] }));

    const promise = lookupByIsbn(ISBN);
    // Let the retry's internal 500ms sleep elapse without a real wait.
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result?.title).toBe('Retried OK');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws LookupUnavailableError, not a silent null, when every provider request fails', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false)); // every call fails, including the retry

    // Attach the rejection expectation before advancing timers — the promise
    // can settle mid-advance, and an unattached handler at that point is a
    // real (if harmless here) unhandled-rejection warning, not just noise.
    const assertion = expect(lookupByIsbn(ISBN)).rejects.toBeInstanceOf(LookupUnavailableError);
    // One retry for Google Books, then Open Library — flush every pending timer.
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('a network error (not just a bad status) also counts as unavailable, not not-found', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));

    const assertion = expect(lookupByIsbn(ISBN)).rejects.toBeInstanceOf(LookupUnavailableError);
    await vi.runAllTimersAsync();
    await assertion;
  });
});
