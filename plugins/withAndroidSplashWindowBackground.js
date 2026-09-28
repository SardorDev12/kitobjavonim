const { withAndroidColors, withAndroidColorsNight, withAndroidStyles, AndroidConfig } = require('expo/config-plugins');

const COLOR_NAME = 'windowBackground';

/**
 * Confirmed by running `expo prebuild` and reading the generated resources
 * directly: expo-splash-screen's own Android plugin (withAndroidSplashStyles)
 * hardcodes `postSplashScreenTheme` to `@style/AppTheme` — the app's *real*
 * activity theme, taking over the instant Android's own splash-screen system
 * decides it's done. AppTheme (from the base template) never sets its own
 * `android:windowBackground`, so it falls through to AppCompat's stock
 * default (plain white in light mode, near-black in dark) for however long
 * it takes React Native to actually mount and paint its first frame on top
 * of it — a real, visible flash of the wrong color between the (correctly
 * themed) splash screen and the app's own content, on every cold launch.
 *
 * No app.config.js field reaches this (expo-splash-screen's own config only
 * covers its own splash theme, not the one control passes to afterward), so
 * this patches AppTheme directly at prebuild time — same color values as
 * the splash screen's own backgroundColor/dark.backgroundColor, so there is
 * nothing left to flash to in that gap.
 */
function withAndroidSplashWindowBackground(config, { light, dark }) {
  config = withAndroidColors(config, (config) => {
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, {
      value: light,
      name: COLOR_NAME,
    });
    return config;
  });

  config = withAndroidColorsNight(config, (config) => {
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, {
      value: dark,
      name: COLOR_NAME,
    });
    return config;
  });

  config = withAndroidStyles(config, (config) => {
    config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
      add: true,
      value: `@color/${COLOR_NAME}`,
      name: 'android:windowBackground',
      parent: AndroidConfig.Styles.getAppThemeGroup(),
    });
    return config;
  });

  return config;
}

module.exports = withAndroidSplashWindowBackground;
