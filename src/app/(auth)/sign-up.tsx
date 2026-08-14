import { Link, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, EmptyState, Screen, Text, TextField } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { scrollToEndOnKeyboardShow } from '@/lib/keyboard';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

export default function SignUpScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  function validate() {
    const next: typeof fieldErrors = {};
    if (!name.trim()) next.name = t('auth.nameRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = t('auth.invalidEmail');
    if (password.length < 8) next.password = t('auth.passwordTooShort');
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;

    setError(null);
    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Read by the on_auth_user_created trigger to seed the profile, so the
        // user never sees an empty name even before onboarding.
        options: { data: { full_name: name.trim() } },
      });

      if (signUpError) throw signUpError;

      // With email confirmation switched on, signUp returns a user but no
      // session. Without it, the auth listener takes over and routes onward.
      if (data.user && !data.session) setConfirmationSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }

  if (confirmationSent) {
    return (
      <Screen>
        <EmptyState
          icon="mail-outline"
          title={t('auth.signUp')}
          body={t('auth.confirmEmail', { email: email.trim() })}
          actionLabel={t('auth.signIn')}
          onAction={() => router.replace('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll scrollRef={scrollRef}>
      <KeyboardAvoidingView
        // See sign-in.tsx's identical change for why Android needs a real
        // behavior now instead of relying on the OS's own window resize.
        behavior={Platform.select({ ios: 'padding', android: 'height', default: undefined })}
        style={styles.flex}
      >
        <View style={[styles.container, { paddingTop: theme.spacing['3xl'], gap: theme.spacing.lg }]}>
          <Text variant="display">{t('auth.signUp')}</Text>

          <TextField
            label={t('auth.displayName')}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            textContentType="name"
            error={fieldErrors.name}
          />

          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
            error={fieldErrors.email}
          />

          <TextField
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            error={fieldErrors.password}
            onSubmitEditing={submit}
            returnKeyType="go"
            // See sign-in.tsx's identical field — Android's ScrollView
            // doesn't reliably bring a focused field into view on its own.
            onFocus={() => scrollToEndOnKeyboardShow(scrollRef)}
          />

          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}

          <AgreementText />

          <Button title={t('auth.signUp')} fullWidth loading={loading} onPress={submit} />

          <View style={[styles.footer, { gap: theme.spacing.xs }]}>
            <Text variant="body" color="textMuted">
              {t('auth.haveAccount')}
            </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable hitSlop={8}>
                <Text variant="bodyStrong" color="primary">
                  {t('auth.signIn')}
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * Splits the translated sentence on its {terms}/{privacy} tokens so each
 * can become its own tappable inline span while the surrounding wording —
 * including word order, which varies by language — stays a single
 * translatable string rather than three concatenated fragments.
 */
function AgreementText() {
  const { t } = useI18n();
  const router = useRouter();
  const parts = t('auth.agreeToTerms').split(/(\{terms\}|\{privacy\})/);

  return (
    <Text variant="caption" color="textSubtle" align="center">
      {parts.map((part, index) => {
        if (part === '{terms}') {
          return (
            <Text key={index} variant="caption" color="primary" onPress={() => router.push('/legal/terms')}>
              {t('legal.termsOfService')}
            </Text>
          );
        }
        if (part === '{privacy}') {
          return (
            <Text key={index} variant="caption" color="primary" onPress={() => router.push('/legal/privacy')}>
              {t('legal.privacyPolicy')}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, maxWidth: 420, width: '100%', alignSelf: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 8 },
});
