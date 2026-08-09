import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, EmptyState, Screen, Text, TextField } from '@/components/ui';
import { redirectUri } from '@/features/auth/providers';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUri('auth/reset'),
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <EmptyState
          icon="mail-outline"
          title={t('auth.resetPassword')}
          body={t('auth.resetLinkSent')}
          actionLabel={t('auth.signIn')}
          onAction={() => router.replace('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={[styles.container, { paddingTop: theme.spacing['3xl'], gap: theme.spacing.lg }]}>
        <Text variant="display">{t('auth.resetPassword')}</Text>

        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          onSubmitEditing={submit}
          returnKeyType="go"
        />

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        <Button
          title={t('auth.sendResetLink')}
          fullWidth
          loading={loading}
          disabled={!email.trim()}
          onPress={submit}
        />

        <Button title={t('common.back')} variant="ghost" fullWidth onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, maxWidth: 420, width: '100%', alignSelf: 'center' },
});
