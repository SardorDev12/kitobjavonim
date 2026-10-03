import { describe, expect, it } from 'vitest';

import { computePeriodStats, computeReadingStats, shiftPeriod } from './readingStats';
import type { LibraryEntry } from '@/types/database';

let nextId = 0;

function makeEntry(overrides: Partial<LibraryEntry>): LibraryEntry {
  nextId += 1;
  return {
    id: `book-${nextId}`,
    user_id: 'user-1',
    reading_status: 'finished',
    condition: null,
    rating: null,
    review: null,
    notes: null,
    date_added: '2026-01-01',
    availability_type: 'private',
    listed_at: null,
    exchange_preferences: null,
    sale_price: null,
    sale_currency: 'UZS',
    price_negotiable: false,
    sale_description: null,
    shelf_note: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    title: 'Untitled',
    subtitle: null,
    authors: [],
    cover_url: null,
    isbn13: null,
    publisher: null,
    publication_year: null,
    language: null,
    page_count: null,
    description: null,
    household_id: null,
    added_by_name: null,
    added_by_avatar_url: null,
    date_started: null,
    date_finished: null,
    current_page: null,
    progress_percent: null,
    ...overrides,
  } as LibraryEntry;
}

describe('pages read in unfinished books', () => {
  const reading = makeEntry({ reading_status: 'reading', current_page: 114, page_count: 252 });
  const finished = makeEntry({ date_finished: '2026-03-15', page_count: 200 });

  it('counts the current page of a book being read in the all-time total', () => {
    expect(computeReadingStats([reading, finished]).pagesRead).toBe(314);
  });

  it('caps the current page at the book total', () => {
    const over = makeEntry({ reading_status: 'reading', current_page: 900, page_count: 252 });
    expect(computeReadingStats([over]).pagesRead).toBe(252);
  });

  it('does not add it to a day, week or month by itself — it has no date of its own', () => {
    expect(computePeriodStats([reading], 'day', new Date()).pagesRead).toBe(0);
    expect(computePeriodStats([reading], 'week', new Date()).pagesRead).toBe(0);
  });
});

describe('computePeriodStats', () => {
  it('scopes "day" to a single calendar day, excluding neighbors', () => {
    const library = [
      makeEntry({ title: 'Yesterday', date_finished: '2026-03-14', page_count: 100 }),
      makeEntry({ title: 'Today AM', date_finished: '2026-03-15', page_count: 200 }),
      makeEntry({ title: 'Today PM', date_finished: '2026-03-15', page_count: 50 }),
      makeEntry({ title: 'Tomorrow', date_finished: '2026-03-16', page_count: 400 }),
    ];

    const result = computePeriodStats(library, 'day', new Date('2026-03-15T12:00:00'));

    expect(result.booksFinished).toBe(2);
    expect(result.pagesRead).toBe(250);
    expect(result.chart).toEqual([]);
  });

  it('buckets "week" into 7 days, Monday first', () => {
    // 2026-03-15 is a Sunday — the week it belongs to runs Mon 2026-03-09..Sun 2026-03-15.
    const library = [
      makeEntry({ date_finished: '2026-03-09', page_count: 10 }), // Monday
      makeEntry({ date_finished: '2026-03-09', page_count: 10 }), // Monday, second book
      makeEntry({ date_finished: '2026-03-11', page_count: 10 }), // Wednesday
      makeEntry({ date_finished: '2026-03-08', page_count: 10 }), // previous Sunday — excluded
    ];

    const result = computePeriodStats(library, 'week', new Date('2026-03-15T12:00:00'));

    expect(result.chart).toHaveLength(7);
    expect(result.chart[0].pages).toBe(20); // Monday: two books of 10 pages
    expect(result.chart[2].pages).toBe(10); // Wednesday
    expect(result.booksFinished).toBe(3);
    expect(result.chart.reduce((sum, b) => sum + b.pages, 0)).toBe(result.pagesRead);
  });

  it('buckets "month" into weeks that sum to the month total, ignoring spillover from neighboring months', () => {
    const library = [
      makeEntry({ date_finished: '2026-03-01', page_count: 10 }),
      makeEntry({ date_finished: '2026-03-15', page_count: 10 }),
      makeEntry({ date_finished: '2026-03-31', page_count: 10 }),
      makeEntry({ date_finished: '2026-02-28', page_count: 10 }), // previous month — excluded
      makeEntry({ date_finished: '2026-04-01', page_count: 10 }), // next month — excluded
    ];

    const result = computePeriodStats(library, 'month', new Date('2026-03-15T12:00:00'));

    expect(result.booksFinished).toBe(3);
    expect(result.chart.reduce((sum, b) => sum + b.pages, 0)).toBe(30);
  });

  it('buckets "year" into 12 months', () => {
    const library = [
      makeEntry({ date_finished: '2026-01-05', page_count: 10 }),
      makeEntry({ date_finished: '2026-06-20', page_count: 10 }),
      makeEntry({ date_finished: '2026-06-21', page_count: 10 }),
      makeEntry({ date_finished: '2025-12-31', page_count: 10 }), // previous year — excluded
    ];

    const result = computePeriodStats(library, 'year', new Date('2026-06-15T12:00:00'));

    expect(result.chart).toHaveLength(12);
    expect(result.chart[0].pages).toBe(10); // January
    expect(result.chart[5].pages).toBe(20); // June
    expect(result.booksFinished).toBe(3);
  });

  it('excludes books that are not finished, or finished with no date', () => {
    const library = [
      makeEntry({ reading_status: 'reading', date_finished: null, page_count: 10 }),
      makeEntry({ reading_status: 'finished', date_finished: null, page_count: 10 }),
      makeEntry({ reading_status: 'finished', date_finished: '2026-03-15', page_count: 10 }),
    ];

    const result = computePeriodStats(library, 'day', new Date('2026-03-15T12:00:00'));

    expect(result.booksFinished).toBe(1);
  });

  it('picks longest/shortest by page count within the period only', () => {
    const library = [
      makeEntry({ title: 'In period, short', date_finished: '2026-03-10', page_count: 100 }),
      makeEntry({ title: 'In period, long', date_finished: '2026-03-12', page_count: 500 }),
      makeEntry({ title: 'Outside period, longer still', date_finished: '2026-02-01', page_count: 900 }),
      makeEntry({ title: 'No page count', date_finished: '2026-03-13', page_count: null }),
    ];

    const result = computePeriodStats(library, 'month', new Date('2026-03-15T12:00:00'));

    expect(result.longestBook?.title).toBe('In period, long');
    expect(result.shortestBook?.title).toBe('In period, short');
  });

  it('averages ratings only over rated, in-period books', () => {
    const library = [
      makeEntry({ date_finished: '2026-03-10', rating: 4 }),
      makeEntry({ date_finished: '2026-03-11', rating: 2 }),
      makeEntry({ date_finished: '2026-03-12', rating: null }),
    ];

    const result = computePeriodStats(library, 'month', new Date('2026-03-15T12:00:00'));

    expect(result.avgRating).toBe(3);
  });

  it('returns null average rating when nothing in the period is rated', () => {
    const library = [makeEntry({ date_finished: '2026-03-10', rating: null })];

    const result = computePeriodStats(library, 'month', new Date('2026-03-15T12:00:00'));

    expect(result.avgRating).toBeNull();
  });
});

