const { withGradleProperties } = require('expo/config-plugins');

/**
 * Turns on R8 code shrinking and obfuscation for release builds. Play's
 * "DEX code optimization" check scores how much of the compiled app is
 * obfuscated; at 1% (release 21 / 0.5.5) it flags the app and blocks it from
 * reaching the 25% threshold. Expo's template leaves this off by default.
 *
 * Native change: it only takes effect in a new EAS build, never via OTA.
 */
function withAndroidMinify(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const set = (key, value) => {
      const existing = props.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else props.push({ type: 'property', key, value });
    };
    set('android.enableMinifyInReleaseBuilds', 'true');
    set('android.enableShrinkResourcesInReleaseBuilds', 'true');
    return config;
  });
}

module.exports = withAndroidMinify;
