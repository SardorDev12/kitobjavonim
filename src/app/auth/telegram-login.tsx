import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { EmptyState, LoadingState, Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const BOT_USERNAME = (process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '').trim();

/** How long to wait for the bot to confirm before giving up. */
const CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;

/** How often to poll as a fallback alongside the Realtime subscription. */
const POLL_INTERVAL_MS = 2000;

type Phase = 'starting' | 'ready' | 'waiting' | 'confirming' | 'timedOut' | 'error' | 'notConfigured';

type PendingSession = {
  token: string;
  telegramUrl: string;
};

/**
 * Bot deep-link Telegram sign-in — see
 * supabase/functions/telegram-bot-webhook/README.md for the full mechanism
 * and why this replaced the Login Widget.
 *
 * The token is fetched up front (during "starting") so that tapping "Open
 * Telegram" can call Linking.openURL as the very first thing that happens
 * in that tap's own handler, with no `await` before it. That matters on
 * web specifically: a browser's popup blocker allows window.open only
 * inside the synchronous call stack of a real user gesture, and an await
 * beforehand (e.g. creating the session row on tap) breaks that chain on
 * Safari in particular.
 */
export default function TelegramLoginScreen() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>(BOT_USERNAME ? 'starting' : 'notConfigured');
  const [session, setSession] = useState<PendingSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cancelWaitRef = useRef<() => void>(() => {});

  const createSession = useCallback(async () => {
    setPhase('starting');
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.from('telegram_login_sessions').insert({}).select('token').single();
      if (error || !data) throw error ?? new Error(t('error.generic'));

      const token = data.token as string;
      setSession({ token, telegramUrl: `https://t.me/${BOT_USERNAME}?start=${token}` });
      setPhase('ready');
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : t('error.generic'));
      setPhase('error');
    }
  }, [t]);

  useEffect(() => {
    if (BOT_USERNAME) createSession();
    return () => cancelWaitRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openTelegram() {
    if (!session) return;
    // First statement, no await before it — see the class comment above.
    Linking.openURL(session.telegramUrl);

    setPhase('waiting');
    const tokenHash = await waitForConfirmation(session.token, (cancel) => {
      cancelWaitRef.current = cancel;
    });

    if (!tokenHash) {
      setPhase('timedOut');
      return;
    }

    setPhase('confirming');
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (error) {
      setErrorMessage(error.message);
      setPhase('error');
      return;
    }

    // The root layout's own auth-state listener redirects into the app from
    // here; this is just a fallback in case this screen is still on top a
    // moment later.
    router.back();
  }

  if (phase === 'notConfigured') {
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

  if (phase === 'starting' || phase === 'confirming') {
    return (
      <Screen>
        <LoadingState label={phase === 'confirming' ? t('auth.telegramConfirming') : t('common.loading')} />
      </Screen>
    );
  }

  if (phase === 'ready') {
    return (
      <Screen>
        <EmptyState
          icon="paper-plane-outline"
          title={t('auth.telegramReadyTitle')}
          body={t('auth.telegramReadyBody')}
          actionLabel={t('auth.telegramOpenButton')}
          onAction={openTelegram}
        />
      </Screen>
    );
  }

  if (phase === 'waiting') {
    return (
      <Screen>
        <EmptyState
          icon="paper-plane-outline"
          title={t('auth.telegramWaitingTitle')}
          body={t('auth.telegramWaitingBody')}
          actionLabel={t('auth.telegramReopenButton')}
          onAction={openTelegram}
        />
      </Screen>
    );
  }

  if (phase === 'timedOut') {
    return (
      <Screen>
        <EmptyState
          title={t('auth.telegramTimedOutTitle')}
          body={t('auth.telegramTimedOutBody')}
          actionLabel={t('auth.telegramRetryButton')}
          onAction={createSession}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <EmptyState
        tone="error"
        title={t('error.generic')}
        body={errorMessage ?? undefined}
        actionLabel={t('auth.telegramRetryButton')}
        onAction={createSession}
      />
    </Screen>
  );
}

/**
 * Resolves with the confirmed session's token_hash, or null on timeout.
 * `onCancel` is handed a function the caller can invoke to unsubscribe
 * early (e.g. on unmount) without waiting out the full timeout.
 */
function waitForConfirmation(token: string, onCancel: (cancel: () => void) => void): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
      resolve(value);
    };

    onCancel(() => finish(null));

    const timeoutTimer = setTimeout(() => finish(null), CONFIRM_TIMEOUT_MS);

    const checkRow = (row?: { status: string; token_hash: string | null } | null) => {
      if (row?.status === 'confirmed' && row.token_hash) finish(row.token_hash);
    };

    const channel = supabase
      .channel(`telegram-login-${token}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'telegram_login_sessions', filter: `token=eq.${token}` },
        (payload) => checkRow(payload.new as never)
      )
      .subscribe();

    // Realtime is the fast path; this poll is a fallback in case it's ever
    // misconfigured for an environment, so sign-in degrades to "a couple
    // seconds slower" rather than "hangs until the timeout."
    const pollTimer = setInterval(async () => {
      const { data } = await supabase
        .from('telegram_login_sessions')
        .select('status, token_hash')
        .eq('token', token)
        .maybeSingle();
      checkRow(data);
    }, POLL_INTERVAL_MS);
  });
}
