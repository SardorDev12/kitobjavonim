import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Tracks the on-screen keyboard's height so it can be added as extra bottom
 * padding to a ScrollView.
 *
 * Android: under edge-to-edge (mandatory since Expo SDK 54), the OS no
 * longer shrinks the window for the keyboard on its own. Without this, a
 * field below the fold has no scroll room to be revealed into at all: the
 * ScrollView's content is exactly screen-height tall (keyboard or not), so
 * it isn't scrollable in the first place.
 *
 * Web: RN Web's `Keyboard` is a stub — `addListener` never fires — so this
 * needs its own source. Mobile browsers resize `visualViewport` when their
 * on-screen keyboard opens but leave `window.innerHeight` (the layout
 * viewport) alone, so the gap between the two *is* the keyboard height; a
 * fixed-height flex layout (which is what RN Web renders) never shrinks on
 * its own to reveal what the keyboard now covers.
 *
 * iOS is left at 0 — its on-screen keyboard already resizes the app window
 * itself, unlike Android's edge-to-edge and unlike the web layout viewport.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
        setHeight(event.endCoordinates.height);
      });
      const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
        setHeight(0);
      });

      return () => {
        showSubscription.remove();
        hideSubscription.remove();
      };
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.visualViewport) {
      const viewport = window.visualViewport;
      const handleResize = () => {
        setHeight(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
      };
      handleResize();
      viewport.addEventListener('resize', handleResize);
      return () => viewport.removeEventListener('resize', handleResize);
    }

    return undefined;
  }, []);

  return height;
}
