import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Tracks the on-screen keyboard's height on Android so it can be added as
 * extra bottom padding to a ScrollView.
 *
 * Under edge-to-edge (mandatory since Expo SDK 54), the OS no longer shrinks
 * the window for the keyboard on its own. Without this, a field below the
 * fold has no scroll room to be revealed into at all: the ScrollView's
 * content is exactly screen-height tall (keyboard or not), so it isn't
 * scrollable in the first place.
 */
export function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

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
  }, []);

  return height;
}
