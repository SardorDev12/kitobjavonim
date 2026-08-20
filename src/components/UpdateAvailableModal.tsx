import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { runtimeVersion } from 'expo-updates';
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useLatestAndroidVersion } from '@/lib/queries/appConfig';
import { isVersionOlder } from '@/lib/version';
import { useTheme } from '@/theme';

const DISMISSED_KEY = 'home-library.update-prompt-dismissed-version';

// android.package in app.config.js, duplicated here rather than imported —
// this is the one config value a runtime file can't read directly from a
// build-time config module. Only used as a fallback for the OTA-embedded
// Constants.expoConfig value below, so it only matters if that's ever null.
const FALLBACK_PACKAGE = 'uz.homelibrary.app';

/**
 * A dismissible "a new version is available" prompt shown on launch when
 * the installed native binary is older than app_config's
 * latest_android_version — the gap today's OTA-vs-native-binary crash made
 * obvious: OTA can silently outrun a device's actual binary with no way for
 * the person using it to know that's what's wrong, or what to do about it.
 *
 * `runtimeVersion` (from expo-updates, not app.config.js's own `version`
 * read via Constants) is what's actually installed on this device — OTA
 * updates carry whatever `version` was current at publish time in their own
 * manifest, so Constants.expoConfig?.version would just reflect the latest
 * OTA rather than the binary underneath it. expo-updates is what delivers
 * OTA at all, so it's guaranteed linked in anything capable of running this
 * code — no dynamic-import guard needed, unlike expo-navigation-bar.
 *
 * Dismissal is remembered per latest_android_version value (not "forever"),
 * so bumping that value later re-prompts once rather than nagging every
 * launch or staying silent past the version someone already dismissed.
 */
export function UpdateAvailableModal() {
  const theme = useTheme();
  const { t } = useI18n();
  const { data: latestVersion } = useLatestAndroidVersion();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [dismissedLoaded, setDismissedLoaded] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then(setDismissedVersion)
      .finally(() => setDismissedLoaded(true));
  }, []);

  const shouldShow =
    Platform.OS === 'android' &&
    dismissedLoaded &&
    !!runtimeVersion &&
    !!latestVersion &&
    isVersionOlder(runtimeVersion, latestVersion) &&
    dismissedVersion !== latestVersion;

  if (!shouldShow) return null;

  function dismiss() {
    // shouldShow already guarded latestVersion truthy — this can only run
    // while it's still showing, so it's always a real value here.
    void AsyncStorage.setItem(DISMISSED_KEY, latestVersion!);
    setDismissedVersion(latestVersion!);
  }

  function update() {
    const packageName = Constants.expoConfig?.android?.package ?? FALLBACK_PACKAGE;
    void Linking.openURL(`https://play.google.com/store/apps/details?id=${packageName}`);
  }

  return (
    <Sheet visible onClose={dismiss} title={t('update.available')}>
      <View style={{ gap: theme.spacing.lg }}>
        <Text variant="body" color="textMuted">
          {t('update.availableBody')}
        </Text>
        <Button title={t('update.updateNow')} fullWidth onPress={update} />
        <Button title={t('update.notNow')} variant="ghost" fullWidth onPress={dismiss} />
      </View>
    </Sheet>
  );
}
