import { useEffect, useSyncExternalStore } from 'react';

/**
 * Carries a search query into the Add tab from anywhere else in the app —
 * "search turned up nothing, add it instead" buttons on Library and Reading.
 *
 * Not route params: add.tsx used to read params.q via useLocalSearchParams,
 * which worked under the old <Tabs> navigator (each navigation re-delivered
 * fresh params to the still-mounted screen) but stopped working once the
 * tabs layout became a PagerView (add.tsx is mounted once, directly in JSX
 * — nothing ever re-navigates to it, so its route params never change).
 *
 * Unlike pendingBook.ts's "current value" store, this is "consume once per
 * call": a version counter bumped by setPendingAddQuery(), read via
 * usePendingAddQuery(onQuery) — onQuery fires once per bump, including one
 * already pending at mount, and never replays a query it already consumed.
 */
let query: string | null = null;
let version = 0;
const listeners = new Set<() => void>();

export function setPendingAddQuery(next: string) {
  query = next;
  version += 1;
  listeners.forEach((listener) => listener());
}

function getVersion(): number {
  return version;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingAddQuery(onQuery: (query: string) => void) {
  const currentVersion = useSyncExternalStore(subscribe, getVersion, getVersion);

  useEffect(() => {
    if (query == null) return;
    const next = query;
    query = null;
    onQuery(next);
    // Only meant to fire once per version bump (a new setPendingAddQuery()
    // call) — must not re-run just because onQuery's identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVersion]);
}
