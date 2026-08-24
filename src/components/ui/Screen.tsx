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
const MIN_ANDROID_BOTTOM_INSET = 96;

type ScreenProps = {
  children: ReactNode;
  /** Wraps content in a ScrollView. Off for screens that own a FlatList. */
  scroll?: boolean;
  /** Adds horizontal padding. Off for full-bleed lists that pad their own rows. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * Rendered above the scroll area instead of inside it — for a title/search
   * bar that should stay put while a long list scrolls underneath. Owns the
   * screen's top safe-area inset, so scrolling content shouldn't add its own.
   */
  header?: ReactNode;
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
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  style,
  contentStyle,
  header,
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

  const headerNode = header ? (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.border,
          paddingHorizontal: padded ? theme.spacing.lg : 0,
          paddingTop: insets.top + theme.spacing.md,
          paddingBottom: theme.spacing.md,
        },
      ]}
    >
      <View style={[styles.staticConstrain, { maxWidth: maxContentWidth }]}>{header}</View>
    </View>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }, style]}>
      {scroll ? (
        header ? (
          // `header` pins via ScrollView's own stickyHeaderIndices rather
          // than sitting as a plain sibling before the ScrollView: a fixed
          // sibling next to a `flex: 1` ScrollView measured 0 height on at
          // least one real Android device (its content still painted,
          // just outside the box layout accounted for — everything below
          // it, including the header itself, rendered overlapping at the
          // top). stickyHeaderIndices is RN's own built-in mechanism for
          // this and doesn't share that failure mode. Horizontal padding
          // moves onto each child individually (rather than the shared
          // contentContainerStyle below) so the sticky header's background
          // can stay full-bleed behind it while the body content still
          // gets the normal inset.
          <ScrollView
            ref={scrollRef}
            style={styles.scrollOuter}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: theme.spacing['2xl'] + bottomInset + keyboardHeight }]}
            stickyHeaderIndices={onRefresh ? [1] : [0]}
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
            {headerNode}
            {/*
              No flex:1 here (unlike the header-less branch's `inner`) — as a
              second child alongside the sticky headerNode, a flex:1 sibling
              stretched to fill the ScrollView's flexGrow:1 content container
              and pushed its own children down to the bottom of that stretch
              instead of the top, leaving a large blank gap under the header.
              Natural content height keeps the list directly under it.
            */}
            <View
              style={[
                styles.staticConstrain,
                { maxWidth: maxContentWidth, paddingHorizontal: padded ? theme.spacing.lg : 0 },
                contentStyle,
              ]}
            >
              {children}
            </View>
          </ScrollView>
        ) : (
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
        )
      ) : (
        <>
          {headerNode}
          <View style={[styles.flex, { paddingHorizontal: padded ? theme.spacing.lg : 0 }]}>{inner}</View>
        </>
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
  // No flex:1, unlike `constrain` — this sits inside a ScrollView's content
  // alongside a sibling, and only ever needs its natural content height.
  staticConstrain: { width: '100%', alignSelf: 'center' },
  header: { borderBottomWidth: 1, alignItems: 'center' },
  footer: { borderTopWidth: 1, alignItems: 'center' },
});
