import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { isAppleSignInAvailable, signInWithApple, signInWithOAuth, signInWithTelegram } from '@/features/auth/providers';
import { useI18n } from '@/lib/i18n';
import { scrollToEndOnKeyboardShow } from '@/lib/keyboard';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';
import { Button, Divider, Screen, Text, TextField } from '@/components/ui';

export default function SignInScreen() {
  const theme = useTheme();
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | 'email' | 'google' | 'apple' | 'telegram'>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function run(kind: NonNullable<typeof pending>, action: () => Promise<void>) {
    setError(null);
    setPending(kind);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    } finally {
      setPending(null);
    }
  }

  const signInWithEmail = () =>
    run('email', async () => {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
    });

  return (
    <Screen scroll scrollRef={scrollRef}>
      {/* No KeyboardAvoidingView here — it would wrap this content, but it's
          already inside Screen's ScrollView, so resizing it can't affect
          what the ScrollView considers scrollable. The keyboard is handled
          by Screen itself (extra bottom padding while it's open) plus
          scrollToEndOnKeyboardShow on the password field below. */}
      <View style={styles.flex}>
        <View style={[styles.container, { paddingTop: theme.spacing['4xl'], gap: theme.spacing.xl }]}>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={[styles.mark, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.lg }]}>
              <Ionicons name="library" size={26} color={theme.colors.primary} />
            </View>
            <Text variant="display">{t('auth.welcomeTitle')}</Text>
            <Text variant="body" color="textMuted">
              {t('auth.welcomeSubtitle')}
            </Text>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Button
              title={t('auth.continueWithGoogle')}
              icon="logo-google"
              variant="secondary"
              fullWidth
              loading={pending === 'google'}
              disabled={pending !== null}
              onPress={() => run('google', () => signInWithOAuth('google'))}
            />

            {appleAvailable ? (
              <Button
                title={t('auth.continueWithApple')}
                icon="logo-apple"
                variant="secondary"
                fullWidth
                loading={pending === 'apple'}
                disabled={pending !== null}
                onPress={() => run('apple', signInWithApple)}
              />
            ) : null}

            <Button
              title={t('auth.continueWithTelegram')}
              icon="paper-plane"
              variant="secondary"
              fullWidth
              loading={pending === 'telegram'}
              disabled={pending !== null}
              onPress={() => run('telegram', signInWithTelegram)}
            />
          </View>

          <View style={styles.separator}>
            <View style={styles.separatorLine}>
              <Divider />
            </View>
            <Text variant="caption" color="textSubtle">
              {t('auth.orUseEmail')}
            </Text>
            <View style={styles.separatorLine}>
              <Divider />
            </View>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <TextField
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              textContentType="emailAddress"
            />

            <TextField
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={signInWithEmail}
              returnKeyType="go"
              // Android's ScrollView doesn't reliably scroll a focused field
              // into view on its own (see Screen's scrollRef comment) — this
              // field sits below three provider buttons and a divider, so
              // without this the keyboard covers it entirely rather than
              // just partially.
              onFocus={() => scrollToEndOnKeyboardShow(scrollRef)}
            />

            {error ? (
              <Text variant="caption" color="danger">
                {error}
              </Text>
            ) : null}

            <Button
              title={t('auth.signIn')}
              fullWidth
              loading={pending === 'email'}
              disabled={pending !== null || !email.trim() || !password}
              onPress={signInWithEmail}
            />

            <Link href="/(auth)/forgot-password" asChild>
              <Pressable hitSlop={8} style={styles.center}>
                <Text variant="label" color="primary">
                  {t('auth.forgotPassword')}
                </Text>
              </Pressable>
            </Link>
          </View>

          <View style={[styles.footer, { gap: theme.spacing.xs }]}>
            <Text variant="body" color="textMuted">
              {t('auth.noAccount')}
            </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable hitSlop={8}>
                <Text variant="bodyStrong" color="primary">
                  {t('auth.signUp')}
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, maxWidth: 420, width: '100%', alignSelf: 'center' },
  mark: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  separator: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  separatorLine: { flex: 1 },
  center: { alignItems: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 8 },
});
