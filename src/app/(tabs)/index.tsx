import { Ionicons } from '@expo/vector-icons';
import { isWithinInterval, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCover } from '@/components/BookCover';
import { Button, Card, EmptyState, LoadingState, Screen, Sheet, Text, TextField } from '@/components/ui';
import { setPendingAddQuery } from '@/features/add/pendingAddQuery';
import { goToTab } from '@/features/tabs/activeTab';
import { formatAuthors, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { selectLibrary, useLibrary, useUpdateReadingProgress, useUpdateUserBook } from '@/lib/queries/library';
import { useTheme } from '@/theme';
import type { LibraryEntry } from '@/types/database';

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
  const insets = useSafeAreaInsets();

  const { data: library, isPending } = useLibrary();
  const [activeEntry, setActiveEntry] = useState<LibraryEntry | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const inProgress = useMemo(() => (library ?? []).filter((entry) => entry.reading_status === 'reading'), [library]);

  // Books that match the search and aren't already being read — those are
  // what the in-progress list above is for. "Not found" here means "not in
  // your library yet," same as Library's own search: there's nothing to
  // start reading for a catalog book nobody owns a copy of.
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    return selectLibrary(library ?? [], { filter: 'all', sort: 'title', search }).filter(
      (entry) => entry.reading_status !== 'reading'
    );
  }, [library, search]);
  const searching = search.trim().length > 0;

  if (isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg, paddingTop: insets.top + theme.spacing.md, paddingBottom: theme.spacing.lg }}>
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

        {searching ? (
          searchResults.length === 0 ? (
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
          ) : (
            searchResults.map((entry) => <StartReadingRow key={entry.id} entry={entry} onStarted={() => setSearch('')} />)
          )
        ) : inProgress.length === 0 ? (
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
  const percent = useMemo(() => effectivePercent(entry), [entry]);
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
          {percent != null ? <ProgressBar percent={percent} theme={theme} /> : null}
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

/**
 * A search match not currently being read — one tap starts it, same
 * date_started-if-not-already-set rule book/[id].tsx's changeStatus uses.
 * onStarted clears the search afterward, which is "back to the tracker's
 * default page": the search UI drops away and the in-progress list (now
 * including this book) is what's showing.
 */
function StartReadingRow({ entry, onStarted }: { entry: LibraryEntry; onStarted: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const updateProgress = useUpdateReadingProgress();

  // Fire-and-forget, same as the in-progress list's own "Finish book"
  // button above — clearing the search happens immediately on tap rather
  // than waiting on the mutation to resolve, so "back to the tracker's
  // default page" isn't held up by (or silently stuck on) a network
  // round-trip.
  function start() {
    updateProgress.mutate({
      userBookId: entry.id,
      patch: { reading_status: 'reading', date_started: entry.date_started ?? new Date().toISOString().slice(0, 10) },
    });
    onStarted();
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
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
        </View>

        <Button title={t('reading.startReading')} variant="secondary" size="sm" loading={updateProgress.isPending} onPress={start} />
      </View>
    </Card>
  );
}

/** The book's page count if the catalog has it, else this copy's own fallback figure. */
function effectiveTotal(entry: LibraryEntry): number | null {
  return entry.page_count ?? entry.total_pages;
}

/** Progress as a 0-100 whole number, page-based when a total is known, else the legacy percent field. */
function effectivePercent(entry: LibraryEntry): number | null {
  const total = effectiveTotal(entry);
  if (total && entry.current_page) return Math.round((entry.current_page / total) * 100);
  return entry.progress_percent;
}

function describeProgress(entry: LibraryEntry, t: ReturnType<typeof useI18n>['t']): string {
  const total = effectiveTotal(entry);
  if (total && entry.current_page) {
    const percent = Math.round((entry.current_page / total) * 100);
    return t('book.progressPageOf', { page: entry.current_page, total, percent });
  }
  if (entry.progress_percent != null) return t('book.progressPercent', { percent: entry.progress_percent });
  return t('book.progressEmpty');
}

function describePace(entry: LibraryEntry, t: ReturnType<typeof useI18n>['t']): string | null {
  if (!entry.date_started) return null;
  const percent = effectivePercent(entry);
  if (!percent) return null;

  const daysElapsed = Math.floor((Date.now() - new Date(entry.date_started).getTime()) / 86_400_000);
  if (daysElapsed < 1) return null;

  const daysLeft = Math.max(0, Math.round(daysElapsed / (percent / 100) - daysElapsed));
  return daysLeft > 0 ? t('book.progressEstimate', { days: daysLeft }) : null;
}

/** A thin fill bar showing progress toward the effective total — full once the reader hits the last page. */
function ProgressBar({ percent, theme }: { percent: number; theme: ReturnType<typeof useTheme> }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.border,
        overflow: 'hidden',
        marginTop: 6,
      }}
    >
      <View style={{ height: '100%', width: `${clamped}%`, borderRadius: 3, backgroundColor: theme.colors.primary }} />
    </View>
  );
}

