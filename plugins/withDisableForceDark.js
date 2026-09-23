const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Android 10+ (API 29+) has a system-level "Force Dark" that can rewrite an
 * individual view's colors on its own, per-view luminance heuristic,
 * independent of anything this app's own light/dark theme actually does.
 * MIUI applies it more aggressively than stock Android — confirmed on a
 * Redmi Note 9S tester's phone, where the Library screen's title and the
 * empty-state title (the only two Text elements on that screen using the
 * theme's plain, near-black default `text` color rather than an explicitly
 * lighter one like `textMuted`) got flipped to near-white and became
 * nearly invisible against the still-light background, while every other,
 * already-lighter text color on the same screen stayed under whatever
 * threshold triggers the rewrite. The app never opts into system dark mode
 * here — this is the OS doing it unasked.
 *
 * android:forceDarkAllowed="false" on the <application> tag opts the whole
 * app out of it. No app.config.js field covers this directly (it's not
 * something `userInterfaceStyle`/expo-navigation-bar control), so it has
 * to go through a manifest edit at prebuild time.
 */
function withDisableForceDark(config) {
  return withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.$['android:forceDarkAllowed'] = 'false';
    return config;
  });
}

module.exports = withDisableForceDark;
