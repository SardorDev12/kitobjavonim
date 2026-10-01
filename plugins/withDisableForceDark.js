const { withAndroidManifest, withAndroidStyles, AndroidConfig } = require('expo/config-plugins');

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
 *
 * The same attribute is also set on the two *themes* a launch actually uses:
 * Theme.App.SplashScreen (the window Android draws before any app code runs)
 * and AppTheme (what it hands over to). The application-level flag evidently
 * wasn't enough for the splash: on a POCO with MIUI/HyperOS's own "dark mode
 * for all apps" on, the splash still came up dark on every cold start even
 * though the generated resources hold a single light colour and no dark
 * variant at all. Declaring it per theme is the documented way to exclude a
 * window from forced dark. Must be listed *before* expo-splash-screen in
 * app.config.js, since mods run in reverse and that plugin rewrites its own
 * style group wholesale.
 */
function withDisableForceDark(config) {
  config = withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.$['android:forceDarkAllowed'] = 'false';
    return config;
  });

  return withAndroidStyles(config, (config) => {
    for (const parent of [AndroidConfig.Styles.getAppThemeGroup(), { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' }]) {
      config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
        add: true,
        value: 'false',
        name: 'android:forceDarkAllowed',
        parent,
      });
    }
    return config;
  });
}

module.exports = withDisableForceDark;
