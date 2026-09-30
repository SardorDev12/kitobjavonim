import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, EmptyState, LoadingState, Screen, Text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

/**
 * Two jobs, both about the same domain constraint: this page runs on
 * whatever web origin BotFather's `/setdomain` is bound to, which is the one
 * thing Telegram actually checks a `login_url` button's own `url` against —
 * confirmed the hard way, by a real `BOT_DOMAIN_INVALID` error when
 * `telegram-bot-webhook` first pointed a button straight at the Edge
 * Function's `*.supabase.co` address instead. So `telegram-bot-webhook`
 * points every `login_url` button here instead, and this page is what's
 * actually reached both before AND after verification:
 *
 * 1. **Before** — Telegram opens this page with the signed payload
 *    (`id`/`hash`/`auth_date`/...) appended to the `redirect_to`/`origin` the
 *    button already carried. Nothing here can safely verify that — the HMAC
 *    key is the bot token, which never reaches a web page — so this just
 *    forwards the whole query string on to `telegram-auth/callback`, unread.
 * 2. **After** — for a native sign-in, `telegram-auth` can't redirect
 *    straight into `homelibrary://...` (Android's Chrome won't follow a
 *    server-issued redirect into a non-http scheme without a fresh user
 *    gesture, and a same-document JS navigation is the only thing that
 *    carries one), so it bounces back through here — this time carrying
 *    `token_hash`/`error_description` instead of a raw payload — and this
 *    page's job is relaying that one hop further, into the app's own scheme.
 *
 * Web sign-ins skip step 2 entirely: `redirect_to` for web is already a
 * plain `https://` URL (`/auth/callback`), so `telegram-auth` redirects
 * straight there with no bounce needed.
 */
export default function TelegramLoginScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const { redirect_to: redirectTo, token_hash: tokenHash, type, error_description: errorDescription, id, hash } =
    params;
  const theme = useTheme();
  const { t } = useI18n();

  const isFinishing = Boolean(redirectTo && (tokenHash || errorDescription));
  // Telegram's own signed fields, not yet verified — id and hash are always
  // present together in a genuine payload (see telegram-auth/index.ts).
  const isForwarding = Boolean(redirectTo && id && hash && !isFinishing);

  function nativeTarget(): string {
    const target = new URL(redirectTo!);
    if (tokenHash) target.searchParams.set('token_hash', tokenHash);
    if (type) target.searchParams.set('type', type);
    if (errorDescription) target.searchParams.set('error_description', errorDescription);
    return target.toString();
  }

  function verificationTarget(): string {
    // Forwarded as-is: telegram-auth/callback already separates redirect_to
    // and origin from everything else and treats the rest as the payload
    // (see handleCallback), so there's nothing to reassemble here.
    const target = new URL(`${SUPABASE_URL}/functions/v1/telegram-auth/callback`);
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') target.searchParams.set(key, value);
    }
    return target.toString();
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isFinishing) {
      globalThis.location.replace(nativeTarget());
    } else if (isForwarding) {
      globalThis.location.replace(verificationTarget());
    }
    // nativeTarget/verificationTarget read the relevant params directly —
    // params itself is a new object every render regardless of content, so
    // listing it whole would re-fire this on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo, tokenHash, type, errorDescription, id, hash, isFinishing, isForwarding]);

  if (isForwarding) {
    // location.replace above fires on mount; this is only what shows for the
    // brief moment before it does. No manual fallback button here the way
    // the finishing branch below has one — if this redirect is blocked,
    // there's no user-facing choice to offer, since the only destination is
    // the verification step, not a final answer.
    return (
      <Screen>
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  if (!isFinishing) {
    // Reachable only if this page is opened directly with none of the above
    // params — an old bookmark, a stale link. Nothing legitimate lands here
    // that way.
    return (
      <Screen>
        <EmptyState tone="error" title={t('error.generic')} />
      </Screen>
    );
  }

  // location.replace above fires on mount; this is only what shows for the
  // instant before it does, and as a fallback if that navigation is itself
  // blocked (mirroring the Edge Function's own manual-link fallback).
  const isError = Boolean(errorDescription);
  return (
    <Screen>
      <View style={[styles.finishing, { padding: theme.spacing.xl, gap: theme.spacing.md }]}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: isError ? theme.colors.dangerSoft : theme.colors.successSoft,
              borderRadius: theme.radius.pill,
            },
          ]}
        >
          <Ionicons
            name={isError ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            size={34}
            color={isError ? theme.colors.danger : theme.colors.success}
          />
        </View>

        <Text variant="heading" align="center">
          {isError ? t('auth.telegramErrorTitle') : t('auth.telegramSuccessTitle')}
        </Text>

        {isError ? (
          <Text variant="body" color="textMuted" align="center" style={styles.finishingBody}>
            {errorDescription}
          </Text>
        ) : null}

        <Button
          title={t('auth.telegramContinue')}
          onPress={() => globalThis.location.assign(nativeTarget())}
          variant={isError ? 'secondary' : 'primary'}
          // Button sets alignSelf: 'flex-start' internally whenever it isn't
          // fullWidth, which wins over this container's own alignItems:
          // 'center' — has to be overridden here explicitly (same as EmptyState).
          style={{ marginTop: theme.spacing.sm, alignSelf: 'center' }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  finishing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  finishingBody: { maxWidth: 320 },
});
