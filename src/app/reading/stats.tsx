import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';

import { BookCover } from '@/components/BookCover';
import {
  BackHeader,
  Button,
  Card,
  Divider,
  EmptyState,
  LoadingState,
  Rating,
  Screen,
  SectionHeader,
  Sheet,
  Text,
  TextField,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatAuthors, formatDate, formatMonthShort } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLibraryCategoryCounts } from '@/lib/queries/categories';
import { useLibrary } from '@/lib/queries/library';
import { useUpdateProfile } from '@/lib/queries/profile';
import { useReadingActivity } from '@/lib/queries/readingActivity';
import { useCategoryOptions } from '@/lib/queries/reference';
import { computeReadingStats, computeStreak, type BookRef } from '@/lib/readingStats';
import { useTheme } from '@/theme';
import type { LibraryEntry } from '@/types/database';

// FinishedBookRow's own approximate height (a 48-wide cover at COVER_ASPECT
// is 72 tall, plus the row's padding/border, plus the gap between rows) —
// used only to cap the finished-books list at roughly 10 rows before it
// scrolls within its own bounded pane. Approximate on purpose: real row
// height varies with title wrapping/rating, and the list still scrolls
// correctly either way, this just sets *roughly* where that starts.
const FINISHED_ROW_HEIGHT = 106;

/**
 * The full reading-stats page — was a bottom sheet with four numbers
 * (finished this week/month/year/all-time) before; now its own page with a
 * personal reading goal, a streak, library totals, a rating distribution,
 * a category breakdown, a monthly trend, a year-over-year comparison, a
 * shareable summary, and the finished shelf itself, tap-to-open.
 */
