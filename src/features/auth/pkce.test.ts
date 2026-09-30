import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { base64ToBase64Url, randomStringFromBytes } from './pkce';

describe('PKCE helpers', () => {
  it('derives the RFC 7636 Appendix B challenge from its verifier', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const digest = createHash('sha256').update(verifier).digest('base64');
    expect(base64ToBase64Url(digest)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('builds a verifier of one unreserved character per byte', () => {
    const bytes = new Uint8Array(64).map((_, i) => i * 7);
    const verifier = randomStringFromBytes(bytes);
    expect(verifier).toHaveLength(64);
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('uses every byte value without bias across the 64-character alphabet', () => {
    const all = new Uint8Array(256).map((_, i) => i);
    const counts = new Map<string, number>();
    for (const char of randomStringFromBytes(all)) counts.set(char, (counts.get(char) ?? 0) + 1);
    expect(counts.size).toBe(64);
    expect(new Set(counts.values())).toEqual(new Set([4]));
  });
});
