import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard } from '@/components/BookCard';
import { BookGridCard } from '@/components/BookGridCard';
import { Chip, ChipRow, EmptyState, LoadingState, Sheet, Text, TextField } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { selectLibrary, useLibrary, type LibraryFilter, type LibrarySort } from '@/lib/queries/library';
import { useLayout, useTheme } from '@/theme';

const FILTERS: LibraryFilter[] = ['all', 'want_to_read', 'reading', 'finished', 'exchange', 'sale'];
const SORTS: LibrarySort[] = ['recent', 'title', 'author', 'finished', 'shelf'];
type ViewMode = 'list' | 'gallery';

export default function LibraryScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gridColumns } = useLayout();

  const { data, isPending, isError, refetch, isRefetching } = useLibrary();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // A fixed gutter divided across however many columns the width allows —
  // same approach as the Discover grid.
  const gutter = theme.spacing.md;
  const horizontalPadding = theme.spacing.lg;
  const [listWidth, setListWidth] = useState(0);
  const tileWidth =
    listWidth > 0
      ? (listWidth - horizontalPadding * 2 - gutter * (gridColumns - 1)) / gridColumns
      : 0;

  const entries = useMemo(
    () => selectLibrary(data ?? [], { filter, sort, search }),
    [data, filter, sort, search]
  );

  const isFiltered = filter !== 'all' || search.trim().length > 0;
  const total = data?.length ?? 0;

  if (isPending) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
        <LoadingState />
      </View>
    );
  }

  if (isError && total === 0) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
        <EmptyState
          tone="error"
          title={t('error.loadFailed')}
          body={t('error.network')}
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text variant="display">{t('library.title')}</Text>
            <Text variant="caption" color="textMuted">
              {t('library.bookCount', { count: total })}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setViewMode(viewMode === 'list' ? 'gallery' : 'list')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={viewMode === 'list' ? t('library.viewGallery') : t('library.viewList')}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
                size={18}
                color={theme.colors.textMuted}
              />
            </Pressable>

            <Pressable
              onPress={() => setSortOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.sort')}
              style={({ pressed }) => [
                styles.sortButton,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="swap-vertical" size={16} color={theme.colors.textMuted} />
              <Text variant="caption" color="textMuted">
                {t(`library.sort.${sort}`)}
              </Text>
            </Pressable>
          </View>
        </View>

        <TextField
          placeholder={t('library.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          trailing={
            search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel={t('common.clear')}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textSubtle} />
              </Pressable>
            ) : (
              <Ionicons name="search" size={18} color={theme.colors.textSubtle} />
            )
          }
        />
      </View>

      <View style={{ paddingVertical: theme.spacing.md }}>
        <ChipRow>
          {FILTERS.map((option) => (
            <Chip
              key={option}
              label={t(`library.filter.${option}`)}
              selected={filter === option}
              onPress={() => setFilter(option)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={styles.fill} onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}>
      <FlatList
        key={viewMode === 'gallery' ? `gallery-${gridColumns}` : 'list'}
        data={entries}
        keyExtractor={(entry) => entry.id}
        numColumns={viewMode === 'gallery' ? gridColumns : 1}
        columnWrapperStyle={viewMode === 'gallery' && gridColumns > 1 ? { gap: gutter } : undefined}
        renderItem={({ item }) =>
          viewMode === 'gallery' ? (
            tileWidth > 0 ? (
              <BookGridCard entry={item} width={tileWidth} onPress={() => router.push(`/book/${item.id}`)} />
            ) : null
          ) : (
            <BookCard entry={item} onPress={() => router.push(`/book/${item.id}`)} />
          )
        }
        contentContainerStyle={[
          entries.length === 0 && styles.fill,
          viewMode === 'gallery' && { paddingHorizontal: horizontalPadding },
          { paddingBottom: theme.spacing['2xl'], gap: viewMode === 'gallery' ? theme.spacing.xl : 0 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          search.trim().length > 0 ? (
            // A text search that turns up nothing in the user's own library
            // most likely means they don't own that book yet — offer the
            // fastest path to adding it, with the same query carried over.
            <EmptyState
              icon="search-outline"
              title={t('library.noResults')}
              body={t('library.noResultsAddBody')}
              actionLabel={t('library.noResultsAddCta')}
              onAction={() => router.push({ pathname: '/(tabs)/add', params: { q: search.trim() } })}
            />
          ) : isFiltered ? (
            <EmptyState
              icon="search-outline"
              title={t('library.noResults')}
              body={t('library.noResultsBody')}
              actionLabel={t('common.clear')}
              onAction={() => {
                setSearch('');
                setFilter('all');
              }}
            />
          ) : (
            <EmptyState
              title={t('library.empty.title')}
              body={t('library.empty.body')}
              actionLabel={t('library.empty.cta')}
              onAction={() => router.push('/(tabs)/add')}
            />
          )
        }
      />
      </View>

      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title={t('common.sort')}>
        {SORTS.map((option) => (
          <Pressable
            key={option}
            onPress={() => {
              setSort(option);
              setSortOpen(false);
            }}
            style={({ pressed }) => [
              styles.sortOption,
              { paddingVertical: theme.spacing.md },
              pressed && { backgroundColor: theme.colors.surfaceSunken },
            ]}
          >
            <Text variant={sort === option ? 'bodyStrong' : 'body'} color={sort === option ? 'primary' : 'text'}>
              {t(`library.sort.${option}`)}
            </Text>
            {sort === option ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, flexGrow: 1 },
  header: { gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titleText: { flex: 1, gap: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sortOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
