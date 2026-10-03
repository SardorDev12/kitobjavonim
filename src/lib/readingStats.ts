import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isWithinInterval,
  max as maxDate,
  min as minDate,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';

import type { LibraryEntry } from '@/types/database';

export type BookRef = { id: string; title: string };

export type ReadingStats = {
  totals: { library: number; reading: number; wantToRead: number; finished: number };
  finished: { week: number; month: number; year: number };
  pagesRead: number;
  /** Not shown on the page itself — only feeds the "share my year" summary. */
  avgRating: number | null;
  ratedCount: number;
  /** Index 0 = one-star count, ... index 4 = five-star count. */
  ratingDistribution: [number, number, number, number, number];
  longestBook: (BookRef & { pages: number }) | null;
  shortestBook: (BookRef & { pages: number }) | null;
  fastestFinish: (BookRef & { days: number }) | null;
};

/**
 * Pages already read in books that aren't finished yet — the page the reader
 * is on, capped at the book's total when that's known. Counted so the pages
 * tile moves while a book is being read, not only on the day it's finished.
 */
function inProgressPages(library: LibraryEntry[]): number {
  return library
    .filter((entry) => entry.reading_status === 'reading' && entry.current_page)
    .reduce((sum, entry) => {
      const page = entry.current_page ?? 0;
      return sum + (entry.page_count ? Math.min(page, entry.page_count) : page);
    }, 0);
}

/**
 * Every number on the stats page (streak excepted — see readingActivity.ts,
 * it needs its own query), computed client-side from the already-cached
 * library (useLibrary()) rather than a new query — same reasoning as
 * (tabs)/index.tsx's own in-progress list: a personal library is small
 * enough to hold in cache, so there's no round trip this needs to wait on.
 */
export function computeReadingStats(library: LibraryEntry[]): ReadingStats {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const yearStart = startOfYear(now);

  const finishedEntries = library.filter((entry) => entry.reading_status === 'finished' && entry.date_finished);
  const finishedDates = finishedEntries.map((entry) => new Date(entry.date_finished!));

  const countSince = (start: Date) => finishedDates.filter((date) => isWithinInterval(date, { start, end: now })).length;

  const pagesRead = finishedEntries.reduce((sum, entry) => sum + (entry.page_count ?? 0), 0) + inProgressPages(library);

  const ratedEntries = finishedEntries.filter((entry) => entry.rating != null);
  const avgRating = ratedEntries.length
    ? ratedEntries.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / ratedEntries.length
    : null;

  const ratingDistribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const entry of ratedEntries) {
    const star = Math.min(5, Math.max(1, entry.rating!));
    ratingDistribution[star - 1] += 1;
  }

  let longestBook: (BookRef & { pages: number }) | null = null;
  let shortestBook: (BookRef & { pages: number }) | null = null;
  for (const entry of finishedEntries) {
    if (!entry.page_count) continue;
    if (!longestBook || entry.page_count > longestBook.pages) {
      longestBook = { id: entry.id, title: entry.title, pages: entry.page_count };
    }
    if (!shortestBook || entry.page_count < shortestBook.pages) {
      shortestBook = { id: entry.id, title: entry.title, pages: entry.page_count };
    }
  }

  // A same-day finish (0 days between start and finish) isn't a meaningful
  // "fastest" to show off — usually just means the whole book was logged at
  // once rather than actually read in under a day — so it's excluded rather
  // than always winning "fastest finish" by construction.
  let fastestFinish: (BookRef & { days: number }) | null = null;
  for (const entry of finishedEntries) {
    if (!entry.date_started || !entry.date_finished) continue;
    const days = Math.round((new Date(entry.date_finished).getTime() - new Date(entry.date_started).getTime()) / 86_400_000);
    if (days > 0 && (!fastestFinish || days < fastestFinish.days)) {
      fastestFinish = { id: entry.id, title: entry.title, days };
    }
  }

  return {
    totals: {
      library: library.length,
      reading: library.filter((entry) => entry.reading_status === 'reading').length,
      wantToRead: library.filter((entry) => entry.reading_status === 'want_to_read').length,
      finished: finishedEntries.length,
    },
    finished: {
      week: countSince(weekStart),
      month: countSince(monthStart),
      year: countSince(yearStart),
    },
    pagesRead,
    avgRating,
    ratedCount: ratedEntries.length,
    ratingDistribution,
    longestBook,
    shortestBook,
    fastestFinish,
  };
}

