import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Divider, ListRow, Screen, Sheet, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatMonthYear } from '@/lib/format';
import { LOCALE_LABELS, LOCALES, useI18n, type Locale } from '@/lib/i18n';
import { useProfileStats, useUpdateProfile } from '@/lib/queries/profile';
import { useLocationOptions } from '@/lib/queries/reference';
import { THEME_MODES, useTheme, type ThemeMode } from '@/theme';

const INQUIRY_EMAIL = 'murojaat@kitobjavonim.uz';

export default function ProfileScreen() {
  const theme = useTheme();
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();

  const { profile, user, signOut } = useAuth();
  const { data: stats } = useProfileStats(user?.id);
  const locations = useLocationOptions();
  const updateProfile = useUpdateProfile();

  const [languageOpen, setLanguageOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const location = locations.describe(profile?.district_id ?? null, profile?.region_id ?? null);

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      if (globalThis.confirm(t('profile.signOutConfirm'))) void signOut();
      return;
    }

    Alert.alert('', t('profile.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  function chooseLocale(next: Locale) {
    setLocale(next);
    // Mirrored onto the profile so the choice follows the user to a new device.
    updateProfile.mutate({ preferred_locale: next });
    setLanguageOpen(false);
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.xl }}>
        <View style={[styles.identity, { gap: theme.spacing.md }]}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={72} />

          <View style={styles.identityText}>
            <Text variant="title">{profile?.display_name || t('profile.title')}</Text>
            {location ? (
              <Text variant="body" color="textMuted">
                {location}
              </Text>
            ) : null}
            {profile?.created_at ? (
              <Text variant="caption" color="textSubtle">
                {t('profile.memberSince', { date: formatMonthYear(profile.created_at, locale) })}
              </Text>
            ) : null}
          </View>
        </View>

        <Card>
          <Text variant="heading">{t('profile.stats')}</Text>
          <View style={[styles.stats, { marginTop: theme.spacing.lg }]}>
            <Stat label={t('profile.totalBooks')} value={stats?.total_books ?? 0} />
            <Stat label={t('profile.finished')} value={stats?.finished_books ?? 0} />
            <Stat label={t('profile.reading')} value={stats?.reading_books ?? 0} />
          </View>
          <View style={[styles.stats, { marginTop: theme.spacing.lg }]}>
            <Stat label={t('profile.forExchange')} value={stats?.exchange_count ?? 0} />
            <Stat label={t('profile.forSale')} value={stats?.sale_count ?? 0} />
            <View style={styles.stat} />
          </View>
        </Card>

        <Card padded={false}>
          <ListRow
            icon="person-outline"
            label={t('profile.edit')}
            onPress={() => router.push('/settings/profile')}
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow
            icon="lock-closed-outline"
            label={t('security.title')}
            onPress={() => router.push('/settings/security')}
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow
            icon="albums-outline"
            label={t('shelves.manage')}
            onPress={() => router.push('/bookshelves')}
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow
            icon="language-outline"
            label={t('profile.language')}
            value={LOCALE_LABELS[locale]}
            onPress={() => setLanguageOpen(true)}
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow
            icon={theme.scheme === 'dark' ? 'moon-outline' : 'sunny-outline'}
            label={t('profile.appearance')}
            value={t(`profile.appearance.${theme.mode}`)}
            onPress={() => setAppearanceOpen(true)}
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow
            icon="document-text-outline"
            label={t('legal.termsOfService')}
            onPress={() => router.push('/legal/terms')}
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow
            icon="shield-checkmark-outline"
            label={t('legal.privacyPolicy')}
            onPress={() => router.push('/legal/privacy')}
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow
            icon="mail-outline"
            label={t('profile.sendInquiry')}
            onPress={() => void Linking.openURL(`mailto:${INQUIRY_EMAIL}`)}
          />
          {profile?.is_admin ? (
            <>
              <Divider inset={theme.spacing.lg} />
              <ListRow
                icon="flag-outline"
                label={t('admin.reports')}
                onPress={() => router.push('/admin/reports')}
              />
            </>
          ) : null}
        </Card>

        <Button title={t('auth.signOut')} variant="secondary" fullWidth onPress={confirmSignOut} />
      </View>

      <Sheet visible={languageOpen} onClose={() => setLanguageOpen(false)} title={t('profile.language')}>
        {LOCALES.map((option, index) => (
          <View key={option}>
            {index > 0 ? <Divider /> : null}
            <ListRow
              label={LOCALE_LABELS[option]}
              onPress={() => chooseLocale(option)}
              trailing={
                option === locale ? (
                  <Text variant="label" color="primary">
                    ✓
                  </Text>
                ) : null
              }
            />
          </View>
        ))}
      </Sheet>

      <Sheet visible={appearanceOpen} onClose={() => setAppearanceOpen(false)} title={t('profile.appearance')}>
        {THEME_MODES.map((option, index) => (
          <View key={option}>
            {index > 0 ? <Divider /> : null}
            <ListRow
              label={t(`profile.appearance.${option}`)}
              onPress={() => {
                theme.setMode(option);
                setAppearanceOpen(false);
              }}
              trailing={
                option === theme.mode ? (
                  <Text variant="label" color="primary">
                    ✓
                  </Text>
                ) : null
              }
            />
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center' },
  identityText: { flex: 1, gap: 2 },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, gap: 2 },
});
