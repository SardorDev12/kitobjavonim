import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCover } from '@/components/BookCover';
import { EmptyState, LoadingState, Text, TextField, Toggle } from '@/components/ui';
import { searchBooks, type BookCandidate } from '@/lib/books/metadata';
import { formatAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useHousehold } from '@/lib/queries/household';
import { queryKeys } from '@/lib/queries/keys';
import { useLibrary } from '@/lib/queries/library';
import { useAddWishlistItem, useWishlist } from '@/lib/queries/wishlist';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useTheme } from '@/theme';

/**
 * Finds a book to want, not to own — a trimmed version of the library's add
 * flow with no shelf/condition/reading-status step, since none of those
 * apply to a book that isn't owned yet. See 0019_wishlist.sql.
 */
export default function WishlistAddScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  const { data: household } = useHousehold();
  const [shareItem, setShareItem] = useState(true);

  const { data: library } = useLibrary();
  const { data: wishlist } = useWishlist();
  const addItem = useAddWishlistItem();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 400);
    return () => clearTimeout(timer);
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.search.books(query),
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 10,
    queryFn: ({ signal }) => searchBooks(query, signal),
  });

  const results = useMemo(() => data ?? [], [data]);

  const ownedIsbns = useMemo(
    () => new Set((library ?? []).map((entry) => entry.isbn13).filter((isbn): isbn is string => Boolean(isbn))),
    [library]
  );
  const wishlistIsbns = useMemo(
    () => new Set((wishlist ?? []).map((entry) => entry.isbn13).filter((isbn): isbn is string => Boolean(isbn))),
    [wishlist]
  );

  function choose(candidate: BookCandidate) {
    const alreadyWishlisted = Boolean(candidate.isbn13 && wishlistIsbns.has(candidate.isbn13));
    if (alreadyWishlisted) {
      router.back();
      return;
    }
    addItem.mutate(
      { candidate, householdId: household && shareItem ? household.household.id : null },
      { onSuccess: () => router.back() }
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
        <Text variant="display">{t('wishlist.add')}</Text>
        <Text variant="body" color="textMuted">
          {t('wishlist.addSubtitle')}
        </Text>

        {household ? (
          <Toggle label={t('household.share')} hint={household.household.name} value={shareItem} onChange={setShareItem} />
        ) : null}

        <TextField
          placeholder={t('add.searchPlaceholder')}
          value={input}
          onChangeText={setInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          trailing={
            input ? (
              <Pressable onPress={() => setInput('')} hitSlop={8} accessibilityLabel={t('common.clear')}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textSubtle} />
              </Pressable>
            ) : (
              <Ionicons name="search" size={18} color={theme.colors.textSubtle} />
            )
          }
        />
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          results.length === 0 && styles.fill,
          { paddingTop: theme.spacing.md, paddingBottom: theme.spacing['2xl'] + keyboardHeight },
        ]}
        renderItem={({ item }) => (
          <CandidateRow
            candidate={item}
            alreadyOwned={Boolean(item.isbn13 && ownedIsbns.has(item.isbn13))}
            alreadyWishlisted={Boolean(item.isbn13 && wishlistIsbns.has(item.isbn13))}
            onPress={() => choose(item)}
          />
        )}
        ListEmptyComponent={
          isFetching ? (
            <LoadingState label={t('add.searching')} />
          ) : query.length >= 2 ? (
            <EmptyState icon="search-outline" title={t('add.noResults', { query })} body={t('add.noResultsBody')} />
          ) : (
            <EmptyState icon="heart-outline" title={t('wishlist.add')} body={t('wishlist.addSubtitle')} />
          )
        }
      />
    </View>
  );
}

function CandidateRow({
  candidate,
  alreadyOwned,
  alreadyWishlisted,
  onPress,
}: {
  candidate: BookCandidate;
  alreadyOwned: boolean;
  alreadyWishlisted: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  const meta = [candidate.publisher, candidate.publication_year?.toString()].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.md,
          backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
        },
      ]}
    >
      <BookCover uri={candidate.cover_url} title={candidate.title} width={48} />

      <View style={styles.rowBody}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {candidate.title}
        </Text>
        {candidate.authors.length > 0 ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {formatAuthors(candidate.authors)}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" color="textSubtle" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {alreadyWishlisted ? (
          <Text variant="caption" color="primary">
            {t('wishlist.alreadyListed')}
          </Text>
        ) : alreadyOwned ? (
          <Text variant="caption" color="textSubtle">
            {t('wishlist.alreadyOwned')}
          </Text>
        ) : null}
      </View>

      {alreadyWishlisted ? null : <Ionicons name="chevron-forward" size={18} color={theme.colors.textSubtle} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, flexGrow: 1 },
  header: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBody: { flex: 1, gap: 2 },
});