function ProgressSheet({ visible, onClose, entry }: { visible: boolean; onClose: () => void; entry: LibraryEntry | null }) {
  const theme = useTheme();
  const { t } = useI18n();
  const updateProgress = useUpdateReadingProgress();
  const updateUserBook = useUpdateUserBook();

  return (
    <Sheet visible={visible} onClose={onClose} title={t('reading.updateProgress')}>
      {entry ? (
        <ProgressSheetForm
          key={`${entry.id}-${entry.updated_at}`}
          entry={entry}
          onSave={async ({ totalPages, currentPage }) => {
            // A newly-entered total goes on the copy (user_books) — shared
            // with the household, unlike current_page below, which is this
            // reader's own reading_progress row.
            await Promise.all([
              updateProgress.mutateAsync({ userBookId: entry.id, patch: { current_page: currentPage, progress_percent: null } }),
              totalPages != null ? updateUserBook.mutateAsync({ id: entry.id, patch: { total_pages: totalPages } }) : Promise.resolve(),
            ]);
            onClose();
          }}
          saving={updateProgress.isPending || updateUserBook.isPending}
          theme={theme}
          t={t}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * Progress only — no reading-status chips. Status changes now live on the
 * row itself (the "Finish book" button). Always page-based: when neither the
 * catalog's page_count nor this copy's own total_pages fallback is known yet,
 * asks for the total once (reusing book.pages — no new copy) alongside the
 * current page, saving both together.
 */
function ProgressSheetForm({
  entry,
  onSave,
  saving,
  theme,
  t,
}: {
  entry: LibraryEntry;
  onSave: (input: { totalPages: number | null; currentPage: number | null }) => void;
  saving: boolean;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const knownTotal = effectiveTotal(entry);
  const [totalPagesInput, setTotalPagesInput] = useState('');
  const [page, setPage] = useState(entry.current_page?.toString() ?? '');

  const enteredTotal = knownTotal ?? (Number.isFinite(Number(totalPagesInput)) ? Number(totalPagesInput) : 0);
  const canSave = enteredTotal > 0;

  function save() {
    if (enteredTotal <= 0) return;
    const parsedPage = Number(page);
    const clamped = Number.isFinite(parsedPage) ? Math.min(Math.max(parsedPage, 0), enteredTotal) : 0;
    onSave({
      totalPages: knownTotal ? null : enteredTotal,
      currentPage: clamped > 0 ? clamped : null,
    });
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {!knownTotal ? (
        <TextField
          label={t('book.pages')}
          value={totalPagesInput}
          onChangeText={setTotalPagesInput}
          keyboardType="number-pad"
          inputMode="numeric"
        />
      ) : null}

      <TextField
        label={t('book.currentPage')}
        hint={enteredTotal > 0 ? t('book.currentPageHint', { total: enteredTotal }) : undefined}
        value={page}
        onChangeText={setPage}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={enteredTotal > 0 ? String(enteredTotal).length : undefined}
      />

      <Button title={t('common.save')} fullWidth loading={saving} disabled={!canSave} onPress={save} />
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
