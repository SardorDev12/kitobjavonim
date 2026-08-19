import type { MessageKey } from '@/lib/i18n';

/**
 * Maps the plain-text tokens the freemium-limit triggers (0008) and the
 * household RPCs (0015_households.sql) raise to a translated, user-facing
 * message. Falls back to the raw error message, then to error.generic,
 * matching the convention every other screen already uses.
 */
const KNOWN_ERRORS: Record<string, MessageKey> = {
  listing_limit_reached: 'error.listingLimitReached',
  contact_limit_reached: 'error.contactLimitReached',
  report_limit_reached: 'error.reportLimitReached',
  household_already_member: 'household.errorAlreadyMember',
  household_invalid_code: 'household.errorInvalidCode',
  household_owner_only: 'household.errorOwnerOnly',
};

/**
 * The browser/RN fetch implementation's own wording for "the request never
 * reached anywhere" — Chrome says "Failed to fetch", Firefox "NetworkError
 * when attempting to fetch resource", Safari "Load failed", React Native's
 * JS-level polyfill "Network request failed". None of these are a token
 * this app raises itself, so they can't join KNOWN_ERRORS' exact-match
 * lookup — matched by substring instead, case-insensitively.
 *
 * Android's native fetch (OkHttp, under the JS polyfill) doesn't use that
 * wording at all — it prefixes the underlying Java exception's own message,
 * e.g. `fetch failed: java.net.UnknownHostException: Unable to resolve
 * host "…": No address associated with hostname` for no connectivity/DNS,
 * or ConnectException/SocketTimeoutException/SSLException for the others.
 * The exact exception class varies by failure; the `fetch failed:` prefix
 * doesn't, so matching on that instead of enumerating every class name is
 * both simpler and catches ones not seen yet.
 */
const NETWORK_FAILURE_PATTERNS = [
  /failed to fetch/i,
  /network ?error/i,
  /network request failed/i,
  /load failed/i,
  /^fetch failed:/i,
];

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
