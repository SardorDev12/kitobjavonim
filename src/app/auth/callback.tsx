import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { EmptyState, LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { completeFromUrl, redirectUri } from '@/features/auth/providers';
import { useI18n } from '@/lib/i18n';

/**
 * Where every sign-in provider comes back to.
 *
 * On web, supabase-js has usually already consumed the tokens by the time this
 * renders — `detectSessionInUrl` runs at client construction. But a password
 * recovery link and the Telegram function both arrive as a `token_hash` in the
 * query string, which nothing consumes automatically, so this screen finishes
 * those by hand.
 *
 * On native, Google/Apple still complete via `signInWithOAuth`'s own auth
 * session before its browser sheet even closes — this screen never sees
 * those. Telegram is different: since it deep-links straight into the
 * Telegram app instead of an auth session this app is waiting on
 * (src/features/auth/providers.ts), the only way back is this screen being
 * opened as an ordinary deep link once Telegram (by way of
 * telegram-auth/callback and the telegram-login.tsx bounce page) redirects
 * into `homelibrary://auth/callback?token_hash=...`. Expo Router parses that
 * straight into this screen's own params, which is what the branch below
 * reads instead of a URL string.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const params = useLocalSearchParams<{ token_hash?: string; type?: string; error_description?: string }>();

  useEffect(() => {
    // A session already in place means the redirect was handled for us; the root
    // guard will move the user on to the tabs.
    if (session) return;

    if (Platform.OS !== 'web') {
      if (!params.token_hash && !params.error_description) return;

      const url = new URL(redirectUri());
      if (params.token_hash) url.searchParams.set('token_hash', params.token_hash);
      if (params.type) url.searchParams.set('type', params.type);
      if (params.error_description) url.searchParams.set('error_description', params.error_description);

      completeFromUrl(url.toString()).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : t('error.generic'));
      });
      return;
    }

    const url = globalThis.location?.href;
    if (!url) return;

    const hasPayload = /[?#].*(access_token|code=|token_hash=|error_description=)/.test(url);
    if (!hasPayload) {
      router.replace('/(auth)/sign-in');
      return;
    }

    completeFromUrl(url).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    });
    // params is read directly (token_hash/type/error_description) rather than
    // listed whole, since useLocalSearchParams returns a new object identity
    // on every render regardless of whether its values actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, router, t, params.token_hash, params.type, params.error_description]);

  if (error) {
    return (
      <Screen>
        <EmptyState
          tone="error"
          title={t('auth.signIn')}
          body={error}
          actionLabel={t('common.retry')}
          onAction={() => router.replace('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <LoadingState label={t('common.loading')} />
    </Screen>
  );
}
