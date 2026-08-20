import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/BookCover';
import { Button, Card, EmptyState, LoadingState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { setPendingBook } from '@/features/add/pendingBook';
import { formatAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useHousehold } from '@/lib/queries/household';
import { useDeleteWishlistItem, useSetWishlistItemHousehold, useWishlist } from '@/lib/queries/wishlist';
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
          (items ?? []).map((item) => <WishlistRow key={item.id} entry={item} />)
        )}
      </View>
    </Screen>
  );
}

function WishlistRow({ entry }: { entry: WishlistEntry }) {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();

  const { data: household } = useHousehold();
  const setHousehold = useSetWishlistItemHousehold();
  const deleteItem = useDeleteWishlistItem();

  const isShared = Boolean(entry.household_id);
  // Un-sharing is restricted to the item's own creator at the database
  // level (0019's assert_user_id_immutable, mirroring bookshelves) — only
  // offer the toggle where it would actually succeed.
  const canToggleShare = Boolean(household) && entry.user_id === user?.id;
  const addedByOther = entry.user_id !== user?.id ? entry.added_by_name : null;

  const meta = [entry.publisher, entry.publication_year?.toString()].filter(Boolean).join(' · ');

  function confirmRemove() {
    const message = t('wishlist.removeConfirm', { title: entry.title });
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) deleteItem.mutate(entry.id);
      return;
    }
    Alert.alert('', message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteItem.mutate(entry.id) },
    ]);
  }

  function gotIt() {
    setPendingBook({
      key: `wishlist-${entry.id}`,
      title: entry.title,
      subtitle: entry.subtitle,
      authors: entry.authors,
      isbn13: entry.isbn13,
      isbn10: entry.isbn10,
      publisher: entry.publisher,
      publication_year: entry.publication_year,
      language: entry.language,
      cover_url: entry.cover_url,
      page_count: entry.page_count,
      description: entry.description,
      source: entry.source,
      source_id: entry.source_id,
    });
    router.push({ pathname: '/add/configure', params: { fromWishlistId: entry.id } });
  }

  return (
    <Card padded={false}>
      <View style={[styles.row, { padding: theme.spacing.lg, gap: theme.spacing.md }]}>
        <BookCover uri={entry.cover_url} title={entry.title} width={56} radius={theme.radius.sm} />

        <View style={styles.body}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {entry.title}
          </Text>
          {entry.authors.length > 0 ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {formatAuthors(entry.authors)}
            </Text>
          ) : null}
          {meta ? (
            <Text variant="caption" color="textSubtle" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {addedByOther ? (
            <Text variant="caption" color="textSubtle">
              {t('household.addedBy', { name: addedByOther })}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: theme.spacing.md, alignItems: 'flex-end' }}>
          {isShared || canToggleShare ? (
            <Pressable
              onPress={
                canToggleShare
                  ? () =>
                      setHousehold.mutate({
                        id: entry.id,
                        householdId: isShared ? null : (household?.household.id ?? null),
                      })
                  : undefined
              }
              disabled={!canToggleShare}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('household.share')}
              style={{ opacity: canToggleShare ? 1 : 0.6 }}
            >
              <Ionicons
                name={isShared ? 'people' : 'people-outline'}
                size={18}
                color={isShared ? theme.colors.primary : theme.colors.textSubtle}
              />
            </Pressable>
          ) : null}
          <Pressable onPress={gotIt} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('wishlist.gotIt')}>
            <Ionicons name="checkmark-circle-outline" size={20} color={theme.colors.primary} />
          </Pressable>
          <Pressable
            onPress={confirmRemove}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  body: { flex: 1, gap: 2 },
});
