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

/**
 * A dismissible "get the app" nudge shown only on the web build — anyone
 * reaching the site through a browser already has everything the native
 * app offers except being able to install it, so this is a growth prompt,
 * not a feature gate. Unlike UpdateAvailableModal's per-version dismissal
 * (there's a new version to re-prompt for), there's nothing here to change
 * later, so dismissing it is remembered for good — it only ever interrupts
 * a visitor once.
 */
export function InstallAppPrompt() {
  const theme = useTheme();
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((value) => setDismissed(value === 'true'))
      .finally(() => setLoaded(true));
  }, []);

  const shouldShow = Platform.OS === 'web' && loaded && !dismissed;

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
