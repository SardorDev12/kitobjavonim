import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

import { Text } from './ui';

/**
 * Native has no equivalent of the browser's online/offline events without
 * adding @react-native-community/netinfo — a real native dependency that
 * needs an actual device or simulator to verify works, neither of which is
 * available here. Web-only for now: always "online" elsewhere, so the
 * banner simply never renders off web rather than guessing at native
 * connectivity and risking a false "you're offline" on a device that
 * isn't.
 */
function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(Platform.OS !== 'web' || navigator.onLine);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

/**
 * A save attempted while offline still fails with a network error (the
 * request has nowhere to go) — this doesn't change that, it just makes
 * "why" obvious before the user even tries, rather than after a confusing
 * failure. Absolutely positioned so it overlays every screen without
 * reflowing layouts that already manage their own safe-area insets.
 */
export function OfflineBanner() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top,
        left: 0,
        right: 0,
        zIndex: 100,
        alignItems: 'center',
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.warningSoft,
      }}
    >
      <Text variant="caption" color="warning">
        {t('error.offline')}
      </Text>
    </View>
  );
}
