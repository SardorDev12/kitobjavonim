import type { ReactNode, RefObject } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useLayout, useTheme } from '@/theme';

import { PullToRefreshIndicator } from '../PullToRefreshIndicator';

// Some Android OEM skins (confirmed on MIUI, 3-button navigation) report a
// bottom inset that's real but still shorter than the nav bar it's supposed
// to represent — this device's own insets.bottom came back ~47 while its
// actual 3-button bar needed more like 96 to fully clear. Flooring here
// means a footer button stays clickable on those devices instead of
// trusting a bottom inset that's silently too small; on devices that report
// correctly, insets.bottom is already at or above this, so Math.max leaves
// it untouched.
export const MIN_ANDROID_BOTTOM_INSET = 96;

type ScreenProps = {
  children: ReactNode;
  /** Wraps content in a ScrollView. Off for screens that own a FlatList. */
  scroll?: boolean;
  /** Adds horizontal padding. Off for full-bleed lists that pad their own rows. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  /** Pull-to-refresh, wired to a query's refetch. Requires `scroll`. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /**
   * Exposes the underlying ScrollView so a caller can scroll a focused field
   * into view by hand — Android's ScrollView doesn't reliably do this on its
   * own the way iOS's does, especially now that KeyboardAvoidingView has to
   * actively resize the viewport itself under edge-to-edge rather than the
   * OS doing it. Requires `scroll`.
   */
  scrollRef?: RefObject<ScrollView | null>;
};

/**
 * Page shell.
 *
 * The `maxWidth` here is what stops the app looking like a stretched phone on a
 * desktop browser: content centres and stops growing past a comfortable reading
 * measure while the background still fills the window.
 *
 * A screen that needs a title/search bar pinned above a scrolling list (e.g.
 * Library, Reading) doesn't use `scroll` here at all — it hand-rolls its own
 * root View with the fixed part as a plain sibling above a FlatList, the same
 * way Library's own screen already does. A flex:1 sibling next to this
 * component's ScrollView measured 0 height on a real Android device in an
 * earlier attempt at a `header` prop here; FlatList's own scrolling avoids
 * that class of bug entirely, so this component stays scroll-or-not only.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
  contentStyle,
  footer,
  onRefresh,
  refreshing = false,
  scrollRef,
}: ScreenProps) {
  const theme = useTheme();
  const { maxContentWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const bottomInset =
    Platform.OS === 'android' ? Math.max(insets.bottom, MIN_ANDROID_BOTTOM_INSET) : insets.bottom;
  const keyboardHeight = useKeyboardHeight();
  const { pullDistance, handlers: pullHandlers } = usePullToRefresh(onRefresh ?? noop, refreshing);

  const inner = (
    <View style={[styles.constrain, { maxWidth: maxContentWidth }, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }, style]}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          // A bare `flex: 1` here, and nothing else — without it a ScrollView
          // with no other height constraint sizes itself to its *content*
          // rather than to the space available in this flex-column root, on
          // native (react-native-web is more forgiving about the missing
          // constraint). On a long form that let the ScrollView grow taller
          // than the screen and push the footer below the fold. (Don't reuse
          // `styles.flex` for this — it also carries `alignItems: 'center'`,
          // which centers this outer scroll container to its content's
          // width instead of stretching it, squeezing every line of text
          // into a narrow column.)
          style={styles.scrollOuter}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: padded ? theme.spacing.lg : 0,
              paddingBottom: theme.spacing['2xl'] + bottomInset + keyboardHeight,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          {...(onRefresh ? pullHandlers : null)}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
            ) : undefined
          }
        >
          {onRefresh ? <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} /> : null}
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { paddingHorizontal: padded ? theme.spacing.lg : 0 }]}>{inner}</View>
      )}

      {footer ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              paddingBottom: theme.spacing.md + bottomInset,
            },
            // The footer sits below the ScrollView in normal flex flow, at
            // the true bottom of the (keyboard-unaware, edge-to-edge) screen
            // — without this, opening the keyboard just draws it over the
            // footer instead of moving anything. keyboardHeight is always 0
            // on iOS/web, so this is a no-op there.
            keyboardHeight > 0 && { transform: [{ translateY: -keyboardHeight }] },
          ]}
        >
          <View style={[styles.constrain, { maxWidth: maxContentWidth }]}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

function noop() {}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, alignItems: 'center' },
  scrollOuter: { flex: 1 },
  scrollContent: { alignItems: 'center', flexGrow: 1 },
  constrain: { width: '100%', flex: 1 },
  footer: { borderTopWidth: 1, alignItems: 'center' },
});
