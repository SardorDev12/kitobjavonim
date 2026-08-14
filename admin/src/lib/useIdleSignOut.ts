import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

/**
 * A signed-in admin tab left open and unattended is a bigger risk than the
 * same tab in the consumer app — this signs out automatically after a
 * period with no interaction, rather than trusting every admin to
 * remember to close the tab themselves.
 */
export function useIdleSignOut(enabled: boolean, onIdle: () => void, minutes = 20) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function reset() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(onIdle, minutes * 60_000);
    }

    reset();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, reset, { passive: true });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, reset);
    };
  }, [enabled, onIdle, minutes]);
}
