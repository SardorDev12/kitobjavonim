/**
 * Compares two `major.minor.patch` version strings.
 *
 * Only as much semver as this app actually uses — no pre-release tags, no
 * build metadata, since app.config.js's `version` never carries either.
 * Deliberately not a string comparison: "0.9.0" must sort before "0.10.0",
 * which a plain `<` on the strings gets backwards.
 *
 * A non-numeric or missing segment reads as 0, so a malformed value (a typo
 * in app_config, say) degrades to "no update needed" rather than throwing —
 * this only ever gates an optional, dismissible prompt, never a hard block.
 */
export function isVersionOlder(current: string, latest: string): boolean {
  // Explicitly indexed rather than destructured off however many segments
  // `.split('.')` happened to find — a value with fewer than 3 (a bare
  // "not-a-version", with none at all) would otherwise leave the missing
  // positions `undefined` instead of 0, and `undefined < n` is always
  // false regardless of n, silently breaking the "malformed reads as
  // older" guarantee this exists for.
  const parse = (v: string) => {
    const parts = v.split('.');
    return [0, 1, 2].map((i) => Number.parseInt(parts[i] ?? '', 10) || 0);
  };

  const [cMajor, cMinor, cPatch] = parse(current);
  const [lMajor, lMinor, lPatch] = parse(latest);

  if (cMajor !== lMajor) return cMajor < lMajor;
  if (cMinor !== lMinor) return cMinor < lMinor;
  return cPatch < lPatch;
}
