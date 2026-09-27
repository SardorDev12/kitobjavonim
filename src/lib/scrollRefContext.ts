import { createContext } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';

/**
 * The nearest enclosing Screen/Sheet's ScrollView, provided automatically by
 * those two components so TextField can scroll itself above the keyboard on
 * focus without every screen having to wire a ref + onFocus by hand — the
 * previous pattern (see scrollFieldAboveKeyboard's own history) was easy to
 * forget on any new field, which is exactly what kept happening.
 *
 * `null` outside of a Screen(scroll)/Sheet, or inside a non-scrolling Screen
 * — TextField treats that as "nothing to scroll" and just skips it.
 */
export const ScrollRefContext = createContext<RefObject<ScrollView | null> | null>(null);