describe('shiftPeriod', () => {
  it('moves by one unit of each period type', () => {
    const ref = new Date('2026-03-15T12:00:00');
    expect(shiftPeriod('day', ref, 1).toDateString()).toBe(new Date('2026-03-16T12:00:00').toDateString());
    expect(shiftPeriod('week', ref, 1).toDateString()).toBe(new Date('2026-03-22T12:00:00').toDateString());
    expect(shiftPeriod('month', ref, 1).toDateString()).toBe(new Date('2026-04-15T12:00:00').toDateString());
    expect(shiftPeriod('year', ref, 1).toDateString()).toBe(new Date('2027-03-15T12:00:00').toDateString());
  });

  it('moves backward with direction -1', () => {
    const ref = new Date('2026-03-15T12:00:00');
    expect(shiftPeriod('month', ref, -1).toDateString()).toBe(new Date('2026-02-15T12:00:00').toDateString());
  });

  it('clamps a month-end day when the target month is shorter', () => {
    // Jan 31 -> Feb has no 31st, date-fns clamps to the last day of Feb.
    const result = shiftPeriod('month', new Date('2026-01-31T12:00:00'), 1);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28); // 2026 is not a leap year
  });
});

describe('pages logged per day', () => {
  const day = new Date('2026-03-15T12:00:00');
  const log = [
    { date: '2026-03-15', pages: 21 },
    { date: '2026-03-12', pages: 30 },
    { date: '2026-02-20', pages: 40 },
  ];

  it('shows the pages logged for that day, not the whole book so far', () => {
    const reading = makeEntry({ reading_status: 'reading', current_page: 135, page_count: 252 });
    expect(computePeriodStats([reading], 'day', day, log).pagesRead).toBe(21);
    expect(computePeriodStats([reading], 'day', new Date('2026-03-14T12:00:00'), log).pagesRead).toBe(0);
  });

  it('adds the days up for a week, month and year', () => {
    expect(computePeriodStats([], 'week', day, log).pagesRead).toBe(51);
    expect(computePeriodStats([], 'month', day, log).pagesRead).toBe(51);
    expect(computePeriodStats([], 'year', day, log).pagesRead).toBe(91);
  });

  it('still counts a finished book from before the log started, on its finish day', () => {
    const old = makeEntry({ date_finished: '2026-01-10', page_count: 300 });
    const afterLog = makeEntry({ date_finished: '2026-03-15', page_count: 200 });
    expect(computePeriodStats([old, afterLog], 'year', day, log).pagesRead).toBe(91 + 300);
  });

  it('is the finished-books total when nothing has been logged', () => {
    const finished = makeEntry({ date_finished: '2026-03-15', page_count: 200 });
    expect(computePeriodStats([finished], 'day', day, []).pagesRead).toBe(200);
  });
});

describe('pages chart', () => {
  it('shows logged pages per day, including a book that is not finished', () => {
    const log = [
      { date: '2026-03-09', pages: 21 },
      { date: '2026-03-11', pages: 5 },
    ];
    const result = computePeriodStats([], 'week', new Date('2026-03-15T12:00:00'), log);
    expect(result.chart).toHaveLength(7);
    expect(result.chart[0].pages).toBe(21);
    expect(result.chart[2].pages).toBe(5);
    expect(result.chart.reduce((sum, b) => sum + b.pages, 0)).toBe(result.pagesRead);
  });
});