export default function ReadingStatsScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { profile } = useAuth();

  const { data: library, isPending } = useLibrary();
  const stats = useMemo(() => computeReadingStats(library ?? []), [library]);

  const { data: activityDates } = useReadingActivity();
  const streak = useMemo(() => computeStreak(activityDates ?? []), [activityDates]);

  const finishedBooks = useMemo(
    () =>
      (library ?? [])
        .filter((entry) => entry.reading_status === 'finished')
        .sort((a, b) => (b.date_finished ?? b.updated_at).localeCompare(a.date_finished ?? a.updated_at)),
    [library]
  );
  const finishedBookIds = useMemo(() => finishedBooks.map((entry) => entry.id), [finishedBooks]);
  const { data: categoryCounts } = useLibraryCategoryCounts(finishedBookIds);
  const categoryOptions = useCategoryOptions();

  const [goalOpen, setGoalOpen] = useState(false);

  function shareYear() {
    const year = new Date().getFullYear();
    const lines = [
      t('reading.shareHeader', { year }),
      t('reading.shareBooks', { count: stats.finished.year }),
      stats.pagesRead > 0 ? t('reading.sharePages', { count: stats.pagesRead }) : null,
      stats.topAuthor ? t('reading.shareAuthor', { name: stats.topAuthor.name }) : null,
      stats.avgRating != null ? t('reading.shareRating', { rating: stats.avgRating.toFixed(1) }) : null,
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

  const maxMonthly = Math.max(1, ...stats.monthly.map((m) => m.count));
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

          <GoalCard
            goal={profile?.reading_goal_books ?? null}
            finishedThisYear={stats.finished.year}
            onEdit={() => setGoalOpen(true)}
          />

          <StreakCard streak={streak} />

          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title={t('reading.statsPeriod')} icon="calendar-outline" />
            <Card padded={false}>
              <StatRow icon="today-outline" label={t('reading.statsWeek')} value={String(stats.finished.week)} />
              <Divider inset={theme.spacing.lg} />
              <StatRow icon="calendar-outline" label={t('reading.statsMonth')} value={String(stats.finished.month)} />
              <Divider inset={theme.spacing.lg} />
              <StatRow icon="calendar-number-outline" label={t('reading.statsYear')} value={String(stats.finished.year)} />
              <Divider inset={theme.spacing.lg} />
              <StatRow icon="time-outline" label={t('reading.statsLastYear')} value={String(stats.finished.lastYear)} />
              <Divider inset={theme.spacing.lg} />
              <StatRow icon="infinite-outline" label={t('reading.statsAllTime')} value={String(stats.finished.allTime)} />
            </Card>
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

          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title={t('reading.statsHabits')} icon="sparkles-outline" />
            <Card padded={false}>
              <StatRow
                icon="document-text-outline"
                label={t('reading.statsPagesRead')}
                value={stats.pagesRead > 0 ? stats.pagesRead.toLocaleString() : '—'}
              />
              <Divider inset={theme.spacing.lg} />
              <StatRow
                icon="trending-up-outline"
                label={t('reading.statsLongestBook')}
                value={stats.longestBook ? `${stats.longestBook.title} (${stats.longestBook.pages})` : '—'}
                book={stats.longestBook}
                onPress={(id) => router.push(`/book/${id}`)}
              />
              <Divider inset={theme.spacing.lg} />
              <StatRow
                icon="trending-down-outline"
                label={t('reading.statsShortestBook')}
                value={stats.shortestBook ? `${stats.shortestBook.title} (${stats.shortestBook.pages})` : '—'}
                book={stats.shortestBook}
                onPress={(id) => router.push(`/book/${id}`)}
              />
              <Divider inset={theme.spacing.lg} />
              <StatRow
                icon="flash-outline"
                label={t('reading.statsFastestFinish')}
                value={
                  stats.fastestFinish
                    ? `${stats.fastestFinish.title} (${t('reading.statsDays', { count: stats.fastestFinish.days })})`
                    : '—'
                }
                book={stats.fastestFinish}
                onPress={(id) => router.push(`/book/${id}`)}
              />
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

          {stats.totals.finished > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <SectionHeader title={t('reading.statsMonthlyTrend')} icon="trending-up-outline" />
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm, height: 100 }}>
                  {stats.monthly.map((month, index) => (
                    <View key={index} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                      <Text variant="caption" color="textMuted">
                        {month.count > 0 ? month.count : ''}
                      </Text>
                      <View
                        style={{
                          width: '100%',
                          height: Math.max(4, (month.count / maxMonthly) * 64),
                          borderRadius: theme.radius.sm,
                          backgroundColor: month.count > 0 ? theme.colors.primary : theme.colors.surfaceSunken,
                        }}
                      />
                      <Text variant="micro" color="textSubtle">
                        {formatMonthShort(month.monthStart, locale)}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          ) : null}

          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title={t('reading.statsFinishedBooks')} icon="checkmark-done-outline" />
            {finishedBooks.length === 0 ? (
              <EmptyState icon="checkmark-done-outline" title={t('reading.statsFinishedEmpty')} body={t('reading.statsFinishedEmptyBody')} />
            ) : (
              // Capped rather than left to grow with the whole library — past
              // ~10 books this scrolls within its own bounded pane instead of
              // ballooning the page height (and how far a scroll-to-top has
              // to travel) for someone with a large finished shelf.
              <ScrollView style={{ maxHeight: 10 * FINISHED_ROW_HEIGHT }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <View style={{ gap: theme.spacing.sm }}>
                  {finishedBooks.map((entry) => (
                    <FinishedBookRow key={entry.id} entry={entry} onPress={() => router.push(`/book/${entry.id}`)} />
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Screen>

      <GoalSheet
        key={`goal-${profile?.reading_goal_books ?? 'none'}`}
        visible={goalOpen}
        onClose={() => setGoalOpen(false)}
        currentGoal={profile?.reading_goal_books ?? null}
      />
    </View>
  );
}

/** A left-aligned icon+label row with a right-aligned value — used for every
 *  numeric stat on this page (Period, Library, Habits). Optionally pressable
 *  when it references a specific book (Habits' longest/shortest/fastest). */
function StatRow({
  icon,
  label,
  value,
  book,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  book?: BookRef | null;
  onPress?: (id: string) => void;
}) {
  const theme = useTheme();
  const pressable = Boolean(book && onPress);

  const content = (
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
      {pressable ? <Ionicons name="chevron-forward" size={16} color={theme.colors.textSubtle} /> : null}
    </View>
  );

  if (!pressable) return content;

  return (
    <Pressable onPress={() => onPress!(book!.id)} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  );
}

/** Progress toward profile.reading_goal_books, or a prompt to set one — both centered, not a left-icon/right-button row. */
function GoalCard({
  goal,
  finishedThisYear,
  onEdit,
}: {
  goal: number | null;
  finishedThisYear: number;
  onEdit: () => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  if (goal == null) {
    return (
      <Card>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="flag-outline" size={22} color={theme.colors.primaryOnSoft} />
          </View>
          <Text variant="bodyStrong" style={{ textAlign: 'center' }}>
            {t('reading.statsGoalPromptTitle')}
          </Text>
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            {t('reading.statsGoalPromptBody')}
          </Text>
          {/* Button sets alignSelf: 'flex-start' internally, which wins over
              this parent's alignItems — has to be overridden explicitly to
              actually center, same as wishlist.tsx's footer button. */}
          <Button title={t('reading.statsGoalSet')} variant="secondary" size="sm" onPress={onEdit} style={{ alignSelf: 'center' }} />
        </View>
      </Card>
    );
  }

  const percent = Math.max(0, Math.min(100, Math.round((finishedThisYear / goal) * 100)));
  const met = finishedThisYear >= goal;

  return (
    <Card>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.pill,
            backgroundColor: met ? theme.colors.successSoft : theme.colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="flag" size={22} color={met ? theme.colors.success : theme.colors.primaryOnSoft} />
        </View>
        <Text variant="bodyStrong">{t('reading.statsGoalTitle', { year: new Date().getFullYear() })}</Text>
        <Text variant="caption" color="textMuted">
          {t('reading.statsGoalProgress', { done: finishedThisYear, goal })}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceSunken, overflow: 'hidden', marginTop: theme.spacing.sm }}>
        <View
          style={{
            height: '100%',
            width: `${percent}%`,
            borderRadius: 4,
            backgroundColor: met ? theme.colors.success : theme.colors.primary,
          }}
        />
      </View>
      {met ? (
        <Text variant="caption" style={{ color: theme.colors.success, textAlign: 'center', marginTop: 6 }}>
          {t('reading.statsGoalMet')}
        </Text>
      ) : null}
      <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: theme.spacing.sm }}>
        <Text variant="caption" color="primary">
          {t('common.edit')}
        </Text>
      </Pressable>
    </Card>
  );
}

function GoalSheet({ visible, onClose, currentGoal }: { visible: boolean; onClose: () => void; currentGoal: number | null }) {
  const theme = useTheme();
  const { t } = useI18n();
  const updateProfile = useUpdateProfile();
  const [input, setInput] = useState(currentGoal != null ? String(currentGoal) : '');

  const parsed = Number(input);
  const canSave = Number.isFinite(parsed) && parsed > 0;

  function save() {
    if (!canSave) return;
    updateProfile.mutate({ reading_goal_books: Math.round(parsed) }, { onSuccess: onClose });
  }

  function clear() {
    updateProfile.mutate({ reading_goal_books: null }, { onSuccess: onClose });
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reading.statsGoalSheetTitle')}>
      <View style={{ gap: theme.spacing.lg }}>
        <TextField
          label={t('reading.statsGoalSheetLabel')}
          value={input}
          onChangeText={setInput}
          keyboardType="number-pad"
          inputMode="numeric"
        />
        <Button title={t('common.save')} fullWidth loading={updateProfile.isPending} disabled={!canSave} onPress={save} />
        {currentGoal != null ? <Button title={t('reading.statsGoalClear')} variant="ghost" fullWidth onPress={clear} /> : null}
      </View>
    </Sheet>
  );
}

function StreakCard({ streak }: { streak: { current: number; longest: number } }) {
  const theme = useTheme();
  const { t } = useI18n();

  if (streak.current === 0 && streak.longest === 0) return null;

  return (
    <Card>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="flame" size={22} color={theme.colors.accent} />
        </View>
        <Text variant="bodyStrong">{t('reading.statsStreakCurrent', { count: streak.current })}</Text>
        <Text variant="caption" color="textMuted">
          {t('reading.statsStreakLongest', { count: streak.longest })}
        </Text>
      </View>
    </Card>
  );
}

function FinishedBookRow({ entry, onPress }: { entry: LibraryEntry; onPress: () => void }) {
  const theme = useTheme();
  const { t, locale } = useI18n();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <BookCover uri={entry.cover_url} title={entry.title} width={48} radius={theme.radius.sm} />

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {entry.title}
        </Text>
        {entry.authors.length > 0 ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {formatAuthors(entry.authors)}
          </Text>
        ) : null}
        {entry.date_finished ? (
          <Text variant="caption" color="textSubtle">
            {t('book.finishedOn', { date: formatDate(entry.date_finished, locale) })}
          </Text>
        ) : null}
        {entry.rating ? (
          <View style={{ marginTop: 2 }}>
            <Rating value={entry.rating} readOnly size={14} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
