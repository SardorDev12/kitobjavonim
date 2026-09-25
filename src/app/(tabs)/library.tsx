import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard } from '@/components/BookCard';
import { BookGridCard } from '@/components/BookGridCard';
import { GALLERY_TILE_WIDTH } from '@/components/BookCover';
import { PullToRefreshIndicator } from '@/components/PullToRefreshIndicator';
import { Chip, Divider, EmptyState, ListRow, LoadingState, Sheet, Text, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { setPendingAddQuery } from '@/features/add/pendingAddQuery';
import { goToTab } from '@/features/tabs/activeTab';
import { useI18n } from '@/lib/i18n';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useHousehold } from '@/lib/queries/household';
import {
  selectLibrary,
  useBulkDeleteUserBooks,
  useBulkShareWithHousehold,
  useLibrary,
  type LibraryFilter,
  type LibrarySort,
} from '@/lib/queries/library';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useLayout, useTheme } from '@/theme';

const SORTS: LibrarySort[] = ['recent', 'title', 'author', 'finished'];
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
  const { maxContentWidth } = useLayout();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isPending, isError, refetch, isRefetching } = useLibrary();
  const { user } = useAuth();
  const { data: household } = useHousehold();
  const { pullDistance, handlers: pullHandlers } = usePullToRefresh(refetch, isRefetching);
  const bulkDelete = useBulkDeleteUserBooks();
  const bulkShare = useBulkShareWithHousehold();
  // The "not found, add it" empty state's button is the whole point of
  // searching here with nothing in your library yet — without this, the
  // keyboard that's necessarily still open (it's what you just searched
  // with) covers it, same problem add.tsx's catalog search has and fixes.
  const keyboardHeight = useKeyboardHeight();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterOrder, setFilterOrder] = useState<LibraryFilter[]>(REORDERABLE_FILTERS);

  // Multiselect — entered via the header button or a long-press on any card.
  // selectedIds stays scoped to whatever's currently visible; leaving the
  // set holding an id that scrolls out of the filtered list is harmless
  // (still a valid book, still gets acted on), so filter/search changes
  // don't need to prune it.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionActionsOpen, setSelectionActionsOpen] = useState(false);

  // Stable across renders so memo on BookCard/BookGridCard has something to
  // compare — see their own comments for why that matters in a virtualized
  // list. handleCardPress/handleCardLongPress intentionally depend on
  // selectMode (their identity changing on that one transition re-renders
  // every row to swap in/out the checkbox anyway) but not on selectedIds —
  // toggleSelected below reads/writes it through the setState updater form,
  // so selecting one row never invalidates every other row's memo.
  const openBook = useCallback((id: string) => router.push(`/book/${id}`), [router]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterSelectMode = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setSelectionActionsOpen(false);
  }, []);

  const handleCardPress = useCallback(
    (id: string) => (selectMode ? toggleSelected(id) : openBook(id)),
    [selectMode, toggleSelected, openBook]
  );

  const handleCardLongPress = useCallback(
    (id: string) => {
      if (!selectMode) enterSelectMode(id);
    },
    [selectMode, enterSelectMode]
  );

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

  function selectAllVisible() {
    setSelectedIds(new Set(entries.map((entry) => entry.id)));
  }

  // Sharing is only ever the copy's own creator's call to make (0015's RLS
  // — book/[id].tsx's own household-share toggle is disabled the same way
  // for the same reason), so a household member's shared-with-you book in
  // the selection is silently left out of the share action rather than
  // sent as a request RLS would just reject.
  const selectedOwnedIds = useMemo(
    () => entries.filter((entry) => selectedIds.has(entry.id) && entry.user_id === user?.id).map((entry) => entry.id),
    [entries, selectedIds, user?.id]
  );

  function handleBulkShare() {
    if (!household || selectedOwnedIds.length === 0) return;
    setSelectionActionsOpen(false);
    bulkShare.mutate(
      { ids: selectedOwnedIds, householdId: household.household.id },
      { onSuccess: exitSelectMode }
    );
  }

  function confirmBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSelectionActionsOpen(false);

    const message = t('library.deleteSelectedConfirm', { count: ids.length });
    const remove = () => bulkDelete.mutate(ids, { onSuccess: exitSelectMode });

    // React Native's Alert is a no-op on web, same reasoning as
    // book/[id].tsx's own confirmDelete().
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`${message}\n\n${t('common.confirmDelete')}`)) remove();
      return;
    }

    Alert.alert(t('library.deleteSelected'), `${message}\n\n${t('common.confirmDelete')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: remove },
    ]);
  }

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
    <View style={[styles.fill, styles.center, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
    <View style={[styles.fill, { width: '100%', maxWidth: maxContentWidth }]}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
        {selectMode ? (
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <Text variant="display">{t('library.selectedCount', { count: selectedIds.size })}</Text>
              <Pressable onPress={selectAllVisible} hitSlop={8}>
                <Text variant="label" color="primary">
                  {t('library.selectAll')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.headerActions}>
              {selectedIds.size > 0 ? (
                <Pressable
                  onPress={() => setSelectionActionsOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.more')}
                >
                  <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.text} />
                </Pressable>
              ) : null}
              <Pressable onPress={exitSelectMode} hitSlop={8} accessibilityRole="button">
                <Text variant="label" color="textMuted">
                  {t('common.cancel')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
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

              {total > 0 ? (
                <Pressable
                  onPress={() => setSelectMode(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('library.select')}
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
                  <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>
        )}

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
              <BookGridCard
                entry={item}
                width={GALLERY_TILE_WIDTH}
                onPress={handleCardPress}
                onLongPress={handleCardLongPress}
                selectable={selectMode}
                selected={selectedIds.has(item.id)}
              />
            ) : null
          ) : (
            <BookCard
              entry={item}
              onPress={handleCardPress}
              onLongPress={handleCardLongPress}
              selectable={selectMode}
              selected={selectedIds.has(item.id)}
            />
          )
        }
        contentContainerStyle={[
          entries.length === 0 && styles.fill,
          viewMode === 'gallery' && { paddingHorizontal: horizontalPadding },
          {
            paddingBottom: theme.spacing['2xl'] + keyboardHeight,
            gap: viewMode === 'gallery' ? theme.spacing.xl : 0,
          },
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
    </View>

      <Sheet visible={selectionActionsOpen} onClose={() => setSelectionActionsOpen(false)}>
        {household ? (
          <>
            <ListRow
              icon="people-outline"
              label={t('library.shareWithFamily')}
              disabled={selectedOwnedIds.length === 0 || bulkShare.isPending}
              onPress={handleBulkShare}
            />
            <Divider inset={theme.spacing.lg} />
          </>
        ) : null}
        <ListRow
          icon="trash-outline"
          label={t('library.deleteSelected')}
          destructive
          disabled={bulkDelete.isPending}
          onPress={confirmBulkDelete}
        />
      </Sheet>

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
  // Centers the maxWidth-capped content box below (see maxContentWidth,
  // same treatment Screen.tsx gives every screen that uses it) — this
  // screen owns a FlatList instead of Screen's ScrollView (see that
  // component's own docstring for why), so it has to apply the same
  // web-container treatment by hand.
  center: { alignItems: 'center' },
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
