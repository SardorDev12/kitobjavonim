import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useLayout, useTheme } from '@/theme';

import { PullToRefreshIndicator } from '../PullToRefreshIndicator';

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
  const { pullDistance, handlers: pullHandlers } = usePullToRefresh(onRefresh ?? noop, refreshing);

  const inner = (
    <View style={[styles.constrain, { maxWidth: maxContentWidth }, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }, style]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: padded ? theme.spacing.lg : 0,
              paddingBottom: theme.spacing['2xl'] + insets.bottom,
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
              paddingBottom: theme.spacing.md + insets.bottom,
            },
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
  scrollContent: { alignItems: 'center', flexGrow: 1 },
  constrain: { width: '100%', flex: 1 },
  footer: { borderTopWidth: 1, alignItems: 'center' },
});
