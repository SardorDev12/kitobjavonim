import { describe, expect, it } from 'vitest';

import { describeError } from './errors';

const t = (key: string) => `translated:${key}`;

describe('describeError', () => {
  it('maps a known freemium-limit error code to its translated message', () => {
    expect(describeError(new Error('listing_limit_reached'), t)).toBe('translated:error.listingLimitReached');
    expect(describeError(new Error('contact_limit_reached'), t)).toBe('translated:error.contactLimitReached');
    expect(describeError(new Error('report_limit_reached'), t)).toBe('translated:error.reportLimitReached');
  });

  it('falls back to the raw message for an unrecognized Error', () => {
    expect(describeError(new Error('Failed to fetch'), t)).toBe('Failed to fetch');
  });

  it('falls back to error.generic for a non-Error thrown value', () => {
    expect(describeError('a plain string', t)).toBe('translated:error.generic');
    expect(describeError(undefined, t)).toBe('translated:error.generic');
    expect(describeError({ some: 'object' }, t)).toBe('translated:error.generic');
  });

  it('falls back to error.generic for an Error with an empty message', () => {
    expect(describeError(new Error(''), t)).toBe('translated:error.generic');
  });
});
