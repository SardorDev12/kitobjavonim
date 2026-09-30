import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, EmptyState, Screen, Text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

/**
 * Finishes a native Telegram sign-in — nothing else.
 *
 * This page used to also host the Telegram Login Widget itself, but nothing
 * navigates here to do that anymore: the app now deep-links straight into
 * the Telegram app (`https://t.me/<bot>?start=...`), and
 * `telegram-bot-webhook` gets the login button in front of the user from
 * inside a chat with the bot instead. See that function's README and
 * `src/features/auth/providers.ts`'s `signInWithTelegram`.
 *
 * What's left is the one piece that page never replaced: `telegram-auth`'s
 * Edge Function can't redirect a completed native sign-in straight into
 * `homelibrary://...` — Android's Chrome won't follow a server-issued
 * redirect into a non-http scheme without a fresh user gesture, and a
 * same-document JS navigation is the only thing that carries one. That needs
 * real HTML to run in, which this page (on the app's own web origin, which
 * is also the domain BotFather has bound) still provides. So the Edge
 * Function bounces a finished native sign-in back through here — now
 * carrying `token_hash`/`error_description` — and this page's only job is
 * relaying that one hop further, into the app's own scheme.
 */
export default function TelegramLoginScreen() {
  const { redirect_to: redirectTo, token_hash: tokenHash, type, error_description: errorDescription } =
    useLocalSearchParams<{ redirect_to?: string; token_hash?: string; type?: string; error_description?: string }>();
  const theme = useTheme();
  const { t } = useI18n();

  const isFinishing = Boolean(redirectTo && (tokenHash || errorDescription));

  function nativeTarget(): string {
    const target = new URL(redirectTo!);
    if (tokenHash) target.searchParams.set('token_hash', tokenHash);
    if (type) target.searchParams.set('type', type);
    if (errorDescription) target.searchParams.set('error_description', errorDescription);
    return target.toString();
  }

  useEffect(() => {
    if (Platform.OS !== 'web' || !isFinishing) return;
    globalThis.location.replace(nativeTarget());
    // nativeTarget reads redirectTo/tokenHash/type/errorDescription directly —
    // those are exactly this effect's real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo, tokenHash, type, errorDescription, isFinishing]);

  if (!isFinishing) {
    // Reachable only if this page is opened directly with neither param — an
    // old bookmark, a stale link. Nothing legitimate lands here that way.
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
