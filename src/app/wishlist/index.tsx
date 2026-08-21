import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, LoadingState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useWishlist } from '@/lib/queries/wishlist';
import { useTheme } from '@/theme';
import type { WishlistEntry } from '@/types/database';

/**
 * Books wanted but not yet owned — separate from the library, which is
 * copies actually on a shelf. See 0019_wishlist.sql for why.
 */
export default function WishlistScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const { data: items, isPending } = useWishlist();

  if (isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      footer={<Button title={t('wishlist.add')} icon="add" fullWidth onPress={() => router.push('/wishlist/add')} />}
    >
      <View style={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="display">{t('wishlist.title')}</Text>
          <Text variant="body" color="textMuted">
            {t('wishlist.subtitle')}
          </Text>
        </View>

        {(items ?? []).length === 0 ? (
          <EmptyState
            icon="heart-outline"
            title={t('wishlist.empty')}
            body={t('wishlist.emptyBody')}
            actionLabel={t('wishlist.add')}
            onAction={() => router.push('/wishlist/add')}
          />
        ) : (
          (items ?? []).map((item) => <WishlistRow key={item.id} entry={item} onPress={() => router.push(`/wishlist/${item.id}`)} />)
        )}
      </View>
    </Screen>
  );
}

/**
 * Tapping the row opens the item's own screen (wishlist/[id].tsx) — sharing
 * and removal live there now rather than as small inline controls here,
 * same shape as BookCard/book/[id].tsx.
 */
function WishlistRow({ entry, onPress }: { entry: WishlistEntry; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();

  const addedByOther = entry.user_id !== user?.id ? entry.added_by_name : null;

  return (
    <Card padded={false} onPress={onPress}>
      <View style={[styles.row, { padding: theme.spacing.lg, gap: theme.spacing.md }]}>
        <View style={styles.body}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {entry.title}
          </Text>
          {entry.authors.length > 0 ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {formatAuthors(entry.authors)}
            </Text>
          ) : null}
          {addedByOther ? (
            <Text variant="caption" color="textSubtle">
              {t('household.addedBy', { name: addedByOther })}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-forward" size={18} color={theme.colors.textSubtle} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, gap: 2 },
});
