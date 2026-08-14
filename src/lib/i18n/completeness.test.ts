import { describe, expect, it } from 'vitest';

import { en } from './locales/en';
import { ru } from './locales/ru';
import { uz } from './locales/uz';

/**
 * TypeScript already guarantees ru/uz define every key en does (Catalogue =
 * Record<MessageKey, string>, see locales/types.ts) — a missing key is a
 * compile error, not something a test needs to catch. What that type can't
 * see inside a string value: whether a translation kept the same
 * `{{placeholder}}` tokens as the English original. Drop one in translation
 * and the app doesn't error, it just quietly renders "undefined" — or
 * — worse, the count/date/name — in place of the token nobody caught.
 */

const locales = { en, ru, uz } as const;

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

describe('i18n catalogue consistency', () => {
  it('keeps the same {{placeholder}} set across locales for every shared key', () => {
    const mismatches: string[] = [];

    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const enPlaceholders = placeholders(en[key]);
      if (enPlaceholders.length === 0) continue;

      for (const [localeName, catalogue] of Object.entries(locales)) {
        if (localeName === 'en') continue;
        const value = (catalogue as Record<string, string>)[key];
        const gotPlaceholders = placeholders(value);
        if (gotPlaceholders.join(',') !== enPlaceholders.join(',')) {
          mismatches.push(
            `${localeName}['${key}']: expected {{${enPlaceholders.join('}}, {{')}}}, got {{${gotPlaceholders.join('}}, {{')}}}`
          );
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('has no keys in ru/uz that en does not also define in some form', () => {
    // Extra keys ARE allowed (LocaleCatalogue = Catalogue & Record<string, string>) —
    // that's what lets Russian's four-category plurals (_few, _many) exist
    // alongside English's two. What this catches is a key that isn't an
    // english key, and isn't a plural variant of one either — almost always
    // a typo or a leftover from a rename.
    const enKeys = new Set(Object.keys(en));
    const suffixes = ['_one', '_few', '_many', '_other'];

    for (const [localeName, catalogue] of Object.entries({ ru, uz })) {
      const unexplained = Object.keys(catalogue).filter((key) => {
        if (enKeys.has(key)) return false;
        const base = suffixes.reduce((k, suffix) => (k.endsWith(suffix) ? k.slice(0, -suffix.length) : k), key);
        return !enKeys.has(base) && !suffixes.some((suffix) => enKeys.has(base + suffix));
      });

      expect(unexplained, `${localeName} has unexplained extra keys`).toEqual([]);
    }
  });
});
