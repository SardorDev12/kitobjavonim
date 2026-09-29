import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

const DISMISSED_KEY = 'home-library.install-app-prompt-dismissed';

// android.package in app.config.js, duplicated here rather than imported —
// same reasoning as UpdateAvailableModal's own FALLBACK_PACKAGE: a runtime
// file can't read a build-time config module directly, and
// Constants.expoConfig can still be null this early.
const FALLBACK_PACKAGE = 'uz.homelibrary.app';

// There is no published iOS App Store listing (the iOS build exists only for
// Apple Sign In compliance, see providers.ts) — the only place to send anyone
// is Play Store, so this only ever makes sense on Android's mobile browser.
// Desktop Chrome/Firefox/Safari and iOS Safari all matched the old
// `Platform.OS === 'web'` check just as much as an Android phone did, which is
// why it was showing up on laptops too.
function isAndroidMobileWeb(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent ?? '');
}

/**
 * A dismissible "get the app" nudge shown only on Android's mobile web build —
 * anyone reaching the site through a phone browser already has everything the
 * native app offers except being able to install it, so this is a growth
 * prompt, not a feature gate. Unlike UpdateAvailableModal's per-version
 * dismissal (there's a new version to re-prompt for), there's nothing here to
 * change later, so dismissing it is remembered for good — it only ever
 * interrupts a visitor once.
 */
export function InstallAppPrompt() {
  const theme = useTheme();
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);

  useEffect(() => {
    if (!isAndroidMobileWeb()) return;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((value) => setDismissed(value === 'true'))
      .finally(() => setLoaded(true));

    // Feature-detected and best-effort: Chrome only reports a related app as
    // installed once the site's manifest declares `related_applications` AND
    // the app itself verifies ownership of the site via Digital Asset Links
    // (a /.well-known/assetlinks.json on this domain, signed with the Play
    // Store build's real certificate fingerprint) — neither exists yet, so
    // this resolves to an empty list today and the prompt still shows. It's
    // left in so the "app installed but still asked to install" report gets
    // fixed the moment that manifest/asset-link work lands, without anyone
    // having to remember to come back and add this check then.
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
    nav.getInstalledRelatedApps?.()
      .then((apps) => setAlreadyInstalled(apps.length > 0))
      .catch(() => undefined);
  }, []);

  const shouldShow = isAndroidMobileWeb() && loaded && !dismissed && !alreadyInstalled;

  if (!shouldShow) return null;

  function dismiss() {
    void AsyncStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  function install() {
    const packageName = Constants.expoConfig?.android?.package ?? FALLBACK_PACKAGE;
    void Linking.openURL(`https://play.google.com/store/apps/details?id=${packageName}`);
  }

  return (
    <Sheet visible onClose={dismiss} title={t('installApp.title')}>
      <View style={{ gap: theme.spacing.lg }}>
        <Text variant="body" color="textMuted">
          {t('installApp.body')}
        </Text>
        <Button title={t('installApp.installNow')} fullWidth onPress={install} />
        <Button title={t('installApp.notNow')} variant="ghost" fullWidth onPress={dismiss} />
      </View>
    </Sheet>
  );
}
