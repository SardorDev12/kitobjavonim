import { getCrashlytics, log, recordError } from '@react-native-firebase/crashlytics';

/**
 * Wrapped in try/catch on purpose: this app ships JS-only updates over the
 * air (see .github/workflows/eas-update.yml), and an OTA update can reach a
 * device running a native binary built before Crashlytics was linked in —
 * or before google-services.json/GoogleService-Info.plist existed at all.
 * On a device like that, the native module isn't there, and calling
 * getCrashlytics() throws. Reporting a crash must never be the thing that
 * causes one; this makes that failure mode silent instead.
 */
export function recordCrash(error: Error, context?: string) {
  try {
    const instance = getCrashlytics();
    if (context) log(instance, context);
    recordError(instance, error);
  } catch {
    // Firebase not linked into this binary yet — nothing to do.
  }
}
