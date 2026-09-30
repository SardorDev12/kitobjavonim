import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { EmptyState, LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { completeTelegramOidc } from '@/features/auth/telegramOidc';
import { useI18n } from '@/lib/i18n';

/**
 * Where Telegram's OpenID Connect login sends the user back to — as a deep
 * link (`homelibrary://auth/telegram-oidc?code=...`) on native, straight from
 * the Telegram app's own sign-in sheet, or as a normal page load on web. See
 * src/features/auth/telegramOidc.ts for the whole flow.
 */
export default function TelegramOidcScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const { code, state, error: oauthError, error_description: errorDescription } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  }>();

  useEffect(() => {
    // A session already in place means there's nothing left to finish; the
    // root guard moves the user on from here.
    if (session || started.current) return;
    started.current = true;

    completeTelegramOidc({ code, state, error: oauthError, error_description: errorDescription })
      .then((outcome) => {
        // 'signed-in' needs nothing: the new session is what moves the root
        // guard off this screen. 'cancelled' and 'already-handled' (the other
        // delivery of a browser-fallback redirect is finishing it) go back to
        // sign-in, which the guard then skips past if that other one succeeds.
        if (outcome !== 'signed-in') router.replace('/(auth)/sign-in');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : t('error.generic'));
      });
  }, [session, code, state, oauthError, errorDescription, router, t]);

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
