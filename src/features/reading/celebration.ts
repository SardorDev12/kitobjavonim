import { useSyncExternalStore } from 'react';

/**
 * The book whose "finished" celebration is on screen, if any. A tiny store
 * rather than component state because the button that finishes a book lives
 * on a card that unmounts the moment the book leaves the in-progress list —
 * the celebration has to outlive it.
 */
export type CelebratedBook = { id: string; title: string; authors: string[] };

let current: CelebratedBook | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function celebrateFinish(book: CelebratedBook) {
  current = book;
  emit();
}

export function dismissCelebration() {
  current = null;
  emit();
}

export function useCelebratedBook(): CelebratedBook | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null
  );
}
