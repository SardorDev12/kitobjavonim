import { describe, expect, it } from 'vitest';

import { isVersionOlder } from './version';

describe('isVersionOlder', () => {
  it('detects an older patch version', () => {
    expect(isVersionOlder('0.2.0', '0.2.1')).toBe(true);
    expect(isVersionOlder('0.2.1', '0.2.0')).toBe(false);
  });

  it('detects an older minor version, regardless of patch', () => {
    expect(isVersionOlder('0.1.9', '0.2.0')).toBe(true);
    expect(isVersionOlder('0.2.0', '0.1.9')).toBe(false);
  });

  it('detects an older major version, regardless of minor/patch', () => {
    expect(isVersionOlder('0.9.9', '1.0.0')).toBe(true);
  });

  it('compares numerically, not lexicographically', () => {
    // A plain string comparison would put "0.9.0" after "0.10.0".
    expect(isVersionOlder('0.9.0', '0.10.0')).toBe(true);
    expect(isVersionOlder('0.10.0', '0.9.0')).toBe(false);
  });

  it('treats an identical version as not older', () => {
    expect(isVersionOlder('0.2.0', '0.2.0')).toBe(false);
  });

  it('treats a malformed value as version 0, not a thrown error', () => {
    expect(isVersionOlder('not-a-version', '0.2.0')).toBe(true);
    expect(isVersionOlder('0.2.0', 'not-a-version')).toBe(false);
  });
});
