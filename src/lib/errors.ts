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

/**
 * postgrest-js only wraps HTTP-level failures in a real `PostgrestError`
 * (which extends `Error`). A failure below that — the fetch itself
 * rejecting, e.g. no connectivity — is caught internally and returned as a
 * plain `{ message, details, hint, code }` object instead (see its
 * PostgrestBuilder: "JS allows throwing any value ... instanceof Error is
 * too narrow here"). Duck-type the message so those don't fall through to
 * the generic fallback and hide a network failure as an opaque error.
 */
function extractMessage(cause: unknown): string | undefined {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'object' && cause !== null && typeof (cause as { message?: unknown }).message === 'string') {
    return (cause as { message: string }).message;
  }
  return undefined;
}

export function describeError(cause: unknown, t: (key: MessageKey) => string): string {
  const message = extractMessage(cause);
  if (!message) return t('error.generic');

  const knownKey = KNOWN_ERRORS[message];
  if (knownKey) return t(knownKey);

  if (NETWORK_FAILURE_PATTERNS.some((pattern) => pattern.test(message))) return t('error.network');

  return message;
}
