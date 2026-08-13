import { describe, expect, it } from 'vitest';

import {
  formatAuthors,
  formatPrice,
  isValidIsbn,
  normalizeIsbn,
  parsePriceInput,
} from './format';

// formatPrice joins every piece — thousands groups, and the number/currency
// boundary — with a non-breaking space (U+00A0), not a plain ASCII one, so
// a price never breaks across a line at an awkward spot. Fixtures below
// build the expected string the same way rather than hardcoding a
// space that would silently never match.
const NBSP = ' ';

describe('formatPrice', () => {
  it('groups thousands with a non-breaking space', () => {
    expect(formatPrice(85000, 'uz')).toBe(`85${NBSP}000${NBSP}soʻm`);
  });

  it('handles small amounts with no grouping needed', () => {
    expect(formatPrice(500, 'uz')).toBe(`500${NBSP}soʻm`);
  });

  it('rounds a fractional amount', () => {
    expect(formatPrice(1500.6, 'en')).toBe(`1${NBSP}501${NBSP}UZS`);
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(formatPrice(null, 'uz')).toBe('');
    expect(formatPrice(undefined, 'uz')).toBe('');
    expect(formatPrice('', 'uz')).toBe('');
  });

  it('returns empty string for a non-numeric string', () => {
    expect(formatPrice('not-a-number', 'uz')).toBe('');
  });

  it('uses the given currency code when not UZS', () => {
    expect(formatPrice(10, 'en', 'USD')).toBe(`10${NBSP}USD`);
  });

  it('parses a numeric string amount', () => {
    expect(formatPrice('20000', 'ru')).toBe(`20${NBSP}000${NBSP}сум`);
  });
});

describe('parsePriceInput', () => {
  it('strips grouping characters back to a plain number', () => {
    expect(parsePriceInput(`85${NBSP}000`)).toBe(85000);
  });

  it('strips non-digit characters generally', () => {
    expect(parsePriceInput('$1,234.56')).toBe(123456);
  });

  it('returns null for empty or non-numeric input', () => {
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('   ')).toBeNull();
    expect(parsePriceInput('abc')).toBeNull();
  });
});

describe('normalizeIsbn', () => {
  it('strips hyphens and spaces', () => {
    expect(normalizeIsbn('978-0-13-468599-1')).toBe('9780134685991');
  });

  it('uppercases a trailing X (ISBN-10 check digit)', () => {
    expect(normalizeIsbn('080442957x')).toBe('080442957X');
  });
});

describe('isValidIsbn', () => {
  it('accepts a real ISBN-13', () => {
    // The Pragmatic Programmer, 20th anniversary edition.
    expect(isValidIsbn('978-0-13-595705-9')).toBe(true);
  });

  it('rejects an ISBN-13 with a wrong check digit', () => {
    expect(isValidIsbn('978-0-13-595705-0')).toBe(false);
  });

  it('accepts a real ISBN-10, including an X check digit', () => {
    expect(isValidIsbn('0-596-52068-9')).toBe(true);
    expect(isValidIsbn('080442957X')).toBe(true);
  });

  it('rejects an ISBN-10 with a wrong check digit', () => {
    expect(isValidIsbn('0-596-52068-0')).toBe(false);
  });

  it('rejects the wrong length entirely', () => {
    expect(isValidIsbn('12345')).toBe(false);
    expect(isValidIsbn('')).toBe(false);
  });
});

describe('formatAuthors', () => {
  it('returns empty string for no authors', () => {
    expect(formatAuthors(null)).toBe('');
    expect(formatAuthors([])).toBe('');
  });

  it('joins up to two authors with a comma', () => {
    expect(formatAuthors(['A. Author'])).toBe('A. Author');
    expect(formatAuthors(['A. Author', 'B. Author'])).toBe('A. Author, B. Author');
  });

  it('collapses three or more authors to the first plus a count', () => {
    expect(formatAuthors(['A', 'B', 'C'])).toBe('A +2');
  });
});
