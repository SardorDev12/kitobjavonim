import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';

import { BookCover, COVER_ASPECT } from '@/components/BookCover';
import {
  BackHeader,
  Card,
  Divider,
  EmptyState,
  LoadingState,
  Rating,
  Screen,
  SectionHeader,
  Sheet,
  Text,
} from '@/components/ui';
import { formatAuthors, formatDate, formatMonthShort, formatMonthYear, formatWeekRange, formatWeekdayNarrow } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLibraryCategoryCounts } from '@/lib/queries/categories';
import { useLibrary } from '@/lib/queries/library';
import { useReadingActivity } from '@/lib/queries/readingActivity';
import { useCategoryOptions } from '@/lib/queries/reference';
import { computePeriodStats, computeReadingStats, computeStreak, shiftPeriod, type BookCard, type PeriodType } from '@/lib/readingStats';
import { useTheme } from '@/theme';
import type { LibraryEntry } from '@/types/database';

const PERIODS: PeriodType[] = ['day', 'week', 'month', 'year'];

// A grid tile's approximate height (a fixed-width cover at COVER_ASPECT, plus
// its title line and the gap between rows) — used only to cap the finished-
// books grid at roughly 3 rows before it scrolls within its own bounded
// pane, same reasoning as the list view this replaced.
const GRID_TILE_WIDTH = 84;
const GRID_ROW_HEIGHT = GRID_TILE_WIDTH / COVER_ASPECT + 40;
const GRID_VISIBLE_ROWS = 3;

/**
 * The full reading-stats page — browsable by period (day/week/month/year,
 * any past date) rather than a single fixed snapshot: a hero count, a bar
 * chart, the annual goal (year view only), quick-glance tiles, a best-reads
 * shortlist, longest/shortest book of the period, and a finished-books
 * grid, all scoped to whichever period is selected — plus the library's
 * whole-collection totals, rating distribution and category breakdown
 * below, which aren't period-scoped by nature.
 */
