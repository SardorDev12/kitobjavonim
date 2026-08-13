import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

/**
 * Lets a Google or Telegram sign-in add a password, so the account is not
 * stranded if that provider is ever unreachable or de-authorized.
 *
 * Neither provider leaves the account with a password — Telegram's sign-in
 * (supabase/functions/telegram-auth) mints a synthetic tg_<id>@telegram.local
 * address with no password at all, and a Google sign-in has a real email but
 * still no password, since OAuth never sets one. That split is what decides
 * whether the email field below is editable: a Google user already has a
 * usable address, a Telegram user needs a real one before they can use it to
 * sign in.
 */
export default function SecurityScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();

  const currentEmail = user?.email ?? '';
  const hasRealEmail = Boolean(currentEmail) && !currentEmail.endsWith('@telegram.local');

  const [email, setEmail] = useState(hasRealEmail ? currentEmail : '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function validate() {
    const next: typeof fieldErrors = {};
    if (!hasRealEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = t('auth.invalidEmail');
    if (password.length < 8) next.password = t('auth.passwordTooShort');
    if (password !== confirmPassword) next.confirm = t('security.passwordMismatch');
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) return;

    setError(null);
    setSaved(false);
    setSaving(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser(
        hasRealEmail ? { password } : { email: email.trim(), password }
      );
      if (updateError) throw updateError;

      setSaved(true);
      setPassword('');
      setConfirmPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll>
      <View style={[styles.container, { gap: theme.spacing.lg, paddingTop: theme.spacing.xl }]}>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="display">{t('security.title')}</Text>
          <Text variant="body" color="textMuted">
            {t('security.subtitle')}
          </Text>
        </View>

        {hasRealEmail ? (
          <Card>
            <Text variant="label" color="textMuted">
              {t('auth.email')}
            </Text>
            <Text variant="body" style={{ marginTop: 4 }}>
              {currentEmail}
            </Text>
          </Card>
        ) : (
          <TextField
            label={t('auth.email')}
            hint={t('security.emailHint')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
            error={fieldErrors.email}
          />
        )}

        <TextField
          label={t('security.newPassword')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={fieldErrors.password}
        />

        <TextField
          label={t('security.confirmPassword')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={fieldErrors.confirm}
          onSubmitEditing={save}
          returnKeyType="go"
        />

        {!hasRealEmail ? (
          <Text variant="caption" color="textSubtle">
            {t('security.confirmEmailNotice')}
          </Text>
        ) : null}

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        {saved ? (
          <Text variant="caption" color="success">
            {hasRealEmail ? t('security.passwordSaved') : t('security.emailAndPasswordSaved')}
          </Text>
        ) : null}

        <Button title={t('common.save')} fullWidth loading={saving} onPress={save} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 480, width: '100%', alignSelf: 'center' },
});
