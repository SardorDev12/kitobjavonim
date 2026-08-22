import { Ionicons } from '@expo/vector-icons';
import { isWithinInterval, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BookCover } from '@/components/BookCover';
import { Button, Card, Chip, EmptyState, LoadingState, Screen, Sheet, Text, TextField } from '@/components/ui';
import { formatAuthors, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLibrary, useUpdateReadingProgress, type UpdateReadingProgressInput } from '@/lib/queries/library';
import { useTheme } from '@/theme';
import type { LibraryEntry } from '@/types/database';

const PERCENT_OPTIONS = [25, 50, 75, 100];

/**
 * Books currently being read, with progress/pace and a way to update them —
 * its own tab rather than spread across each book's own detail page, since
 * reading state is per-person (0020_reading_progress.sql) and this is the
 * one place to manage it across every in-progress book at once.
 *
 * No new query — reuses useLibrary() (already loads the whole library into
 * cache) filtered client-side, the same "small enough to hold in cache"
 * reasoning useLibrary() itself is built on.
 */
export default function ReadingTrackerScreen() {
  const theme = useTheme();
  const { t } = useI18n();

  const { data: library, isPending } = useLibrary();
  const [activeEntry, setActiveEntry] = useState<LibraryEntry | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const inProgress = useMemo(() => (library ?? []).filter((entry) => entry.reading_status === 'reading'), [library]);

  if (isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ gap: theme.spacing.xs, flex: 1 }}>
            <Text variant="display">{t('reading.title')}</Text>
            <Text variant="body" color="textMuted">
              {t('reading.subtitle')}
            </Text>
          </View>
          <Pressable
            onPress={() => setStatsOpen(true)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('reading.statsTitle')}
            style={{ padding: theme.spacing.xs }}
          >
            <Ionicons name="stats-chart-outline" size={22} color={theme.colors.text} />
          </Pressable>
        </View>

        {inProgress.length === 0 ? (
          <EmptyState icon="book-outline" title={t('reading.empty')} body={t('reading.emptyBody')} />
        ) : (
          inProgress.map((entry) => <ReadingRow key={entry.id} entry={entry} onUpdate={() => setActiveEntry(entry)} />)
        )}
      </View>

      <ProgressSheet visible={activeEntry !== null} onClose={() => setActiveEntry(null)} entry={activeEntry} />
      <StatsSheet visible={statsOpen} onClose={() => setStatsOpen(false)} library={library ?? []} />
    </Screen>
  );
}