export default function ReadingStatsScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();

  const { data: library, isPending } = useLibrary();
  const stats = useMemo(() => computeReadingStats(library ?? []), [library]);

  const { data: activityDates } = useReadingActivity();
  const streak = useMemo(() => computeStreak(activityDates ?? []), [activityDates]);

  const [period, setPeriod] = useState<PeriodType>('year');
  const [refDate, setRefDate] = useState(() => new Date());
  const periodStats = useMemo(() => computePeriodStats(library ?? [], period, refDate), [library, period, refDate]);

  function selectPeriod(next: PeriodType) {
    setPeriod(next);
    setRefDate(new Date());
  }

  const now = new Date();
  const isAtLatestPeriod = now >= periodStats.start && now <= periodStats.end;

  const earliestYear = useMemo(() => {
    const years = (library ?? []).map((entry) => new Date(entry.date_added).getFullYear());
    return years.length ? Math.min(...years, now.getFullYear()) : now.getFullYear() - 4;
    // now is only read once per render, well within acceptable staleness for a year-picker floor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library]);

  // Whole-library finished shelf (unrelated to the period picker) — still
  // needed for the Categories breakdown below, which stays scoped to the
  // whole collection rather than whatever period happens to be browsed.
  const finishedBooks = useMemo(
    () => (library ?? []).filter((entry) => entry.reading_status === 'finished'),
    [library]
  );
  const finishedBookIds = useMemo(() => finishedBooks.map((entry) => entry.id), [finishedBooks]);
  const { data: categoryCounts } = useLibraryCategoryCounts(finishedBookIds);
  const categoryOptions = useCategoryOptions();

  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [bestReadsOpen, setBestReadsOpen] = useState(false);

  // Every stat still actually shown on this page gets a line here — nothing
  // more (no favorite-author line: that detail was dropped from the page
  // itself, so it stopped belonging in what gets shared too; no goal line
  // either, now that the reading-goal feature itself is gone). Always the
  // current calendar year, regardless of which period is being browsed —
  // "share my year" means the year, not whatever's on screen.
  function shareYear() {
    const year = new Date().getFullYear();
    const lines = [
      t('reading.shareHeader', { year }),
      t('reading.shareBooks', { count: stats.finished.year }),
      stats.pagesRead > 0 ? t('reading.sharePages', { count: stats.pagesRead }) : null,
      stats.avgRating != null ? t('reading.shareRating', { rating: stats.avgRating.toFixed(1) }) : null,
      stats.longestBook ? t('reading.shareLongest', { title: stats.longestBook.title, pages: stats.longestBook.pages }) : null,
      stats.shortestBook ? t('reading.shareShortest', { title: stats.shortestBook.title, pages: stats.shortestBook.pages }) : null,
      stats.fastestFinish
        ? t('reading.shareFastest', { title: stats.fastestFinish.title, count: stats.fastestFinish.days })
        : null,
      streak.current > 0 ? t('reading.shareStreak', { count: streak.current }) : null,
    ].filter((line): line is string => Boolean(line));
    void Share.share({ message: lines.join('\n') });
  }

  if (isPending) {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader />
        <Screen>
          <LoadingState />
        </Screen>
      </View>
    );
  }

  function navLabel(): string {
    if (period === 'year') return String(refDate.getFullYear());
    if (period === 'month') return formatMonthYear(refDate, locale);
    if (period === 'week') return formatWeekRange(periodStats.start, periodStats.end, locale);
    return formatDate(refDate, locale);
  }

  function chartLabel(bucketStart: Date): string {
    if (period === 'year') return formatMonthShort(bucketStart, locale);
    if (period === 'week') return formatWeekdayNarrow(bucketStart, locale);
    return String(bucketStart.getDate());
  }

  const maxChartCount = Math.max(1, ...periodStats.chart.map((b) => b.count));
  const maxRatingCount = Math.max(1, ...stats.ratingDistribution);
  const categoryEntries = categoryOptions
    .map((option) => ({ ...option, count: categoryCounts?.[option.value] ?? 0 }))
    .filter((option) => option.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxCategoryCount = Math.max(1, ...categoryEntries.map((c) => c.count));

  return (
    <View style={{ flex: 1 }}>
      <BackHeader />
      <Screen scroll>
        <View style={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.md }}>
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <Text variant="display">{t('reading.statsTitle')}</Text>
              <Text variant="body" color="textMuted">
                {t('reading.statsSubtitle')}
              </Text>
            </View>
            <Pressable
              onPress={shareYear}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('reading.statsShare')}
              style={{ padding: theme.spacing.xs }}
            >
              <Ionicons name="share-social-outline" size={22} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <PeriodTabs period={period} onSelect={selectPeriod} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Pressable
                onPress={() => setRefDate((d) => shiftPeriod(period, d, -1))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('reading.statsPrevPeriod')}
                style={{ padding: theme.spacing.xs }}
              >
                <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
              </Pressable>

              <Pressable
                onPress={period === 'year' ? () => setYearPickerOpen(true) : period === 'month' ? () => setMonthPickerOpen(true) : undefined}
                disabled={period !== 'year' && period !== 'month'}
                accessibilityRole="button"
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: theme.colors.surfaceSunken,
                  borderRadius: theme.radius.pill,
                  paddingVertical: theme.spacing.sm,
                }}
              >
                <Ionicons name="calendar-outline" size={16} color={theme.colors.textMuted} />
                <Text variant="bodyStrong">{navLabel()}</Text>
                {period === 'year' || period === 'month' ? (
                  <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
                ) : null}
              </Pressable>

              <Pressable
                onPress={() => setRefDate((d) => shiftPeriod(period, d, 1))}
                disabled={isAtLatestPeriod}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('reading.statsNextPeriod')}
                style={{ padding: theme.spacing.xs }}
              >
                <Ionicons name="chevron-forward" size={20} color={isAtLatestPeriod ? theme.colors.textSubtle : theme.colors.text} />
              </Pressable>
            </View>
          </View>

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="display">{t('reading.statsBooksCount', { count: periodStats.booksFinished })}</Text>
                <Text variant="body" color="textMuted">
                  {t('reading.statsFinishedBooks')}
                </Text>
              </View>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="book" size={26} color={theme.colors.primaryOnSoft} />
              </View>
            </View>
          </Card>

          {period !== 'day' ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.xs, height: 100 }}>
                {periodStats.chart.map((bucket, index) => (
                  <View key={index} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <Text variant="micro" color="textMuted">
                      {bucket.count > 0 ? bucket.count : ''}
                    </Text>
                    <View
                      style={{
                        width: '100%',
                        height: Math.max(4, (bucket.count / maxChartCount) * 64),
                        borderRadius: theme.radius.sm,
                        backgroundColor: bucket.count > 0 ? theme.colors.primary : theme.colors.surfaceSunken,
                      }}
                    />
                    <Text variant="micro" color="textSubtle">
                      {chartLabel(bucket.bucketStart)}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <MiniTile icon="document-text-outline" value={String(periodStats.pagesRead)} label={t('reading.statsPagesTile')} />
            <MiniTile icon="library-outline" value={String(stats.finished.year)} label={t('reading.statsBooksYearTile')} />
          </View>

          {periodStats.finishedBooks.some((entry) => entry.rating != null) ? (
            <Pressable
              onPress={() => setBestReadsOpen(true)}
              accessibilityRole="button"
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radius.lg,
                  padding: theme.spacing.lg,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="star" size={20} color={theme.colors.textInverted} />
              <Text variant="bodyStrong" style={{ flex: 1, color: theme.colors.textInverted }}>
                {t('reading.statsBestReads')}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textInverted} />
            </Pressable>
          ) : null}

          {periodStats.longestBook || periodStats.shortestBook ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              {periodStats.longestBook ? (
                <BookHighlightCard
                  title={t('reading.statsLongestBookTitle')}
                  book={periodStats.longestBook}
                  onPress={() => router.push(`/book/${periodStats.longestBook!.id}`)}
                />
              ) : null}
              {periodStats.shortestBook ? (
                <BookHighlightCard
                  title={t('reading.statsShortestBookTitle')}
                  book={periodStats.shortestBook}
                  onPress={() => router.push(`/book/${periodStats.shortestBook!.id}`)}
                />
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title={t('reading.statsFinishedBooks')} icon="checkmark-done-outline" />
            {periodStats.finishedBooks.length === 0 ? (
              <EmptyState icon="checkmark-done-outline" title={t('reading.statsPeriodEmpty')} body={t('reading.statsPeriodEmptyBody')} />
            ) : (
              // Capped rather than left to grow with the period's whole shelf —
              // past ~3 rows this scrolls within its own bounded pane instead
              // of ballooning the page height for a big month/year.
              <ScrollView style={{ maxHeight: GRID_VISIBLE_ROWS * GRID_ROW_HEIGHT }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {periodStats.finishedBooks.map((entry) => (
                    <FinishedGridTile key={entry.id} entry={entry} onPress={() => router.push(`/book/${entry.id}`)} />
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title={t('reading.statsLibrary')} icon="library-outline" />
            <Card padded={false}>
              <StatRow icon="library-outline" label={t('reading.statsTotalBooks')} value={String(stats.totals.library)} />
              <Divider inset={theme.spacing.lg} />
              <StatRow icon="book-outline" label={t('reading.statInProgress')} value={String(stats.totals.reading)} />
              <Divider inset={theme.spacing.lg} />
              <StatRow icon="bookmark-outline" label={t('library.filter.want_to_read')} value={String(stats.totals.wantToRead)} />
              <Divider inset={theme.spacing.lg} />
              <StatRow icon="checkmark-done-outline" label={t('reading.statsFinishedBooks')} value={String(stats.totals.finished)} />
            </Card>
          </View>

          {stats.ratedCount > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <SectionHeader title={t('reading.statsRatingDistribution')} icon="star-outline" />
              <Card>
                <View style={{ gap: theme.spacing.sm }}>
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = stats.ratingDistribution[star - 1];
                    return (
                      <View key={star} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                        <View style={{ flexDirection: 'row', width: 44 }}>
                          <Text variant="caption" color="textMuted">
                            {star}
                          </Text>
                          <Ionicons name="star" size={12} color={theme.colors.accent} style={{ marginLeft: 2 }} />
                        </View>
                        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceSunken, overflow: 'hidden' }}>
                          <View
                            style={{
                              height: '100%',
                              width: `${(count / maxRatingCount) * 100}%`,
                              borderRadius: 4,
                              backgroundColor: theme.colors.primary,
                            }}
                          />
                        </View>
                        <Text variant="caption" color="textMuted" style={{ width: 20, textAlign: 'right' }}>
                          {count}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </View>
          ) : null}

          {categoryEntries.length > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <SectionHeader title={t('reading.statsCategories')} icon="pricetag-outline" />
              <Card>
                <View style={{ gap: theme.spacing.sm }}>
                  {categoryEntries.map((category) => (
                    <View key={category.value} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="caption" color="textMuted">
                          {category.label}
                        </Text>
                        <Text variant="caption" color="textMuted">
                          {category.count}
                        </Text>
                      </View>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceSunken, overflow: 'hidden' }}>
                        <View
                          style={{
                            height: '100%',
                            width: `${(category.count / maxCategoryCount) * 100}%`,
                            borderRadius: 4,
                            backgroundColor: theme.colors.accent,
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          ) : null}
        </View>
      </Screen>

      <YearPickerSheet
        visible={yearPickerOpen}
        onClose={() => setYearPickerOpen(false)}
        earliestYear={earliestYear}
        latestYear={now.getFullYear()}
        selectedYear={refDate.getFullYear()}
        onSelect={(year) => {
          setRefDate(new Date(year, refDate.getMonth(), 1));
          setYearPickerOpen(false);
        }}
      />

      <MonthPickerSheet
        visible={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        earliestYear={earliestYear}
        latestYear={now.getFullYear()}
        selectedDate={refDate}
        onSelect={(date) => {
          setRefDate(date);
          setMonthPickerOpen(false);
        }}
      />

      <BestReadsSheet visible={bestReadsOpen} onClose={() => setBestReadsOpen(false)} books={periodStats.finishedBooks} />
    </View>
  );
}

function PeriodTabs({ period, onSelect }: { period: PeriodType; onSelect: (period: PeriodType) => void }) {
  const theme = useTheme();
  const { t } = useI18n();

  const labels: Record<PeriodType, string> = {
    day: t('reading.statsTabDay'),
    week: t('reading.statsTabWeek'),
    month: t('reading.statsTabMonth'),
    year: t('reading.statsTabYear'),
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {PERIODS.map((p) => {
        const active = p === period;
        return (
          <Pressable key={p} onPress={() => onSelect(p)} accessibilityRole="button" accessibilityState={{ selected: active }}>
            <View style={{ gap: 6, paddingBottom: 6 }}>
              <Text variant={active ? 'bodyStrong' : 'body'} color={active ? 'text' : 'textMuted'}>
                {labels[p]}
              </Text>
              <View style={{ height: 2, backgroundColor: active ? theme.colors.text : 'transparent', borderRadius: 1 }} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function MiniTile({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  const theme = useTheme();

  return (
    <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 2,
        }}
      >
        <Ionicons name={icon} size={17} color={theme.colors.accent} />
      </View>
      <Text variant="bodyStrong">{value}</Text>
      <Text variant="micro" color="textMuted" align="center">
        {label}
      </Text>
    </Card>
  );
}

function BookHighlightCard({ title, book, onPress }: { title: string; book: BookCard; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Card onPress={onPress} style={{ flex: 1, gap: theme.spacing.sm }}>
      <Text variant="micro" color="textMuted">
        {title}
      </Text>
      <BookCover uri={book.coverUrl} title={book.title} width={56} radius={theme.radius.sm} />
      <View
        style={{
          alignSelf: 'flex-start',
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radius.pill,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <Text variant="micro" color="textMuted">
          {t('reading.statsPagesCount', { count: book.pages })}
        </Text>
      </View>
      <Text variant="label" numberOfLines={2}>
        {book.title}
      </Text>
      {book.authors.length > 0 ? (
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {formatAuthors(book.authors)}
        </Text>
      ) : null}
    </Card>
  );
}

function FinishedGridTile({ entry, onPress }: { entry: LibraryEntry; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ width: GRID_TILE_WIDTH }, pressed && { opacity: 0.6 }]}>
      <View>
        <BookCover uri={entry.cover_url} title={entry.title} width={GRID_TILE_WIDTH} radius={theme.radius.sm} />
        <View
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            backgroundColor: theme.colors.danger,
            borderRadius: theme.radius.sm,
            paddingHorizontal: 5,
            paddingVertical: 2,
          }}
        >
          <Text variant="micro" style={{ color: theme.colors.textInverted, textTransform: 'uppercase' }}>
            {t('reading.statsFinishedBadge')}
          </Text>
        </View>
      </View>
      <Text variant="caption" numberOfLines={2} style={{ marginTop: 4 }}>
        {entry.title}
      </Text>
    </Pressable>
  );
}

function YearPickerSheet({
  visible,
  onClose,
  earliestYear,
  latestYear,
  selectedYear,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  earliestYear: number;
  latestYear: number;
  selectedYear: number;
  onSelect: (year: number) => void;
}) {
  const { t } = useI18n();
  const theme = useTheme();

  const years: number[] = [];
  for (let y = latestYear; y >= earliestYear; y -= 1) years.push(y);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reading.statsPickYear')}>
      <View style={{ gap: theme.spacing.xs }}>
        {years.map((year) => (
          <Pressable
            key={year}
            onPress={() => onSelect(year)}
            accessibilityRole="button"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.md,
              },
              pressed && { backgroundColor: theme.colors.surfaceSunken },
            ]}
          >
            <Text variant="bodyStrong">{year}</Text>
            {year === selectedYear ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : null}
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

function MonthPickerSheet({
  visible,
  onClose,
  earliestYear,
  latestYear,
  selectedDate,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  earliestYear: number;
  latestYear: number;
  selectedDate: Date;
  onSelect: (date: Date) => void;
}) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const [browsedYear, setBrowsedYear] = useState(selectedDate.getFullYear());

  return (
    <Sheet
      key={`month-picker-${selectedDate.getFullYear()}-${selectedDate.getMonth()}`}
      visible={visible}
      onClose={onClose}
      title={t('reading.statsPickMonth')}
    >
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg }}>
          <Pressable
            onPress={() => setBrowsedYear((y) => Math.max(earliestYear, y - 1))}
            disabled={browsedYear <= earliestYear}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={browsedYear <= earliestYear ? theme.colors.textSubtle : theme.colors.text} />
          </Pressable>
          <Text variant="bodyStrong">{browsedYear}</Text>
          <Pressable onPress={() => setBrowsedYear((y) => Math.min(latestYear, y + 1))} disabled={browsedYear >= latestYear} hitSlop={8}>
            <Ionicons name="chevron-forward" size={20} color={browsedYear >= latestYear ? theme.colors.textSubtle : theme.colors.text} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {Array.from({ length: 12 }, (_, month) => {
            const isFuture = browsedYear === latestYear && month > new Date().getMonth();
            const isSelected = browsedYear === selectedDate.getFullYear() && month === selectedDate.getMonth();
            return (
              <Pressable
                key={month}
                onPress={() => onSelect(new Date(browsedYear, month, 1))}
                disabled={isFuture}
                style={({ pressed }) => [
                  {
                    width: '31%',
                    alignItems: 'center',
                    paddingVertical: theme.spacing.sm,
                    borderRadius: theme.radius.md,
                    backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceSunken,
                    opacity: isFuture ? 0.4 : 1,
                  },
                  pressed && !isFuture && { opacity: 0.8 },
                ]}
              >
                <Text variant="label" style={{ color: isSelected ? theme.colors.textInverted : theme.colors.text }}>
                  {formatMonthShort(new Date(browsedYear, month, 1), locale)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

function BestReadsSheet({ visible, onClose, books }: { visible: boolean; onClose: () => void; books: LibraryEntry[] }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const router = useRouter();

  const sorted = books.filter((entry) => entry.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reading.statsBestReads')}>
      <View style={{ gap: theme.spacing.sm }}>
        {sorted.map((entry) => (
          <Pressable
            key={entry.id}
            onPress={() => {
              onClose();
              router.push(`/book/${entry.id}`);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                borderRadius: theme.radius.md,
                padding: theme.spacing.sm,
              },
              pressed && { backgroundColor: theme.colors.surfaceSunken },
            ]}
          >
            <BookCover uri={entry.cover_url} title={entry.title} width={40} radius={theme.radius.sm} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {entry.title}
              </Text>
              {entry.date_finished ? (
                <Text variant="caption" color="textSubtle">
                  {formatDate(entry.date_finished, locale)}
                </Text>
              ) : null}
              {entry.rating ? <Rating value={entry.rating} readOnly size={14} /> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/** A left-aligned icon+label row with a right-aligned value — used for every
 *  numeric stat on this page (Library). */
function StatRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
        <Text variant="body" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>
      <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

