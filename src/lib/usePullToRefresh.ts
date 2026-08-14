import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

const PULL_THRESHOLD = 64;
const MAX_PULL = 96;
const PULL_RESISTANCE = 0.5;

type ScrollEvent = { nativeEvent: { contentOffset: { y: number } } };
type WebPointerEvent = { nativeEvent: { clientY: number } };

/**
 * react-native-web's <RefreshControl> is a stub — it renders a bare View and
 * silently ignores `refreshing`/`onRefresh`, because the browser gives it no
 * native overscroll gesture to attach to the way iOS/Android do. This
 * reimplements "pull down to refresh" by hand for web: pointer events (which
 * cover touch, mouse, and pen in one) track a downward drag while the list
 * is scrolled to the very top, and release past a threshold fires onRefresh.
 *
 * Native platforms keep using the real RefreshControl — this hook's
 * handlers are only wired up on web, so spreading them into a native
 * component's props is always a harmless no-op.
 */
export function usePullToRefresh(onRefresh: () => void, refreshing: boolean) {
  const [pullDistance, setPullDistance] = useState(0);
  const pullDistanceRef = useRef(0);
  const startY = useRef<number | null>(null);
  const scrollTop = useRef(0);
  const dragging = useRef(false);
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;

  const setPull = useCallback((value: number) => {
    pullDistanceRef.current = value;
    setPullDistance(value);
  }, []);

  const onScroll = useCallback((event: ScrollEvent) => {
    scrollTop.current = event.nativeEvent.contentOffset.y;
  }, []);

  const onPointerDown = useCallback((event: WebPointerEvent) => {
    if (scrollTop.current > 0 || refreshingRef.current) return;
    startY.current = event.nativeEvent.clientY;
    dragging.current = true;
  }, []);

  const onPointerMove = useCallback(
    (event: WebPointerEvent) => {
      if (!dragging.current || startY.current === null) return;
      if (scrollTop.current > 0) {
        dragging.current = false;
        startY.current = null;
        setPull(0);
        return;
      }
      const delta = event.nativeEvent.clientY - startY.current;
      setPull(delta > 0 ? Math.min(delta * PULL_RESISTANCE, MAX_PULL) : 0);
    },
    [setPull]
  );

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    startY.current = null;
    const shouldRefresh = pullDistanceRef.current >= PULL_THRESHOLD;
    setPull(0);
    if (shouldRefresh) onRefresh();
  }, [onRefresh, setPull]);

  if (Platform.OS !== 'web') {
    return { pullDistance: 0, handlers: {} };
  }

  return {
    pullDistance,
    handlers: {
      onScroll,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
