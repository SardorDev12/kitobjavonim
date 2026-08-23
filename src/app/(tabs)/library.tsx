import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard } from '@/components/BookCard';
import { BookGridCard } from '@/components/BookGridCard';
import { GALLERY_TILE_WIDTH } from '@/components/BookCover';
import { PullToRefreshIndicator } from '@/components/PullToRefreshIndicator';
import { Chip, EmptyState, LoadingState, Sheet, Text, TextField } from '@/components/ui';
import { setPendingAddQuery } from '@/features/add/pendingAddQuery';
import { goToTab } from '@/features/tabs/activeTab';
import { useI18n } from '@/lib/i18n';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { selectLibrary, useLibrary, type LibraryFilter, type LibrarySort } from '@/lib/queries/library';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useTheme } from '@/theme';

const SORTS: LibrarySort[] = ['recent', 'title', 'author', 'finished', 'shelf'];
type ViewMode = 'list' | 'gallery';

// 'all' is pinned outside the draggable row (see the header below) — these
// are the ones the user can reorder.
const REORDERABLE_FILTERS: LibraryFilter[] = ['want_to_read', 'reading', 'finished', 'exchange', 'sale'];
const FILTER_ORDER_STORAGE_KEY = 'settings.libraryFilterOrder';

/**
 * Drops anything no longer a real filter and appends any filter missing from
 * a stored order (e.g. one added in a later release after the user last
 * reordered) — same "don't trust old local storage blindly" spirit as
 * theme/index.tsx's own mode validation.
 */
function sanitizeFilterOrder(stored: unknown): LibraryFilter[] {
  if (!Array.isArray(stored)) return REORDERABLE_FILTERS;
  const known = new Set<LibraryFilter>(REORDERABLE_FILTERS);
  const kept = stored.filter((value): value is LibraryFilter => known.has(value));
  const missing = REORDERABLE_FILTERS.filter((filter) => !kept.includes(filter));
  return [...kept, ...missing];
}

export default function LibraryScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isPending, isError, refetch, isRefetching } = useLibrary();
  const { pullDistance, handlers: pullHandlers } = usePullToRefresh(refetch, isRefetching);
  // The "not found, add it" empty state's button is the whole point of
  // searching here with nothing in your library yet — without this, the
  // keyboard that's necessarily still open (it's what you just searched
  // with) covers it, same problem add.tsx's catalog search has and fixes.
  const keyboardHeight = useKeyboardHeight();

  // Stable across renders so memo on BookCard/BookGridCard has something to
  // compare — see their own comments for why that matters in a virtualized
  // list.
  const openBook = useCallback((id: string) => router.push(`/book/${id}`), [router]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterOrder, setFilterOrder] = useState<LibraryFilter[]>(REORDERABLE_FILTERS);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(FILTER_ORDER_STORAGE_KEY)
      .then((stored) => {
        if (cancelled || !stored) return;
        try {
          setFilterOrder(sanitizeFilterOrder(JSON.parse(stored)));
        } catch {
          // Malformed storage — keep the default order.
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function reorderFilters(next: LibraryFilter[]) {
    setFilterOrder(next);
    AsyncStorage.setItem(FILTER_ORDER_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  // Tiles stay a fixed, small size on every screen — a wider window just
  // fits more columns of it, rather than a fixed column count rendering
  // visibly larger tiles.
  const gutter = theme.spacing.md;
  const horizontalPadding = theme.spacing.lg;
  const [listWidth, setListWidth] = useState(0);
  const galleryColumns =
    listWidth > 0
      ? Math.max(2, Math.floor((listWidth - horizontalPadding * 2 + gutter) / (GALLERY_TILE_WIDTH + gutter)))
      : 0;
  // Widened past the base gutter to close the slack Math.floor leaves
  // behind, so a full row's tiles reach the row's actual right edge exactly
  // (the same effect as justifyContent: 'space-between', without its
  // downside: applied as a real justifyContent, it would also stretch a
  // partial last row's one or two tiles apart to fill the leftover width,
  // which reads as a missing tile rather than intentional spacing. A fixed
  // gap keeps a partial row's spacing identical to a full row's while still
  // packing it to the left.)
  const galleryRowGap =
    galleryColumns > 1
      ? Math.max(gutter, (listWidth - horizontalPadding * 2 - galleryColumns * GALLERY_TILE_WIDTH) / (galleryColumns - 1))
      : gutter;

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
              accessibilityLabel={`${t('common.sort')}: ${t(`library.sort.${sort}`)}`}
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
              <Ionicons name="swap-vertical" size={18} color={theme.colors.textMuted} />
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

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: theme.spacing.md,
          paddingLeft: theme.spacing.lg,
          gap: theme.spacing.sm,
        }}
      >
        <Chip label={t('library.filter.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <DraggableFlatList
          horizontal
          data={filterOrder}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
          onDragEnd={({ data }) => reorderFilters(data)}
          renderItem={({ item, drag, isActive }: RenderItemParams<LibraryFilter>) => (
            <Pressable onLongPress={drag} disabled={isActive} onPress={() => setFilter(item)}>
              <Chip label={t(`library.filter.${item}`)} selected={filter === item} />
            </Pressable>
          )}
        />
      </View>

      <View style={styles.fill} onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}>
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={isRefetching} />
      <FlatList
        key={viewMode === 'gallery' ? `gallery-${galleryColumns}` : 'list'}
        data={entries}
        keyExtractor={(entry) => entry.id}
        numColumns={viewMode === 'gallery' ? Math.max(galleryColumns, 1) : 1}
        // galleryRowGap (not the base gutter) — see its own comment above
        // for why: a full row's tiles reach the row's right edge exactly
        // (reading the same as space-between), while a partial row keeps
        // that identical spacing and stays packed to the left instead of
        // stretching to fill the leftover width.
        columnWrapperStyle={viewMode === 'gallery' && galleryColumns > 1 ? { gap: galleryRowGap } : undefined}
        renderItem={({ item }) =>
          viewMode === 'gallery' ? (
            galleryColumns > 0 ? (
              <BookGridCard entry={item} width={GALLERY_TILE_WIDTH} onPress={openBook} />
            ) : null
          ) : (
            <BookCard entry={item} onPress={openBook} />
          )
        }
        contentContainerStyle={[
          entries.length === 0 && styles.fill,
          viewMode === 'gallery' && { paddingHorizontal: horizontalPadding },
          { paddingBottom: theme.spacing['2xl'] + keyboardHeight, gap: viewMode === 'gallery' ? theme.spacing.xl : 0 },
        ]}
        scrollEventThrottle={16}
        {...pullHandlers}
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
              onAction={() => {
                setPendingAddQuery(search.trim());
                goToTab('add');
              }}
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
              onAction={() => goToTab('add')}
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
  sortOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
