import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

import { EmptyState, LoadingState, Screen, Text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

const BOT_USERNAME = (process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '').trim();

/**
 * Hosts the actual Telegram Login Widget — deliberately not the Edge Function.
 *
 * Telegram's widget checks the *embedding page's own domain* against whatever
 * was registered for the bot via BotFather's `/setdomain`, so it has to run
 * somewhere you control. It used to be served straight from the Edge Function,
 * which looked correct in every manual check, right up until a real browser
 * loaded it: Supabase will not return `text/html` from the shared
 * `*.supabase.co` domain on an ordinary GET — it substitutes `text/plain` with
 * `X-Content-Type-Options: nosniff`, so the browser showed raw source instead
 * of a rendered page. See the comment atop `supabase/functions/telegram-auth`
 * for how that was confirmed. Moving the widget here, onto the app's own
 * domain, is the actual fix — an Edge Function was never the right place for
 * it to live.
 *
 * `data-auth-url` still points at the Edge Function's `/callback`, which is
 * unaffected: it returns a redirect with no body, and the restriction above
 * only bites on a `text/html` response.
 */
export default function TelegramLoginScreen() {
  const { redirect_to: redirectTo } = useLocalSearchParams<{ redirect_to?: string }>();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const { t } = useI18n();

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const callbackUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/telegram-auth/callback` : null;

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current) return;
    if (!BOT_USERNAME || !callbackUrl || !redirectTo) return;

    const authUrl = `${callbackUrl}?redirect_to=${encodeURIComponent(redirectTo)}`;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-auth-url', authUrl);
    script.setAttribute('data-request-access', 'write');
    containerRef.current.appendChild(script);

    // The widget script swaps the container's contents for an iframe on load;
    // nothing else mounts here, so there is nothing further to clean up.
  }, [callbackUrl, redirectTo]);

  if (!BOT_USERNAME || !callbackUrl) {
    return (
      <Screen>
        <EmptyState
          tone="error"
          title={t('auth.telegramNotConfigured')}
          body={t('auth.telegramNotConfiguredBody')}
        />
      </Screen>
    );
  }

  if (!redirectTo) {
    return (
      <Screen>
        <EmptyState tone="error" title={t('error.generic')} />
      </Screen>
    );
  }

  if (Platform.OS !== 'web') {
    // Reached only inside the native in-app browser sheet, which renders real
    // HTML from this same route once it loads — this covers the instant before
    // that happens.
    return (
      <Screen>
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg }}>
        <Text variant="body" color="textMuted">
          {t('auth.telegramConfirm')}
        </Text>
        {/* React Native Web forwards a View's ref to the underlying DOM node,
            so this ref is safe to use as a real container for the widget's
            injected <script>, even though View's public ref type does not say so. */}
        <View ref={containerRef as never} />
      </View>
    </Screen>
  );
}
