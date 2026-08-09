import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { EmptyState, LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { completeFromUrl } from '@/features/auth/providers';
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
 * On native this is reached only as a deep link; `signInWithOAuth` normally
 * completes the exchange itself before the browser sheet closes.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A session already in place means the redirect was handled for us; the root
    // guard will move the user on to the tabs.
    if (session) return;

    if (Platform.OS !== 'web') return;

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
  }, [session, router, t]);

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
