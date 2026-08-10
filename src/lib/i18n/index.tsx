import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { en, type MessageKey } from './locales/en';
import { ru } from './locales/ru';
import { uz } from './locales/uz';
import type { LocaleCatalogue } from './locales/types';

export type Locale = 'uz' | 'ru' | 'en';

export const LOCALES: readonly Locale[] = ['uz', 'ru', 'en'] as const;

export const LOCALE_LABELS: Record<Locale, string> = {
  uz: 'Oʻzbekcha',
  ru: 'Русский',
  en: 'English',
};

const catalogues: Record<Locale, LocaleCatalogue> = { uz, ru, en };

const STORAGE_KEY = 'settings.locale';

export type TranslateParams = Record<string, string | number> & { count?: number };

/**
 * Resolves a message, picking a plural form when `count` is present.
 *
 * Russian distinguishes one/few/many, Uzbek distinguishes nothing, English
 * distinguishes one/other. Rather than encode those rules here, ask
 * Intl.PluralRules for the category and look for a `key_<category>` entry,
 * falling back to `key_other` and then the bare key.
 */
export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const catalogue = catalogues[locale];
  let template: string | undefined;

  if (params?.count !== undefined) {
    const category = pluralCategory(locale, params.count);
    template = catalogue[`${key}_${category}`] ?? catalogue[`${key}_other`];
  }

  template ??= catalogue[key] ?? en[key] ?? key;

  if (!params) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match
  );
}

function pluralCategory(locale: Locale, count: number): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    // Hermes can be built without full ICU data for every locale; the English
    // rule is a safe stand-in because `_other` always exists as a fallback.
    return count === 1 ? 'one' : 'other';
  }
}

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
  /** True until the stored preference has been read, so nothing flashes in the wrong language. */
  ready: boolean;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Uzbek unconditionally, not the device's reported language. Following the
  // browser/OS locale sounds friendlier but back-fires here: plenty of Uzbek
  // speakers run their phone or browser in English, and a Cyrillic Uzbek user
  // agent doesn't reliably map to 'ru' either — the safe default for a product
  // that launches in Uzbekistan is Uzbek, full stop, until the visitor picks
  // something else themselves.
  const [locale, setLocaleState] = useState<Locale>('uz');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored && LOCALES.includes(stored as Locale)) setLocaleState(stored as Locale);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      ready,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale, ready]
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nValue {
  const value = use(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

/** Convenience for the common case of only needing `t`. */
export function useTranslate() {
  return useI18n().t;
}

export type { MessageKey };
