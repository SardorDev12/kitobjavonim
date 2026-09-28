import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { BookCover } from '@/components/BookCover';
import { BackHeader, Card, Divider, EmptyState, LoadingState, Rating, Screen, SectionHeader, Text } from '@/components/ui';
import { formatAuthors, formatDate, formatMonthShort } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLibrary } from '@/lib/queries/library';
import { computeReadingStats } from '@/lib/readingStats';
import { useTheme } from '@/theme';
import type { LibraryEntry } from '@/types/database';

/**
 * The full reading-stats page — was a bottom sheet with four numbers
 * (week/month/year/all-time finished) before; now its own page, since
 * there's a lot more worth showing than fits in a sheet: library totals,
 * pages read, pace, a monthly trend, and the finished shelf itself.
 */
export default function ReadingStatsScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();

  const { data: library, isPending } = useLibrary();
  const stats = useMemo(() => computeReadingStats(library ?? []), [library]);

  const finishedBooks = useMemo(
    () =>
      (library ?? [])
        .filter((entry) => entry.reading_status === 'finished')
        .sort((a, b) => (b.date_finished ?? b.updated_at).localeCompare(a.date_finished ?? a.updated_at)),
    [library]
  );

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

  return (
    <View style={{ flex: 1 }}>
      <BackHeader />
      <Screen scroll>
        <View style={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="display">{t('reading.statsTitle')}</Text>
            <Text variant="body" color="textMuted">
              {t('reading.statsSubtitle')}
            </Text>
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title={t('reading.statsPeriod')} />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
                <StatTile label={t('reading.statsWeek')} value={stats.finished.week} />
                <StatTile label={t('reading.statsMonth')} value={stats.finished.month} />
                <StatTile label={t('reading.statsYear')} value={stats.finished.year} />
                <StatTile label={t('reading.statsAllTime')} value={stats.finished.allTime} />
              </View>
            </Card>
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title={t('reading.statsLibrary')} />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
                <StatTile label={t('reading.statsTotalBooks')} value={stats.totals.library} />
                <StatTile label={t('reading.statInProgress')} value={stats.totals.reading} />
                <StatTile label={t('library.filter.want_to_read')} value={stats.totals.wantToRead} />
                <StatTile label={t('reading.statsFinishedBooks')} value={stats.totals.finished} />
              </View>
            </Card>
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <SectionHeader title={t('reading.statsHabits')} />
            <Card padded={false}>
              <HabitRow
                icon="document-text-outline"
                label={t('reading.statsPagesRead')}
                value={stats.pagesRead > 0 ? stats.pagesRead.toLocaleString() : '—'}
              />
              <Divider inset={theme.spacing.lg} />
              <HabitRow
                icon="star-outline"
                label={t('reading.statsAvgRating')}
                value={stats.avgRating != null ? `${stats.avgRating.toFixed(1)} / 5` : '—'}
              />
              <Divider inset={theme.spacing.lg} />
              <HabitRow
                icon="time-outline"
                label={t('reading.statsAvgPace')}
                value={stats.avgDaysToFinish != null ? t('reading.statsDays', { count: stats.avgDaysToFinish }) : '—'}
              />
              <Divider inset={theme.spacing.lg} />
              <HabitRow
                icon="person-outline"
                label={t('reading.statsTopAuthor')}
                value={stats.topAuthor ? `${stats.topAuthor.name} (${stats.topAuthor.count})` : '—'}
              />
            </Card>
          </View>

          {stats.totals.finished > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <SectionHeader title={t('reading.statsMonthlyTrend')} />
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
            <SectionHeader title={t('reading.statsFinishedBooks')} />
            {finishedBooks.length === 0 ? (
              <EmptyState icon="checkmark-done-outline" title={t('reading.statsFinishedEmpty')} body={t('reading.statsFinishedEmptyBody')} />
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                {finishedBooks.map((entry) => (
                  <FinishedBookRow key={entry.id} entry={entry} onPress={() => router.push(`/book/${entry.id}`)} />
                ))}
              </View>
            )}
          </View>
        </View>
      </Screen>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ width: '45%', gap: 2 }}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

function HabitRow({
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
        <Ionicons name={icon} size={18} color={theme.colors.textMuted} />
        <Text variant="body" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>
      <Text variant="bodyStrong">{value}</Text>
    </View>
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