function ReadingRow({ entry, onUpdate }: { entry: LibraryEntry; onUpdate: () => void }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const updateProgress = useUpdateReadingProgress();

  const progressLabel = useMemo(() => describeProgress(entry, t), [entry, t]);
  const paceEstimate = useMemo(() => describePace(entry, t), [entry, t]);

  function finish() {
    updateProgress.mutate({
      userBookId: entry.id,
      patch: { reading_status: 'finished', date_finished: entry.date_finished ?? new Date().toISOString().slice(0, 10) },
    });
  }

  return (
    <Card>
      <View style={[{ flexDirection: 'row', gap: theme.spacing.md }]}>
        <BookCover uri={entry.cover_url} title={entry.title} width={56} radius={theme.radius.sm} />

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {entry.title}
          </Text>
          {entry.authors.length > 0 ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {formatAuthors(entry.authors)}
            </Text>
          ) : null}

          <Text variant="body" style={{ marginTop: 4 }}>
            {progressLabel}
          </Text>
          {entry.date_started ? (
            <Text variant="caption" color="textSubtle">
              {t('book.startedOn', { date: formatDate(entry.date_started, locale) })}
            </Text>
          ) : null}
          {paceEstimate ? (
            <Text variant="caption" color="textSubtle">
              {paceEstimate}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <Button title={t('reading.updateProgress')} variant="secondary" size="sm" onPress={onUpdate} style={{ flex: 1 }} />
        <Button
          title={t('reading.finishBook')}
          variant="secondary"
          size="sm"
          loading={updateProgress.isPending}
          onPress={finish}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}

function describeProgress(entry: LibraryEntry, t: ReturnType<typeof useI18n>['t']): string {
  if (entry.page_count && entry.current_page) {
    const percent = Math.round((entry.current_page / entry.page_count) * 100);
    return t('book.progressPageOf', { page: entry.current_page, total: entry.page_count, percent });
  }
  if (entry.progress_percent != null) return t('book.progressPercent', { percent: entry.progress_percent });
  return t('book.progressEmpty');
}

function describePace(entry: LibraryEntry, t: ReturnType<typeof useI18n>['t']): string | null {
  if (!entry.date_started) return null;
  const percent = entry.page_count && entry.current_page ? (entry.current_page / entry.page_count) * 100 : entry.progress_percent;
  if (!percent) return null;

  const daysElapsed = Math.floor((Date.now() - new Date(entry.date_started).getTime()) / 86_400_000);
  if (daysElapsed < 1) return null;

  const daysLeft = Math.max(0, Math.round(daysElapsed / (percent / 100) - daysElapsed));
  return daysLeft > 0 ? t('book.progressEstimate', { days: daysLeft }) : null;
}

function ProgressSheet({ visible, onClose, entry }: { visible: boolean; onClose: () => void; entry: LibraryEntry | null }) {
  const theme = useTheme();
  const { t } = useI18n();
  const updateProgress = useUpdateReadingProgress();

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reading.updateProgress')}>
      {entry ? (
        <ProgressSheetForm
          key={`${entry.id}-${entry.updated_at}`}
          entry={entry}
          onSave={async (patch) => {
            await updateProgress.mutateAsync({ userBookId: entry.id, patch });
            onClose();
          }}
          saving={updateProgress.isPending}
          theme={theme}
          t={t}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * Progress only — no reading-status chips. Status changes now live on the
 * row itself (the "Finish book" button); this sheet's one job is
 * current_page/progress_percent.
 */
function ProgressSheetForm({
  entry,
  onSave,
  saving,
  theme,
  t,
}: {
  entry: LibraryEntry;
  onSave: (patch: UpdateReadingProgressInput['patch']) => void;
  saving: boolean;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const [page, setPage] = useState(entry.current_page?.toString() ?? '');
  const [percent, setPercent] = useState<number | null>(entry.progress_percent);

  function save() {
    if (entry.page_count) {
      const parsed = Number(page);
      const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), entry.page_count) : 0;
      onSave({ current_page: clamped > 0 ? clamped : null, progress_percent: null });
    } else {
      onSave({ current_page: null, progress_percent: percent });
    }
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {entry.page_count ? (
        <TextField
          label={t('book.currentPage')}
          hint={t('book.currentPageHint', { total: entry.page_count })}
          value={page}
          onChangeText={setPage}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={String(entry.page_count).length}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color="textMuted">
            {t('book.progress')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PERCENT_OPTIONS.map((option) => (
              <Chip key={option} label={`${option}%`} selected={percent === option} onPress={() => setPercent(option)} />
            ))}
          </View>
        </View>
      )}

      <Button title={t('common.save')} fullWidth loading={saving} onPress={save} />
    </View>
  );
}

/**
 * Books finished this week/month/year, and all-time — computed client-side
 * from the already-cached library rather than a new query, same reasoning
 * as the in-progress list above.
 */
function StatsSheet({ visible, onClose, library }: { visible: boolean; onClose: () => void; library: LibraryEntry[] }) {
  const theme = useTheme();
  const { t } = useI18n();

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const yearStart = startOfYear(now);

    const finishedDates = library
      .filter((entry) => entry.reading_status === 'finished' && entry.date_finished)
      .map((entry) => new Date(entry.date_finished!));

    const count = (start: Date) => finishedDates.filter((date) => isWithinInterval(date, { start, end: now })).length;

    return {
      week: count(weekStart),
      month: count(monthStart),
      year: count(yearStart),
      allTime: finishedDates.length,
    };
  }, [library]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reading.statsTitle')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
        <StatTile label={t('reading.statsWeek')} value={stats.week} />
        <StatTile label={t('reading.statsMonth')} value={stats.month} />
        <StatTile label={t('reading.statsYear')} value={stats.year} />
        <StatTile label={t('reading.statsAllTime')} value={stats.allTime} />
      </View>
    </Sheet>
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
