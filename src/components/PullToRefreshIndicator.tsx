import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  pullDistance: number;
  refreshing: boolean;
};

/**
 * Rendered as a sibling just above the scrollable list it refreshes, so it
 * grows with the pull gesture like a real RefreshControl — see
 * usePullToRefresh for why web needs this reimplemented by hand at all.
 */
export function PullToRefreshIndicator({ pullDistance, refreshing }: Props) {
  const theme = useTheme();
  const height = refreshing ? 40 : pullDistance;
  if (height <= 0) return null;

  return (
    <View pointerEvents="none" style={[styles.container, { height }]}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
});
