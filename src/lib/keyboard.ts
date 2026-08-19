import type { RefObject } from 'react';
import { Keyboard, UIManager, type NativeSyntheticEvent, type ScrollView, type TargetedEvent } from 'react-native';

// Breathing room between a scrolled-to field and the top edge of the
// keyboard — flush against it reads as cramped.
const KEYBOARD_MARGIN = 16;

// `measure` is a real native method on every host component's ref (as
// `scrollViewRef`'s own doc comment above says), but RN's ScrollView .d.ts
// doesn't declare it — this bridges just that one gap rather than casting
// the whole ref to `any`.
type MeasurableScrollView = ScrollView & {
  measure: (
    callback: (x: number, y: number, width: number, height: number, pageX: number, pageY: number) => void
  ) => void;
};

/**
 * Scrolls just far enough that the focused field's bottom edge sits
 * `KEYBOARD_MARGIN` above the keyboard, once the keyboard has actually
 * finished appearing — not immediately on `onFocus`, before the keyboard has
 * shown and layout has settled.
 *
 * This is not `scrollToEnd()`: the ScrollView carries extra bottom padding
 * sized for the keyboard so *some* field can always be scrolled into view,
 * and scrolling to the content's end lands in that padding rather than at
 * the field itself, leaving a gap between the field and the keyboard on any
 * form shorter than a full screen. Instead this measures the field's fixed
 * position within the content (via `getInnerViewNode()`, so the number is
 * independent of whatever the current scroll offset already is) and the
 * keyboard's actual on-screen position, and computes the one absolute
 * offset that puts the field right above it.
 */
export function scrollFieldAboveKeyboard(
  scrollRef: RefObject<ScrollView | null>,
  // TextInputProps.onFocus is typed against the looser TargetedEvent, not
  // the fuller TextInputFocusEventData — this only needs `.target` anyway.
  event: NativeSyntheticEvent<TargetedEvent>
): void {
  const fieldHandle = event.nativeEvent.target;

  const subscription = Keyboard.addListener('keyboardDidShow', (keyboardEvent) => {
    subscription.remove();

    const scrollView = scrollRef.current;
    const contentHandle = scrollView?.getInnerViewNode();
    if (!scrollView || !contentHandle) return;

    (scrollView as MeasurableScrollView).measure((_x, _y, _width, _height, _pageX, viewportPageY) => {
      UIManager.measureLayout(
        fieldHandle,
        contentHandle,
        () => {},
        (_fieldX, fieldContentY, _fieldWidth, fieldHeight) => {
          const target =
            viewportPageY +
            fieldContentY +
            fieldHeight -
            keyboardEvent.endCoordinates.screenY +
            KEYBOARD_MARGIN;
          scrollView.scrollTo({ y: Math.max(target, 0), animated: true });
        }
      );
    });
  });
}
