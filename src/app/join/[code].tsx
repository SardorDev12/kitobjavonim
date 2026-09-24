import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackHeader, Button, Card, LoadingState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { setPendingInviteCode } from '@/features/household/pendingInviteCode';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { useJoinHousehold } from '@/lib/queries/household';
import { useTheme } from '@/theme';

type Status = 'idle' | 'joining' | 'joined' | 'error';

/**
 * The public landing page a shared invite link opens — households.name is
 * RLS-gated to members (is_household_member(id)), so there's nothing to
 * preview here beyond the raw code itself.
 *
 * Someone already signed in and past onboarding joins immediately on
 * landing here. Anyone else gets the code persisted (survives a web OAuth
 * redirect, unlike an in-memory store) and is sent to sign up or sign in;
 * _layout.tsx's own effect finishes the join once they have a session and
 * have completed onboarding, since this screen won't still be mounted by
 * then.
 */
export default function JoinHouseholdScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { code: rawCode } = useLocalSearchParams<{ code: string }>();
  const code = (rawCode ?? '').trim().toUpperCase();
  const { session, initializing, needsOnboarding } = useAuth();
  const joinHousehold = useJoinHousehold();

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || initializing) return;

    if (!session || needsOnboarding) {
      setPendingInviteCode(code);
      return;
    }

    if (status !== 'idle') return;
    setStatus('joining');
    joinHousehold.mutate(code, {
      onSuccess: () => setStatus('joined'),
      onError: (cause) => {
        setError(describeError(cause, t));
        setStatus('error');
      },
    });
    // Meant to fire once, the moment a ready-to-join session shows up — not
    // on every render joinHousehold's own identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, initializing, session, needsOnboarding]);

  if (!code) {
    return (
      <View style={styles.fill}>
        <BackHeader />
        <Screen>
          <Text variant="body" color="danger">
            {t('join.invalidCode')}
          </Text>
        </Screen>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <BackHeader />
      <Screen scroll>
        <View style={[styles.container, { gap: theme.spacing.xl, paddingTop: theme.spacing.md }]}>
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="display">{t('join.title')}</Text>
            <Text variant="body" color="textMuted">
              {t('join.subtitle')}
            </Text>
          </View>

          <Card>
            <Text variant="label" color="textMuted">
              {t('household.inviteCode')}
            </Text>
            <Text variant="title" style={{ marginTop: 4, letterSpacing: 2 }}>
              {code}
            </Text>
          </Card>

          {initializing || status === 'joining' ? (
            <LoadingState label={t('join.joining')} />
          ) : status === 'joined' ? (
            <Card style={{ gap: theme.spacing.sm }}>
              <Text variant="bodyStrong">{t('join.joinedTitle')}</Text>
              <Text variant="caption" color="textMuted">
                {t('join.joinedBody')}
              </Text>
              <Button
                title={t('join.viewHousehold')}
                variant="secondary"
                onPress={() => router.replace('/settings/household')}
                style={{ alignSelf: 'flex-start' }}
              />
            </Card>
          ) : status === 'error' ? (
            <Card style={{ gap: theme.spacing.sm }}>
              <Text variant="bodyStrong" color="danger">
                {t('join.errorTitle')}
              </Text>
              <Text variant="caption" color="textMuted">
                {error}
              </Text>
              <Button
                title={t('join.goToHousehold')}
                variant="secondary"
                onPress={() => router.replace('/settings/household')}
                style={{ alignSelf: 'flex-start' }}
              />
            </Card>
          ) : !session ? (
            <Card style={{ gap: theme.spacing.sm }}>
              <Text variant="bodyStrong">{t('join.signUpPrompt')}</Text>
              <Button title={t('join.createAccount')} onPress={() => router.push('/(auth)/sign-up')} />
              <Button title={t('join.signIn')} variant="ghost" onPress={() => router.push('/(auth)/sign-in')} />
            </Card>
          ) : null}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: { maxWidth: 560, width: '100%', alignSelf: 'center' },
});
