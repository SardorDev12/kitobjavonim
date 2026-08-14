import type { ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useLayout, useTheme } from '@/theme';

import { PullToRefreshIndicator } from '../PullToRefreshIndicator';
import { Text } from './Text';

// First attempt at this was 48 (standard Material nav-bar height), on the
// theory that MIUI reports insets.bottom as a flat 0. Real device data
// proved that theory wrong: it reported ~47, meaning MIUI *is* reporting a
// real value here — it's just still shorter than this device's actual
// 3-button nav bar. Bumped well past both numbers as a wider safety margin
// while we get a second data point (see the debug line below) rather than
// inching up by a few px at a time and burning another test round each try.
const MIN_ANDROID_BOTTOM_INSET = 96;

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
  footer,
  onRefresh,
  refreshing = false,
}: ScreenProps) {
  const theme = useTheme();
  const { maxContentWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const bottomInset =
    Platform.OS === 'android' ? Math.max(insets.bottom, MIN_ANDROID_BOTTOM_INSET) : insets.bottom;
  const { pullDistance, handlers: pullHandlers } = usePullToRefresh(onRefresh ?? noop, refreshing);

  const inner = (
    <View style={[styles.constrain, { maxWidth: maxContentWidth }, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }, style]}>
      {scroll ? (
        <ScrollView
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
              paddingBottom: theme.spacing['2xl'] + bottomInset,
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
          ]}
        >
          {/* TEMPORARY — diagnosing a report that this footer still sits
              behind the on-screen nav bar on a MIUI device even with a
              96dp floor. Kept to one short line and placed *above* the
              button (not below) — a longer, multi-line version of this
              last round visually collided with the button's own label
              instead of stacking cleanly under it. Remove once resolved. */}
          {Platform.OS === 'android' ? (
            <Text variant="caption" color="textSubtle">
              debug: bottom={insets.bottom} floored={bottomInset}
            </Text>
          ) : null}
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
