import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BookCover } from '@/components/BookCover';
import { Button, Card, Chip, EmptyState, LoadingState, Screen, Sheet, Text, TextField } from '@/components/ui';
import { formatAuthors, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLibrary, useUpdateReadingProgress, type UpdateReadingProgressInput } from '@/lib/queries/library';
import { useTheme } from '@/theme';
import { READING_STATUSES, type LibraryEntry, type ReadingStatus } from '@/types/database';

const PERCENT_OPTIONS = [25, 50, 75, 100];

/**
 * Books currently being read, with progress/pace and a way to update them —
 * a dedicated screen rather than spread across each book's own detail page,
 * since reading state is now per-person (0020_reading_progress.sql) and
 * this is meant to be the one place to manage it across every in-progress
 * book at once.
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
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="display">{t('reading.title')}</Text>
          <Text variant="body" color="textMuted">
            {t('reading.subtitle')}
          </Text>
        </View>

        {inProgress.length === 0 ? (
          <EmptyState icon="book-outline" title={t('reading.empty')} body={t('reading.emptyBody')} />
        ) : (
          inProgress.map((entry) => <ReadingRow key={entry.id} entry={entry} onUpdate={() => setActiveEntry(entry)} />)
        )}
      </View>

      <ProgressSheet visible={activeEntry !== null} onClose={() => setActiveEntry(null)} entry={activeEntry} />
    </Screen>
  );
}

function ReadingRow({ entry, onUpdate }: { entry: LibraryEntry; onUpdate: () => void }) {
  const theme = useTheme();
  const { t, locale } = useI18n();

  const progressLabel = useMemo(() => describeProgress(entry, t), [entry, t]);
  const paceEstimate = useMemo(() => describePace(entry, t), [entry, t]);

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

      <Button
        title={t('common.edit')}
        variant="secondary"
        size="sm"
        fullWidth
        onPress={onUpdate}
        style={{ marginTop: theme.spacing.md }}
      />
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
    <Sheet visible={visible} onClose={onClose} title={t('book.progress')}>
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
  const [status, setStatus] = useState<ReadingStatus>(entry.reading_status);
  const [page, setPage] = useState(entry.current_page?.toString() ?? '');
  const [percent, setPercent] = useState<number | null>(entry.progress_percent);

  // Same date_started/date_finished rules as book/[id].tsx's changeStatus —
  // duplicated rather than shared, matching this codebase's convention of
  // small per-screen logic over a shared abstraction for a few lines.
  function save() {
    const progress: UpdateReadingProgressInput['patch'] = entry.page_count
      ? (() => {
          const parsed = Number(page);
          const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), entry.page_count!) : 0;
          return { current_page: clamped > 0 ? clamped : null, progress_percent: null };
        })()
      : { current_page: null, progress_percent: percent };

    const patch: UpdateReadingProgressInput['patch'] = { reading_status: status, ...progress };

    if (status === 'finished' && !entry.date_finished) {
      patch.date_finished = new Date().toISOString().slice(0, 10);
    }

    if (status === 'reading' && !entry.date_started) {
      patch.date_started = new Date().toISOString().slice(0, 10);
    }

    if (status === 'want_to_read' && (entry.reading_status === 'reading' || entry.reading_status === 'finished')) {
      patch.date_started = null;
      patch.current_page = null;
      patch.progress_percent = null;
    }

    onSave(patch);
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" color="textMuted">
          {t('book.readingStatusLabel')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {READING_STATUSES.map((option) => (
            <Chip key={option} label={t(`status.${option}`)} selected={status === option} onPress={() => setStatus(option)} />
          ))}
        </View>
      </View>

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
