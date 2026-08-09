import { useSyncExternalStore } from 'react';

import type { BookCandidate } from '@/lib/books/metadata';

/**
 * Holds the book chosen on the search/scan screen while the user fills in the
 * details screen.
 *
 * A module-level store rather than route params: a candidate carries a full
 * description and cover URL, and serialising that through the URL would produce
 * links thousands of characters long — which the web build would then put in the
 * address bar. The trade-off is that a hard refresh on web loses the selection,
 * so `add/configure` sends the user back to search when the store is empty.
 */
let candidate: BookCandidate | null = null;
const listeners = new Set<() => void>();

export function setPendingBook(next: BookCandidate | null) {
  candidate = next;
  listeners.forEach((listener) => listener());
}

export function getPendingBook(): BookCandidate | null {
  return candidate;
}

export function usePendingBook(): BookCandidate | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPendingBook,
    getPendingBook
  );
}
