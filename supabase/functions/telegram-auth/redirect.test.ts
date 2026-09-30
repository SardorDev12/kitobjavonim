import { describe, expect, it } from 'vitest';

/** Mirrors index.ts's isAllowedRedirect — see verify.test.ts for why this is reimplemented, not imported. */
const APP_SCHEME = 'homelibrary';
const ALLOWED_ORIGINS = ['http://localhost:8081', 'https://homelibrary.uz'];

function isAllowedRedirect(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === `${APP_SCHEME}:`) return true;
  return ALLOWED_ORIGINS.includes(parsed.origin);
}

const cases: [string, boolean, string][] = [
  ['homelibrary://auth/callback', true, 'native deep link'],
  ['http://localhost:8081/auth/callback', true, 'dev web'],
  ['https://homelibrary.uz/auth/callback', true, 'production web'],
  ['https://attacker.example/steal', false, 'open redirect to attacker'],
  ['https://homelibrary.uz.attacker.example/x', false, 'lookalike suffix domain'],
  ['http://homelibrary.uz/auth/callback', false, 'downgraded to http'],
  ['https://homelibrary.uz:8443/x', false, 'unlisted port'],
  ['evilscheme://auth/callback', false, 'foreign scheme'],
  ['javascript:alert(1)', false, 'javascript: url'],
  ['not a url', false, 'unparseable'],
  ['', false, 'empty'],
];

describe('telegram-auth redirect allow-list', () => {
  it.each(cases)('%s → %s (%s)', (input, expected) => {
    expect(isAllowedRedirect(input)).toBe(expected);
  });
});
