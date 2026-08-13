import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingCard } from '@/components/ListingCard';
import { Button, Chip, ChipRow, EmptyState, LoadingState, Screen, Select, Sheet, Text, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { emptyListingFilters, useListings, type ListingFilters } from '@/lib/queries/listings';
import { useCategoryOptions, useLocationOptions } from '@/lib/queries/reference';
import { useLayout, useTheme } from '@/theme';
import { BOOK_CONDITIONS, type BookCondition } from '@/types/database';

const LANGUAGE_OPTIONS = [
  { value: 'uz', label: 'Oʻzbekcha' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
];

export default function DiscoverScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { gridColumns } = useLayout();
  const { session } = useAuth();

  // Listing links are public, so a signed-out visitor who followed one here
  // can land on this screen with no account at all. Sending them to add a
  // book of their own goes through sign-in first, same as the root layout's
  // route guard already does for the Add tab itself.
  function goToAdd() {
    router.push(session ? '/(tabs)/add' : '/(auth)/sign-in');
  }

  const [filters, setFilters] = useState<ListingFilters>(emptyListingFilters);
  const [searchInput, setSearchInput] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((prev) => ({ ...prev, search: searchInput })), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isPending, isError, refetch, isRefetching } = useListings(filters);
  const locations = useLocationOptions();

  const listings = data ?? [];

  const activeFilterCount = useMemo(
    () =>
      [filters.categoryId, filters.language, filters.condition, filters.districtId ?? filters.regionId].filter(
        Boolean
      ).length,
    [filters]
  );

  // A fixed gutter divided across however many columns the width allows.
  const gutter = theme.spacing.md;
  const horizontalPadding = theme.spacing.lg;
  const [listWidth, setListWidth] = useState(0);
  const tileWidth =
    listWidth > 0
      ? (listWidth - horizontalPadding * 2 - gutter * (gridColumns - 1)) / gridColumns
      : 0;

  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: horizontalPadding, paddingTop: theme.spacing.md }]}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text variant="display">{t('discover.title')}</Text>
            <Text variant="body" color="textMuted">
              {t('discover.subtitle')}
            </Text>
          </View>

          <Button
            title={t('discover.addBook')}
            icon="add"
            variant="secondary"
            size="sm"
            onPress={goToAdd}
          />
        </View>

        <View style={[styles.searchRow, { gap: theme.spacing.sm }]}>
          <TextField
            placeholder={t('discover.searchPlaceholder')}
            value={searchInput}
            onChangeText={setSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            containerStyle={styles.fill}
            trailing={
              searchInput ? (
                <Pressable onPress={() => setSearchInput('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textSubtle} />
                </Pressable>
              ) : (
                <Ionicons name="search" size={18} color={theme.colors.textSubtle} />
              )
            }
          />

          <Pressable
            onPress={() => setFiltersOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('common.filters')}
            style={({ pressed }) => [
              styles.filterButton,
              {
                backgroundColor: activeFilterCount > 0 ? theme.colors.primarySoft : theme.colors.surface,
                borderColor: activeFilterCount > 0 ? 'transparent' : theme.colors.border,
                borderRadius: theme.radius.md,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={activeFilterCount > 0 ? theme.colors.primaryOnSoft : theme.colors.textMuted}
            />
            {activeFilterCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                <Text variant="micro" style={{ color: theme.colors.textInverted }}>
                  {activeFilterCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <View style={{ paddingVertical: theme.spacing.md }}>
        <ChipRow>
          {(['all', 'exchange', 'sale'] as const).map((type) => (
            <Chip
              key={type}
              label={t(`discover.type.${type}`)}
              selected={filters.type === type}
              onPress={() => setFilters((prev) => ({ ...prev, type }))}
            />
          ))}
        </ChipRow>
      </View>

      <View style={styles.fill} onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <EmptyState
            tone="error"
            title={t('error.loadFailed')}
            body={t('error.network')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        ) : (
          <FlatList
            key={gridColumns}
            data={listings}
            numColumns={gridColumns}
            keyExtractor={(item) => item.id}
            columnWrapperStyle={gridColumns > 1 ? { gap: gutter } : undefined}
            contentContainerStyle={[
              listings.length === 0 && styles.fill,
              {
                paddingHorizontal: horizontalPadding,
                paddingBottom: theme.spacing['2xl'],
                gap: theme.spacing.xl,
              },
            ]}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.colors.primary} />
            }
            renderItem={({ item }) =>
              tileWidth > 0 ? (
                <ListingCard
                  listing={item}
                  width={tileWidth}
                  locationLabel={locations.describe(item.owner_district_id, item.owner_region_id)}
                  onPress={() => router.push(`/listing/${item.id}`)}
                />
              ) : null
            }
            ListHeaderComponent={
              listings.length > 0 ? (
                <Text variant="caption" color="textMuted" style={{ marginBottom: theme.spacing.sm }}>
                  {t('discover.resultCount', { count: listings.length })}
                </Text>
              ) : null
            }
            ListEmptyComponent={
              activeFilterCount > 0 || filters.search || filters.type !== 'all' ? (
                <EmptyState
                  icon="search-outline"
                  title={t('discover.noResults')}
                  body={t('discover.noResultsBody')}
                  actionLabel={t('discover.clearFilters')}
                  onAction={() => {
                    setFilters(emptyListingFilters);
                    setSearchInput('');
                  }}
                />
              ) : (
                <EmptyState
                  icon="swap-horizontal"
                  title={t('discover.empty')}
                  body={t('discover.emptyBody')}
                  actionLabel={t('tabs.library')}
                  onAction={() => router.push('/(tabs)')}
                />
              )
            }
          />
        )}
      </View>

      <FiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
      />
    </View>
  );
}

function FiltersSheet({
  visible,
  onClose,
  filters,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  filters: ListingFilters;
  onApply: (filters: ListingFilters) => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const categories = useCategoryOptions();
  const locations = useLocationOptions();

  const [draft, setDraft] = useState(filters);

  // Reopening the sheet should show what is currently applied, not what was
  // half-typed and abandoned last time.
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const districts = locations.districtsFor(draft.regionId);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('common.filters')}>
      <View style={{ gap: theme.spacing.lg }}>
        <Select
          label={t('discover.category')}
          placeholder={t('discover.anyCategory')}
          value={draft.categoryId}
          options={categories}
          onChange={(categoryId) => setDraft((prev) => ({ ...prev, categoryId }))}
          clearable
          clearLabel={t('discover.anyCategory')}
        />

        <Select
          label={t('discover.language')}
          placeholder={t('discover.anyLanguage')}
          value={draft.language}
          options={LANGUAGE_OPTIONS}
          onChange={(language) => setDraft((prev) => ({ ...prev, language }))}
          clearable
          clearLabel={t('discover.anyLanguage')}
        />

        <Select
          label={t('discover.condition')}
          placeholder={t('discover.anyCondition')}
          value={draft.condition}
          options={BOOK_CONDITIONS.map((value) => ({ value, label: t(`condition.${value}`) }))}
          onChange={(condition) => setDraft((prev) => ({ ...prev, condition: condition as BookCondition | null }))}
          clearable
          clearLabel={t('discover.anyCondition')}
        />

        <Select
          label={t('onboarding.region')}
          placeholder={t('discover.anywhere')}
          value={draft.regionId}
          options={locations.regions}
          onChange={(regionId) => setDraft((prev) => ({ ...prev, regionId, districtId: null }))}
          clearable
          clearLabel={t('discover.anywhere')}
        />

        <Select
          label={t('onboarding.district')}
          placeholder={t('discover.anywhere')}
          value={draft.districtId}
          options={districts}
          onChange={(districtId) => setDraft((prev) => ({ ...prev, districtId }))}
          disabled={!draft.regionId}
          clearable
          clearLabel={t('discover.anywhere')}
        />

        <Button title={t('common.apply')} fullWidth onPress={() => onApply(draft)} />
        <Button
          title={t('discover.clearFilters')}
          variant="ghost"
          fullWidth
          onPress={() => onApply({ ...emptyListingFilters, search: filters.search, type: filters.type })}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, flexGrow: 1 },
  header: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titleText: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  filterButton: {
    width: 46,
    height: 46,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
