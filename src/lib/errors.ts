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
  report_limit_reached: 'error.reportLimitReached',
};

/**
 * The browser/RN fetch implementation's own wording for "the request never
 * reached anywhere" — Chrome says "Failed to fetch", Firefox "NetworkError
 * when attempting to fetch resource", Safari "Load failed", React Native's
 * polyfill "Network request failed". None of these are a token this app
 * raises itself, so they can't join KNOWN_ERRORS' exact-match lookup —
 * matched by substring instead, case-insensitively.
 */
const NETWORK_FAILURE_PATTERNS = [/failed to fetch/i, /network ?error/i, /network request failed/i, /load failed/i];

export function describeError(cause: unknown, t: (key: MessageKey) => string): string {
  const message = cause instanceof Error ? cause.message : undefined;
  if (!message) return t('error.generic');

  const knownKey = KNOWN_ERRORS[message];
  if (knownKey) return t(knownKey);

  if (NETWORK_FAILURE_PATTERNS.some((pattern) => pattern.test(message))) return t('error.network');

  return message;
}
