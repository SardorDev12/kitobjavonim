import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCover } from '@/components/BookCover';
import { Button, EmptyState, LoadingState, Text, TextField } from '@/components/ui';
import { setPendingBook } from '@/features/add/pendingBook';
import { searchBooks, type BookCandidate } from '@/lib/books/metadata';
import { formatAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/queries/keys';
import { findWishlistMatch, useWishlist } from '@/lib/queries/wishlist';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useTheme } from '@/theme';

export default function AddScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // This screen doesn't use the shared Screen component (it owns a
  // FlatList, not a ScrollView), so it needs its own keyboard-height
  // padding — without it, the "Qo'shish" manual-entry button rendered as
  // the empty/footer state stays wherever the FlatList's un-shrunk (under
  // edge-to-edge) layout put it, which the keyboard then just draws over.
  const keyboardHeight = useKeyboardHeight();
  // Carried over from the Library tab's "not found, add it" empty state —
  // tabs stay mounted across switches, so this can't be initial state alone,
  // it has to react to the param changing on an already-mounted screen too.
  const params = useLocalSearchParams<{ q?: string }>();

  const [input, setInput] = useState(params.q ?? '');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (params.q) setInput(params.q);
  }, [params.q]);

  // Debounced so typing a title does not fire a request per keystroke — the
  // providers are free but rate-limited, and this is the hottest screen.
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

  const { data: wishlist } = useWishlist();

  function proceed(candidate: BookCandidate) {
    setPendingBook(candidate);
    router.push('/add/configure');
  }

  // Even when the user skips or dismisses this, add/configure.tsx clears the
  // matching wishlist entry unconditionally once the book is actually saved
  // — this prompt is just an earlier, optional heads-up.
  function choose(candidate: BookCandidate) {
    const match = findWishlistMatch(wishlist, candidate.title, candidate.authors);
    if (!match) {
      proceed(candidate);
      return;
    }

    const message = t('wishlist.matchBody', { title: match.title });
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) proceed(candidate);
      return;
    }
    Alert.alert(t('wishlist.matchTitle'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('wishlist.matchContinue'), onPress: () => proceed(candidate) },
    ]);
  }

  function enterManually() {
    setPendingBook(null);
    router.push({ pathname: '/add/manual', params: query ? { title: query } : undefined });
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
        <Text variant="display">{t('add.title')}</Text>
        <Text variant="body" color="textMuted">
          {t('add.subtitle')}
        </Text>

        {/* Scanning is the fast path the PRD is built around, so it sits above
            the search field rather than behind an icon — on native. The camera
            API it depends on has no web equivalent worth building against, so
            rather than show a button that only explains why it doesn't work,
            web skips straight to search and manual entry. */}
        {Platform.OS !== 'web' ? (
          <Button title={t('add.scan')} icon="barcode-outline" fullWidth onPress={() => router.push('/add/scan')} />
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
        renderItem={({ item }) => <CandidateRow candidate={item} onPress={() => choose(item)} />}
        ListFooterComponent={
          results.length > 0 ? (
            <View style={{ padding: theme.spacing.lg, alignItems: 'center' }}>
              <Button
                title={t('add.manual')}
                variant="ghost"
                onPress={enterManually}
                // alignItems: 'center' above has no effect on its own — Button
                // sets alignSelf: 'flex-start' internally, which wins over a
                // parent's alignItems for that child.
                style={{ alignSelf: 'center' }}
              />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isFetching ? (
            <LoadingState label={t('add.searching')} />
          ) : query.length >= 2 ? (
            <EmptyState
              icon="search-outline"
              title={t('add.noResults', { query })}
              body={t('add.noResultsBody')}
              actionLabel={t('add.manual')}
              onAction={enterManually}
            />
          ) : (
            <EmptyState
              icon="book-outline"
              title={t('add.title')}
              body={t('add.subtitle')}
              actionLabel={t('add.manual')}
              onAction={enterManually}
            />
          )
        }
      />
    </View>
  );
}

function CandidateRow({ candidate, onPress }: { candidate: BookCandidate; onPress: () => void }) {
  const theme = useTheme();

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
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, flexGrow: 1 },
  header: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBody: { flex: 1, gap: 2 },
});
