import { Ionicons } from '@expo/vector-icons';
import { isWithinInterval, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCover } from '@/components/BookCover';
import { Button, Card, EmptyState, LoadingState, Sheet, Text, TextField } from '@/components/ui';
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

  // date_started rather than updated_at: it's always set the moment a copy
  // enters 'reading' (changeStatus in book/[id].tsx, start()/reread() below)
  // and, unlike updated_at (which only reflects user_books changes), it
  // moves whenever a reader actually picks a book back up — so the freshest
  // date_started is a reliable "what am I reading right now" signal.
  const inProgress = useMemo(
    () =>
      (library ?? [])
        .filter((entry) => entry.reading_status === 'reading')
        .sort((a, b) => (b.date_started ?? '').localeCompare(a.date_started ?? '')),
    [library]
  );
  const [heroEntry, ...restInProgress] = inProgress;

  const finishedStats = useMemo(() => computeFinishedStats(library ?? []), [library]);

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
      <View style={[styles.fill, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
        <LoadingState />
      </View>
    );
  }

  // Title/stats icon/stat strip/search stay as a plain sibling above the
  // FlatList below, the same shape Library's own screen already uses (and
  // ships fine on real devices) — not a ScrollView + separate header prop,
  // which measured 0 height on at least one real Android device.
  return (
    <View style={[styles.fill, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={{ gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }}>
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

        {inProgress.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <StatChip icon="book-outline" count={inProgress.length} label={t('reading.statInProgress')} theme={theme} />
            {finishedStats.month > 0 ? (
              <>
                <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: theme.colors.border }} />
                <StatChip
                  icon="checkmark-circle-outline"
                  count={finishedStats.month}
                  label={t('reading.statFinishedMonth')}
                  theme={theme}
                />
              </>
            ) : null}
          </View>
        ) : null}

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

      {searching ? (
        <FlatList
          data={searchResults}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => <StartReadingRow entry={item} onStarted={() => setSearch('')} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            searchResults.length === 0 && styles.fill,
            { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing['2xl'], gap: theme.spacing.md },
          ]}
          ListEmptyComponent={
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
          }
        />
      ) : (
        <FlatList
          data={restInProgress}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => <ReadingRow entry={item} onUpdate={() => setActiveEntry(item)} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            inProgress.length === 0 && styles.fill,
            { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing['2xl'], gap: theme.spacing.lg },
          ]}
          ListHeaderComponent={
            heroEntry ? (
              <View style={{ gap: theme.spacing.lg }}>
                <SectionLabel icon="book" label={t('reading.continueReading')} tone="accent" theme={theme} />
                <HeroReadingCard entry={heroEntry} onUpdate={() => setActiveEntry(heroEntry)} />
                {restInProgress.length > 0 ? (
                  <SectionLabel label={t('reading.alsoReading')} tone="muted" theme={theme} />
                ) : null}
              </View>
            ) : null
          }
          ListEmptyComponent={
            inProgress.length === 0 ? (
              <EmptyState icon="book-outline" title={t('reading.empty')} body={t('reading.emptyBody')} />
            ) : null
          }
        />
      )}

      <ProgressSheet visible={activeEntry !== null} onClose={() => setActiveEntry(null)} entry={activeEntry} />
      <StatsSheet visible={statsOpen} onClose={() => setStatsOpen(false)} stats={finishedStats} />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, flexGrow: 1 } });

function StatChip({
  icon,
  count,
  label,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  label: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name={icon} size={14} color={theme.colors.textMuted} />
      <Text variant="caption" color="textMuted">
        <Text variant="label" style={{ fontWeight: '700' }}>
          {count}
        </Text>{' '}
        {label}
      </Text>
    </View>
  );
}

