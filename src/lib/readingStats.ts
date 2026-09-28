import { endOfYear, isWithinInterval, startOfMonth, startOfWeek, startOfYear, subMonths, subYears } from 'date-fns';

import type { LibraryEntry } from '@/types/database';

export type ReadingStats = {
  totals: { library: number; reading: number; wantToRead: number; finished: number };
  finished: { week: number; month: number; year: number; lastYear: number; allTime: number };
  pagesRead: number;
  /** Not shown on the page itself — only feeds the "share my year" summary. */
  avgRating: number | null;
  ratedCount: number;
  /** Index 0 = one-star count, ... index 4 = five-star count. */
  ratingDistribution: [number, number, number, number, number];
  /** Not shown on the page itself — only feeds the "share my year" summary. */
  topAuthor: { name: string; count: number } | null;
  /** Finished-book counts for the trailing MONTHLY_CHART_MONTHS months, oldest first. */
  monthly: { monthStart: Date; count: number }[];
};

const MONTHLY_CHART_MONTHS = 6;

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
  const lastYearStart = startOfYear(subYears(now, 1));
  const lastYearEnd = endOfYear(subYears(now, 1));

  const finishedEntries = library.filter((entry) => entry.reading_status === 'finished' && entry.date_finished);
  const finishedDates = finishedEntries.map((entry) => new Date(entry.date_finished!));

  const countSince = (start: Date) => finishedDates.filter((date) => isWithinInterval(date, { start, end: now })).length;

  const pagesRead = finishedEntries.reduce((sum, entry) => sum + (entry.page_count ?? 0), 0);

  const ratedEntries = finishedEntries.filter((entry) => entry.rating != null);
  const avgRating = ratedEntries.length
    ? ratedEntries.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / ratedEntries.length
    : null;

  const ratingDistribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const entry of ratedEntries) {
    const star = Math.min(5, Math.max(1, entry.rating!));
    ratingDistribution[star - 1] += 1;
  }

  const authorCounts = new Map<string, number>();
  for (const entry of finishedEntries) {
    for (const author of entry.authors) {
      authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
    }
  }
  let topAuthor: { name: string; count: number } | null = null;
  for (const [name, count] of authorCounts) {
    // First one wins on a tie — Map preserves insertion order, which here
    // is finished-date order, so a tie favors whichever was finished first.
    if (!topAuthor || count > topAuthor.count) topAuthor = { name, count };
  }

  const monthly = Array.from({ length: MONTHLY_CHART_MONTHS }, (_, i) => {
    const d = subMonths(now, MONTHLY_CHART_MONTHS - 1 - i);
    const year = d.getFullYear();
    const month = d.getMonth();
    const count = finishedDates.filter((date) => date.getFullYear() === year && date.getMonth() === month).length;
    return { monthStart: new Date(year, month, 1), count };
  });

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
      lastYear: finishedDates.filter((date) => isWithinInterval(date, { start: lastYearStart, end: lastYearEnd })).length,
      allTime: finishedDates.length,
    },
    pagesRead,
    avgRating,
    ratedCount: ratedEntries.length,
    ratingDistribution,
    topAuthor,
    monthly,
  };
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
