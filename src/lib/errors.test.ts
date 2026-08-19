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
    expect(describeError(new Error('column "foo" does not exist'), t)).toBe('column "foo" does not exist');
  });

  it('maps common fetch-layer network failures to error.network, across browsers/RN', () => {
    // Chrome, Firefox, Safari, and React Native's fetch polyfill each word
    // "the request never reached anywhere" differently — none of it is a
    // token this app raises itself, so none of it should reach the user
    // as a raw, cryptic string.
    expect(describeError(new Error('Failed to fetch'), t)).toBe('translated:error.network');
    expect(describeError(new Error('NetworkError when attempting to fetch resource.'), t)).toBe(
      'translated:error.network'
    );
    expect(describeError(new Error('Load failed'), t)).toBe('translated:error.network');
    expect(describeError(new Error('Network request failed'), t)).toBe('translated:error.network');
  });

  it('falls back to error.generic for a non-Error thrown value', () => {
    expect(describeError('a plain string', t)).toBe('translated:error.generic');
    expect(describeError(undefined, t)).toBe('translated:error.generic');
    expect(describeError({ some: 'object' }, t)).toBe('translated:error.generic');
  });

  it('maps a network failure to error.network even when postgrest-js throws it as a plain object', () => {
    // postgrest-js only wraps HTTP-level failures in a real PostgrestError. A
    // failure below that — the fetch call itself rejecting, e.g. no
    // connectivity — is caught internally and rethrown as a plain
    // { message, details, hint, code } object instead, which is not
    // `instanceof Error`. That's exactly what testers on a bad connection hit.
    expect(describeError({ message: 'TypeError: Network request failed', details: '', hint: '', code: '' }, t)).toBe(
      'translated:error.network'
    );
  });

  it('falls back to error.generic for an Error with an empty message', () => {
    expect(describeError(new Error(''), t)).toBe('translated:error.generic');
  });

  it('maps Android native fetch failures to error.network regardless of the underlying Java exception', () => {
    // React Native's Android fetch (OkHttp under the JS polyfill) doesn't use
    // any of the JS-engine wording above — it prefixes the exception's own
    // message with "fetch failed:", and the exception class varies by what
    // actually went wrong (DNS, refused connection, timeout, TLS).
    expect(
      describeError(
        new Error(
          'fetch failed: java.net.UnknownHostException: Unable to resolve host "ahpsnvxpduaqrkvmpfck.supabase.co": No address associated with hostname'
        ),
        t
      )
    ).toBe('translated:error.network');
    expect(describeError(new Error('fetch failed: java.net.ConnectException: Failed to connect'), t)).toBe(
      'translated:error.network'
    );
    expect(describeError(new Error('fetch failed: java.net.SocketTimeoutException: timeout'), t)).toBe(
      'translated:error.network'
    );
  });
});
