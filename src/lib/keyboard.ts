import type { RefObject } from 'react';
import { Keyboard, type ScrollView } from 'react-native';

/**
 * Scrolls a ScrollView to its end once the keyboard has actually finished
 * appearing — not immediately on a field's `onFocus`.
 *
 * `onFocus` fires the instant a field gains focus, before the keyboard has
 * shown and before KeyboardAvoidingView has resized the layout for it.
 * Scrolling right then measures against the old, taller viewport; the
 * keyboard finishes animating in afterward and covers the field again
 * regardless. `keyboardDidShow` fires once the keyboard is actually up, which
 * is the point layout has settled and scrolling to reveal a field below the
 * fold actually sticks.
 */
export function scrollToEndOnKeyboardShow(scrollRef: RefObject<ScrollView | null>): void {
  const subscription = Keyboard.addListener('keyboardDidShow', () => {
    scrollRef.current?.scrollToEnd({ animated: true });
    subscription.remove();
  });
}
