/**
 * Web build — Crashlytics has no web SDK, so this is a no-op. See
 * crashReporting.native.ts for the real implementation; Metro picks
 * whichever file matches the platform automatically.
 */
export function recordCrash(_error: Error, _context?: string) {}
