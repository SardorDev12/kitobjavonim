import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import type PagerView from 'react-native-pager-view';

/**
 * The 5 tab pages, in pager order — index 0 is the leftmost/first page.
 * Library stays the app's actual cold-launch screen (see (tabs)/_layout.tsx's
 * initialPage) even though Reading is listed first for the bottom bar.
 */
export const TAB_ROUTES = ['reading', 'index', 'discover', 'add', 'profile'] as const;
export type TabRoute = (typeof TAB_ROUTES)[number];

/**
 * A module-level registry for the tabs' PagerView instance, mirroring
 * features/add/pendingBook.ts's pattern — the tab layout is the only place
 * that ever mounts a PagerView, but plenty of screens outside it (legal
 * pages, add/configure, listing detail) need to switch tabs from code that
 * has no direct reference to it.
 *
 * This replaces what used to be router.push('/(tabs)/<tab>') — once the
 * tabs layout hosts all 5 screens as pager pages instead of separate Expo
 * Router routes, navigating to a URL like /(tabs)/profile no longer causes
 * anything to render (the layout isn't listening for route matches
 * anymore), so switching tabs from outside the layout has to go through
 * this instead.
 */
let pager: PagerView | null = null;
let activeIndex = 0;
const listeners = new Set<() => void>();

/**
 * A route requested by goToTab() before the pager existed to receive it —
 * e.g. router.replace('/(tabs)') from a screen outside the group, which
 * unmounts the previous layout and mounts a fresh one. registerTabsPager()
 * consumes this once, as the new pager's initial page, then clears it.
 */
let pendingRoute: TabRoute | null = null;

export function registerTabsPager(instance: PagerView | null) {
  pager = instance;
  if (instance && pendingRoute) {
    const index = TAB_ROUTES.indexOf(pendingRoute);
    pendingRoute = null;
    if (index >= 0) {
      instance.setPageWithoutAnimation(index);
      setActiveTabIndex(index);
    }
  }
}

export function setActiveTabIndex(index: number) {
  activeIndex = index;
  listeners.forEach((listener) => listener());
}

export function getActiveTabIndex(): number {
  return activeIndex;
}

/**
 * Switches to a tab from anywhere in the app — the pager-based replacement
 * for router.push('/(tabs)/<tab>') on native. Web never mounts a PagerView
 * (_layout.web.tsx keeps the classic per-route Tabs navigator — see its own
 * comment for why), so there `pager` is always null; falling back to plain
 * route navigation there is what actually switches tabs on web, not a
 * queued no-op.
 */
export function goToTab(route: TabRoute) {
  if (Platform.OS === 'web') {
    router.replace(route === 'index' ? '/(tabs)' : (`/(tabs)/${route}` as const));
    return;
  }

  const index = TAB_ROUTES.indexOf(route);
  if (index < 0) return;
  if (pager) pager.setPage(index);
  else pendingRoute = route;
}

/** The currently active tab's index, for the bottom bar's highlight — updates on swipe, tap, or goToTab(). */
export function useActiveTabIndex(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getActiveTabIndex,
    getActiveTabIndex
  );
}