/** A small uppercase label above a group of cards — an open-book icon marks the accent-toned one. */
function SectionLabel({
  icon,
  label,
  tone,
  theme,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: 'accent' | 'muted';
  theme: ReturnType<typeof useTheme>;
}) {
  const color = tone === 'accent' ? theme.colors.primary : theme.colors.textSubtle;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <Ionicons name={icon} size={13} color={color} /> : null}
      <Text variant="micro" style={{ color, letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/** The most recently started in-progress book, enlarged with a thicker progress bar and full-width actions. */
function HeroReadingCard({ entry, onUpdate }: { entry: LibraryEntry; onUpdate: () => void }) {
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
    <Card style={theme.shadow.card}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <BookCover uri={entry.cover_url} title={entry.title} width={84} radius={theme.radius.sm} />

        <View style={{ flex: 1, gap: 2, paddingTop: 2 }}>
          <Text variant="heading" numberOfLines={2}>
            {entry.title}
          </Text>
          {entry.authors.length > 0 ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {formatAuthors(entry.authors)}
            </Text>
          ) : null}

          <Text variant="body" style={{ marginTop: 6 }}>
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

      {percent != null ? <ProgressBar percent={percent} theme={theme} size="lg" /> : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <Button title={t('reading.updateProgress')} variant="tint" onPress={onUpdate} style={{ flex: 1 }} />
        <Button
          title={t('reading.finishBook')}
          variant="secondary"
          loading={updateProgress.isPending}
          onPress={finish}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
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
    <Card style={theme.shadow.card}>
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
    if (entry.reading_status === 'finished') {
      const message = t('reading.rereadBody', { title: entry.title });
      if (Platform.OS === 'web') {
        if (globalThis.confirm(message)) reread();
        return;
      }
      Alert.alert(t('reading.rereadTitle'), message, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('reading.rereadConfirm'), onPress: reread },
      ]);
      return;
    }

    updateProgress.mutate({
      userBookId: entry.id,
      patch: { reading_status: 'reading', date_started: entry.date_started ?? new Date().toISOString().slice(0, 10) },
    });
    onStarted();
  }

  // A fresh read, not a resumed one: date_started resets to today and
  // current_page/progress_percent are cleared so the progress bar doesn't
  // start out looking nearly done. rating/review/date_finished must also go
  // — the review_requires_finished check constraint (0020_reading_progress.sql)
  // rejects any of them staying set once reading_status isn't 'finished',
  // the same rule book/[id].tsx's changeStatus already follows when leaving
  // "finished" for any other status.
  function reread() {
    updateProgress.mutate({
      userBookId: entry.id,
      patch: {
        reading_status: 'reading',
        date_started: new Date().toISOString().slice(0, 10),
        date_finished: null,
        current_page: null,
        progress_percent: null,
        rating: null,
        review: null,
      },
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

/**
 * A fill bar showing progress toward the effective total — full once the reader
 * hits the last page. The hero card uses the thicker `lg` size with a trailing
 * percent pill; compact rows use the default thin bar.
 */
function ProgressBar({
  percent,
  theme,
  size = 'sm',
}: {
  percent: number;
  theme: ReturnType<typeof useTheme>;
  size?: 'sm' | 'lg';
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const height = size === 'lg' ? 8 : 6;
  const track = (
    <View
      style={{
        flex: 1,
        height,
        borderRadius: height / 2,
        backgroundColor: theme.colors.surfaceSunken,
        overflow: 'hidden',
      }}
    >
      <View style={{ height: '100%', width: `${clamped}%`, borderRadius: height / 2, backgroundColor: theme.colors.primary }} />
    </View>
  );

  if (size !== 'lg') {
    return <View style={{ marginTop: 6 }}>{track}</View>;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
      {track}
      <View
        style={{
          backgroundColor: theme.colors.primarySoft,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 3,
          borderRadius: theme.radius.pill,
        }}
      >
        <Text variant="caption" style={{ color: theme.colors.primaryOnSoft, fontWeight: '700' }}>
          {clamped}%
        </Text>
      </View>
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

type FinishedStats = { week: number; month: number; year: number; allTime: number };

/**
 * Books finished this week/month/year, and all-time — computed client-side
 * from the already-cached library rather than a new query, same reasoning
 * as the in-progress list above. Lifted out of StatsSheet so the header's
 * "finished this month" stat chip can share the same computation.
 */
function computeFinishedStats(library: LibraryEntry[]): FinishedStats {
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
}

function StatsSheet({ visible, onClose, stats }: { visible: boolean; onClose: () => void; stats: FinishedStats }) {
  const theme = useTheme();
  const { t } = useI18n();

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
