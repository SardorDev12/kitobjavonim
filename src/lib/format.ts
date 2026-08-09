import { format, parseISO } from 'date-fns';
import { enUS, ru as ruDate, uz as uzDate } from 'date-fns/locale';

import type { Locale } from './i18n';

const dateLocales = { uz: uzDate, ru: ruDate, en: enUS } as const;

/** Currency is stored per-row, but in practice everything is UZS at launch. */
const currencySuffix: Record<Locale, string> = {
  uz: 'soʻm',
  ru: 'сум',
  en: 'UZS',
};

/**
 * Groups thousands with a non-breaking space: 85000 → "85 000 soʻm".
 *
 * Done by hand rather than with Intl.NumberFormat because Hermes builds vary in
 * how much ICU data they carry, and a price silently rendering as "85000" on
 * some Android devices is worse than a few lines of formatting code.
 */
export function formatPrice(
  amount: number | string | null | undefined,
  locale: Locale,
  currency = 'UZS'
): string {
  if (amount === null || amount === undefined || amount === '') return '';

  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '';

  const whole = Math.round(value);
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const suffix = currency === 'UZS' ? currencySuffix[locale] : currency;

  return `${grouped} ${suffix}`;
}

/** Strips grouping characters so a typed price can be parsed back to a number. */
export function parsePriceInput(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

export function formatDate(value: string | Date | null | undefined, locale: Locale): string {
  if (!value) return '';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'd MMM yyyy', { locale: dateLocales[locale] });
}

export function formatMonthYear(value: string | Date | null | undefined, locale: Locale): string {
  if (!value) return '';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'LLLL yyyy', { locale: dateLocales[locale] });
}

/** Reference tables carry one column per language; pick the right one. */
export function localizedName(
  row: { name_uz: string; name_ru: string; name_en: string } | null | undefined,
  locale: Locale
): string {
  if (!row) return '';
  return locale === 'ru' ? row.name_ru : locale === 'en' ? row.name_en : row.name_uz;
}

export function formatAuthors(authors: string[] | null | undefined): string {
  if (!authors || authors.length === 0) return '';
  if (authors.length <= 2) return authors.join(', ');
  return `${authors[0]} +${authors.length - 1}`;
}

/** "Living room → Shelf 1 → Row 1", or the user's own label if they set one. */
export function formatPosition(
  position:
    | {
        bookshelf_name?: string | null;
        shelf_number?: number | null;
        row_number?: number | null;
        position_label?: string | null;
      }
    | null
    | undefined,
  t: (key: 'shelves.positionFormat' | 'shelves.fullPositionFormat', params?: Record<string, string | number>) => string,
  options: { includeBookshelf?: boolean } = {}
): string {
  if (!position || position.shelf_number == null || position.row_number == null) return '';

  if (position.position_label) {
    return options.includeBookshelf && position.bookshelf_name
      ? `${position.bookshelf_name} → ${position.position_label}`
      : position.position_label;
  }

  if (options.includeBookshelf && position.bookshelf_name) {
    return t('shelves.fullPositionFormat', {
      bookshelf: position.bookshelf_name,
      shelf: position.shelf_number,
      row: position.row_number,
    });
  }

  return t('shelves.positionFormat', {
    shelf: position.shelf_number,
    row: position.row_number,
  });
}

/** ISBN-13 with the conventional hyphenation dropped, for display and lookup. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn(raw: string): boolean {
  const isbn = normalizeIsbn(raw);

  if (isbn.length === 13) {
    if (!/^\d{13}$/.test(isbn)) return false;
    const sum = isbn
      .split('')
      .slice(0, 12)
      .reduce((acc, digit, i) => acc + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === Number(isbn[12]);
  }

  if (isbn.length === 10) {
    if (!/^\d{9}[\dX]$/.test(isbn)) return false;
    const sum = isbn
      .split('')
      .reduce((acc, char, i) => acc + (char === 'X' ? 10 : Number(char)) * (10 - i), 0);
    return sum % 11 === 0;
  }

  return false;
}
