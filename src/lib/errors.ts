import type { MessageKey } from '@/lib/i18n';

/**
 * Maps the plain-text tokens the freemium-limit triggers raise
 * (supabase/migrations/0008_plans_and_limits.sql) to a translated,
 * user-facing message. Falls back to the raw error message, then to
 * error.generic, matching the convention every other screen already uses.
 */
const KNOWN_ERRORS: Record<string, MessageKey> = {
  listing_limit_reached: 'error.listingLimitReached',
  contact_limit_reached: 'error.contactLimitReached',
};

export function describeError(cause: unknown, t: (key: MessageKey) => string): string {
  const message = cause instanceof Error ? cause.message : undefined;
  const knownKey = message ? KNOWN_ERRORS[message] : undefined;
  if (knownKey) return t(knownKey);
  return message || t('error.generic');
}
