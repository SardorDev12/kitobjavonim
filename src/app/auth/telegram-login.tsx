import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, EmptyState, LoadingState, Screen, Text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

const BOT_USERNAME = (process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '').trim();

/**
 * This app's custom schemes, mapped to their Android package ids — matches
 * `appId`/`scheme` in app.config.js for each variant. Used to target the
 * right app explicitly via an intent:// URL (see toAndroidIntentUrl below)
 * rather than a bare custom-scheme redirect, which Android turns into an
 * "open with" picker whenever more than one installed app claims the same
 * scheme — true today for staging and production alike, since staging only
 * gets its own separate scheme once it's rebuilt.
 */
const ANDROID_PACKAGE_BY_SCHEME: Record<string, string> = {
  'homelibrary:': 'uz.homelibrary.app',
  'homelibrary-staging:': 'uz.homelibrary.app.preview',
};

/**
 * Chrome-on-Android-only syntax for opening a specific installed app by
 * package, bypassing any "open with" picker a bare custom-scheme URL would
 * trigger. Returns null for a scheme this app doesn't recognise, or on any
 * other platform — callers fall back to the plain URL in that case.
 */
function toAndroidIntentUrl(target: string): string | null {
  if (!/Android/i.test(globalThis.navigator?.userAgent ?? '')) return null;

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return null;
  }

  const androidPackage = ANDROID_PACKAGE_BY_SCHEME[parsed.protocol];
  if (!androidPackage) return null;

  const scheme = parsed.protocol.slice(0, -1);
  const rest = target.slice(parsed.protocol.length + 2); // strips "scheme://"
  const fallback = encodeURIComponent(globalThis.location.href);
  return `intent://${rest}#Intent;scheme=${scheme};package=${androidPackage};S.browser_fallback_url=${fallback};end`;
}

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
 * This same page also finishes a native sign-in. `data-auth-url` sends this
 * page's own origin along as `origin`, and for a custom-scheme `redirect_to`
 * the Edge Function bounces back to `${origin}/auth/telegram-login` — i.e.
 * here again, now carrying `token_hash` — instead of redirecting to the
 * custom scheme directly, because Android's Chrome won't follow a
 * server-issued redirect into a non-http scheme without a fresh user
 * gesture. A same-document JS navigation does carry one, but that needs real
 * HTML to run in, which is exactly what the Edge Function's own domain can't
 * serve (see above) — so the final hop happens here instead.
 */
export default function TelegramLoginScreen() {
  const { redirect_to: redirectTo, token_hash: tokenHash, type, error_description: errorDescription } =
    useLocalSearchParams<{ redirect_to?: string; token_hash?: string; type?: string; error_description?: string }>();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = useTheme();
  const { t } = useI18n();

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const callbackUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/telegram-auth/callback` : null;

  // Bounced back after a native sign-in was verified (or failed) — finish the
  // handoff into the app's own custom scheme rather than showing the widget.
  const isFinishingNative = Boolean(redirectTo && (tokenHash || errorDescription));

  function nativeTarget(): string {
    const target = new URL(redirectTo!);
    if (tokenHash) target.searchParams.set('token_hash', tokenHash);
    if (type) target.searchParams.set('type', type);
    if (errorDescription) target.searchParams.set('error_description', errorDescription);
    const plain = target.toString();
    return toAndroidIntentUrl(plain) ?? plain;
  }

  useEffect(() => {
    if (Platform.OS !== 'web' || !isFinishingNative) return;
    globalThis.location.replace(nativeTarget());
    // nativeTarget reads redirectTo/tokenHash/type/errorDescription directly —
    // those are exactly this effect's real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo, tokenHash, type, errorDescription, isFinishingNative]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !containerRef.current) return;
    if (!BOT_USERNAME || !callbackUrl || !redirectTo || isFinishingNative) return;

    const authUrl = `${callbackUrl}?redirect_to=${encodeURIComponent(redirectTo)}&origin=${encodeURIComponent(globalThis.location.origin)}`;

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
  }, [callbackUrl, redirectTo, isFinishingNative]);

  if (isFinishingNative) {
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

          <Text variant="body" color="textMuted" align="center" style={styles.finishingBody}>
            {isError ? errorDescription : t('auth.telegramSuccessBody')}
          </Text>

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

const styles = StyleSheet.create({
  finishing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  finishingBody: { maxWidth: 320 },
});
