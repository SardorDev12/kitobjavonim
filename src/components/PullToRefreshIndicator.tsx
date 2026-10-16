import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  pullDistance: number;
  refreshing: boolean;
};

const BADGE_SIZE = 36;

/**
 * A spinner badge that floats over the top of the list it refreshes. It's an
 * overlay, not a block above the list, so showing it never pushes the content
 * down — which is what a background refetch (for example right after saving a
 * book's location) used to do for the second or two it ran. While pulling, the
 * badge follows the gesture; while refreshing, it parks near the top.
 * See usePullToRefresh for why web needs this reimplemented by hand at all.
 */
export function PullToRefreshIndicator({ pullDistance, refreshing }: Props) {
  const theme = useTheme();
  if (!refreshing && pullDistance <= 0) return null;

  const offset = refreshing ? 8 : Math.min(pullDistance, 80) - BADGE_SIZE;

  return (
    <View pointerEvents="none" style={styles.layer}>
      <View
        style={[
          styles.badge,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
            transform: [{ translateY: offset }],
          },
          theme.shadow.card,
        ]}
      >
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Zero height and absolutely placed, so it takes no space in the layout.
  layer: { position: 'absolute', top: 0, left: 0, right: 0, height: 0, alignItems: 'center', zIndex: 10, elevation: 10 },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
