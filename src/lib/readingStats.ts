import { isWithinInterval, startOfMonth, startOfWeek, startOfYear, subMonths } from 'date-fns';

import type { LibraryEntry } from '@/types/database';

export type ReadingStats = {
  totals: { library: number; reading: number; wantToRead: number; finished: number };
  finished: { week: number; month: number; year: number; allTime: number };
  pagesRead: number;
  avgRating: number | null;
  ratedCount: number;
  avgDaysToFinish: number | null;
  topAuthor: { name: string; count: number } | null;
  /** Finished-book counts for the trailing MONTHLY_CHART_MONTHS months, oldest first. */
  monthly: { monthStart: Date; count: number }[];
};

const MONTHLY_CHART_MONTHS = 6;

/**
 * Every number on the stats page, computed client-side from the already-
 * cached library (useLibrary()) rather than a new query — same reasoning
 * as (tabs)/index.tsx's own in-progress list: a personal library is small
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

  const pagesRead = finishedEntries.reduce((sum, entry) => sum + (entry.page_count ?? 0), 0);

  const ratedEntries = finishedEntries.filter((entry) => entry.rating != null);
  const avgRating = ratedEntries.length
    ? ratedEntries.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / ratedEntries.length
    : null;

  const pacedEntries = finishedEntries.filter((entry) => entry.date_started && entry.date_finished);
  const avgDaysToFinish = pacedEntries.length
    ? Math.round(
        pacedEntries.reduce((sum, entry) => {
          const days = (new Date(entry.date_finished!).getTime() - new Date(entry.date_started!).getTime()) / 86_400_000;
          return sum + Math.max(days, 0);
        }, 0) / pacedEntries.length
      )
    : null;

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
      allTime: finishedDates.length,
    },
    pagesRead,
    avgRating,
    ratedCount: ratedEntries.length,
    avgDaysToFinish,
    topAuthor,
    monthly,
  };
}