export type PeriodType = 'day' | 'week' | 'month' | 'year';

export type BookCard = BookRef & { pages: number; coverUrl: string | null; authors: string[] };

export type PeriodStats = {
  start: Date;
  end: Date;
  booksFinished: number;
  pagesRead: number;
  avgRating: number | null;
  longestBook: BookCard | null;
  shortestBook: BookCard | null;
  /** Pages read per bucket. Empty for 'day' — a single bucket isn't a chart. Bucket boundaries
   *  vary by period (a day, for 'week'/'month'; a month, for 'year') —
   *  the caller picks the axis label per period. */
  chart: { bucketStart: Date; pages: number }[];
  /** Finished within [start, end], newest first. */
  finishedBooks: LibraryEntry[];
};

/** Moves a period's reference date by one whole period, for the stats page's prev/next controls. */
export function shiftPeriod(period: PeriodType, referenceDate: Date, direction: 1 | -1): Date {
  switch (period) {
    case 'day':
      return addDays(referenceDate, direction);
    case 'week':
      return addWeeks(referenceDate, direction);
    case 'month':
      return addMonths(referenceDate, direction);
    case 'year':
      return addYears(referenceDate, direction);
  }
}

function periodBounds(period: PeriodType, referenceDate: Date): { start: Date; end: Date } {
  switch (period) {
    case 'day':
      return { start: startOfDay(referenceDate), end: endOfDay(referenceDate) };
    case 'week':
      return { start: startOfWeek(referenceDate, { weekStartsOn: 1 }), end: endOfWeek(referenceDate, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(referenceDate), end: endOfMonth(referenceDate) };
    case 'year':
      return { start: startOfYear(referenceDate), end: endOfYear(referenceDate) };
  }
}

/**
 * Same numbers as computeReadingStats, but scoped to a single browsable
 * period (day/week/month/year, any reference date) instead of always "now"
 * — powers the stats page's period tabs + prev/next/picker navigation.
 * Deliberately a separate function rather than a generalization of
 * computeReadingStats: that one also computes the streak-adjacent "week/
 * month/year/all-time so far" numbers the goal and mini-tiles still use as
 * fixed, always-current reference points regardless of which period is
 * being browsed — conflating the two would make those tiles wrongly track
 * whatever period is on screen.
 */
export function computePeriodStats(
  library: LibraryEntry[],
  period: PeriodType,
  referenceDate: Date,
  pagesLog: { date: string; pages: number }[] = []
): PeriodStats {
  const { start, end } = periodBounds(period, referenceDate);

  const finishedBooks = library
    .filter((entry) => entry.reading_status === 'finished' && entry.date_finished)
    .filter((entry) => isWithinInterval(new Date(entry.date_finished!), { start, end }))
    .sort((a, b) => b.date_finished!.localeCompare(a.date_finished!));

  // Pages logged day by day (0039_reading_pages_log.sql) cover reading since
  // that log started, including books that aren't finished. Before it started
  // there is nothing logged, so those days keep counting a finished book's
  // pages on the day it was finished, as they always did.
  const startKey = format(start, 'yyyy-MM-dd');
  const endKey = format(end, 'yyyy-MM-dd');
  const loggedPages = pagesLog
    .filter((entry) => entry.date >= startKey && entry.date <= endKey)
    .reduce((sum, entry) => sum + entry.pages, 0);
  const firstLoggedDate = pagesLog.reduce<string | null>(
    (first, entry) => (first === null || entry.date < first ? entry.date : first),
    null
  );
  const legacyPages = finishedBooks
    .filter((entry) => firstLoggedDate === null || entry.date_finished! < firstLoggedDate)
    .reduce((sum, entry) => sum + (entry.page_count ?? 0), 0);
  const pagesRead = loggedPages + legacyPages;

  const ratedBooks = finishedBooks.filter((entry) => entry.rating != null);
  const avgRating = ratedBooks.length
    ? ratedBooks.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / ratedBooks.length
    : null;

  let longestBook: BookCard | null = null;
  let shortestBook: BookCard | null = null;
  for (const entry of finishedBooks) {
    if (!entry.page_count) continue;
    const card: BookCard = { id: entry.id, title: entry.title, pages: entry.page_count, coverUrl: entry.cover_url, authors: entry.authors };
    if (!longestBook || entry.page_count > longestBook.pages) longestBook = card;
    if (!shortestBook || entry.page_count < shortestBook.pages) shortestBook = card;
  }

  // Pages in one chart bucket: what was logged on those days, plus (before the
  // log started) the finished books' pages on their finish day — the same rule
  // as pagesRead above, just cut into smaller ranges. Compared as plain
  // YYYY-MM-DD keys so a date column never shifts across a day boundary.
  const pagesBetween = (bucketStart: Date, bucketEnd: Date) => {
    const from = format(bucketStart, 'yyyy-MM-dd');
    const to = format(bucketEnd, 'yyyy-MM-dd');
    const logged = pagesLog.filter((entry) => entry.date >= from && entry.date <= to).reduce((sum, entry) => sum + entry.pages, 0);
    const legacy = finishedBooks
      .filter((entry) => entry.date_finished! >= from && entry.date_finished! <= to)
      .filter((entry) => firstLoggedDate === null || entry.date_finished! < firstLoggedDate)
      .reduce((sum, entry) => sum + (entry.page_count ?? 0), 0);
    return logged + legacy;
  };

  const chart: { bucketStart: Date; pages: number }[] =
    period === 'day'
      ? []
      : period === 'week'
        ? eachDayOfInterval({ start, end }).map((day) => ({ bucketStart: day, pages: pagesBetween(startOfDay(day), endOfDay(day)) }))
        : period === 'month'
          ? eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map((weekStart) => ({
              bucketStart: weekStart,
              pages: pagesBetween(maxDate([weekStart, start]), minDate([endOfWeek(weekStart, { weekStartsOn: 1 }), end])),
            }))
          : eachMonthOfInterval({ start, end }).map((monthStart) => ({
              bucketStart: monthStart,
              pages: pagesBetween(startOfMonth(monthStart), endOfMonth(monthStart)),
            }));

  return { start, end, booksFinished: finishedBooks.length, pagesRead, avgRating, longestBook, shortestBook, chart, finishedBooks };
}

export type Streak = { current: number; longest: number };

/**
 * Current and longest consecutive-day streaks from reading_activity's own
 * date rows (see readingActivity.ts) — "current" counts backward from
 * today, but doesn't reset to 0 just because today hasn't happened yet:
 * finishing yesterday and not having opened the app *yet* today is still
 * an active streak, the same way Duolingo's own streak doesn't lapse at
 * midnight, only once a full day is skipped.
 */
export function computeStreak(activityDates: string[]): Streak {
  const days = new Set(activityDates.map((d) => d.slice(0, 10)));
  if (days.size === 0) return { current: 0, longest: 0 };

  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

  let current = 0;
  const today = new Date();
  let cursor = days.has(toKey(today)) ? today : addDays(today, -1);
  while (days.has(toKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of sorted) {
    const date = new Date(`${key}T00:00:00.000Z`);
    if (previous && addDays(previous, 1).toISOString().slice(0, 10) === key) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    previous = date;
  }

  return { current, longest };
}
