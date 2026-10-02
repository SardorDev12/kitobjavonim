import { describe, expect, it } from 'vitest';

import { pageFromRead, readFromPage } from './progressInput';

describe('pageFromRead', () => {
  it('adds the pages read to the saved page', () => {
    expect(pageFromRead(114, '12', 252)).toBe('126');
  });

  it('stops at the total', () => {
    expect(pageFromRead(114, '500', 252)).toBe('252');
  });

  it('does not cap when the total is not known yet', () => {
    expect(pageFromRead(114, '12', 0)).toBe('126');
  });

  it('goes back to the saved page when the field is cleared', () => {
    expect(pageFromRead(114, '', 252)).toBe('114');
    expect(pageFromRead(0, '', 252)).toBe('');
  });

  it('ignores non-digits', () => {
    expect(pageFromRead(10, '5a', 252)).toBe('15');
  });
});

describe('readFromPage', () => {
  it('shows the difference from the saved page', () => {
    expect(readFromPage(114, '126')).toBe('12');
  });

  it('is empty for a page at or before the saved one (a correction)', () => {
    expect(readFromPage(114, '114')).toBe('');
    expect(readFromPage(114, '90')).toBe('');
  });

  it('is empty for an empty field', () => {
    expect(readFromPage(114, '')).toBe('');
  });
});
