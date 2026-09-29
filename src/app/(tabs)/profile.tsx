import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Card, Divider, ListRow, Screen, Sheet, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatMonthYear } from '@/lib/format';
import { LOCALE_LABELS, LOCALES, useI18n, type Locale } from '@/lib/i18n';
import { SUPPORT_EMAIL } from '@/lib/legalContent';
import { useUpdateProfile } from '@/lib/queries/profile';
import { useLocationOptions } from '@/lib/queries/reference';
import { COLOR_THEMES, THEME_MODES, colorThemes, useTheme, type ColorTheme, type ThemeMode } from '@/theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { profile, signOut } = useAuth();
  const locations = useLocationOptions();
  const updateProfile = useUpdateProfile();

  const [languageOpen, setLanguageOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [colorThemeOpen, setColorThemeOpen] = useState(false);

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
      <View style={{ gap: theme.spacing.xl, paddingTop: insets.top + theme.spacing.md }}>
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
            icon="cloud-upload-outline"
            label={t('import.title')}
            onPress={() => router.push('/library/import')}
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow
            icon="heart-outline"
            label={t('wishlist.title')}
            onPress={() => router.push('/wishlist')}
          />
          <Divider inset={theme.spacing.lg} />
          <ListRow
            icon="people-outline"
            label={t('household.title')}
            onPress={() => router.push('/settings/household')}
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
            icon="color-palette-outline"
            label={t('profile.colorTheme')}
            value={t(`profile.colorTheme.${theme.colorTheme}`)}
            onPress={() => setColorThemeOpen(true)}
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
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          />
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

      <Sheet visible={colorThemeOpen} onClose={() => setColorThemeOpen(false)} title={t('profile.colorTheme')}>
        {COLOR_THEMES.map((option, index) => (
          <View key={option}>
            {index > 0 ? <Divider /> : null}
            <ColorThemeRow
              option={option}
              selected={option === theme.colorTheme}
              onPress={() => {
                theme.setColorTheme(option);
                setColorThemeOpen(false);
              }}
            />
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

/** Same row rhythm as ListRow, plus a swatch of the theme's own primary
 *  color — a hex/name alone doesn't actually show what's being picked. */
function ColorThemeRow({ option, selected, onPress }: { option: ColorTheme; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const swatchColor = colorThemes[option][theme.scheme].primary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.colorThemeRow,
        { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
        pressed && { backgroundColor: theme.colors.surfaceSunken },
      ]}
    >
      <View style={[styles.colorThemeSwatch, { backgroundColor: swatchColor, borderColor: theme.colors.border }]} />
      <Text variant="body" style={styles.colorThemeLabel} numberOfLines={1}>
        {t(`profile.colorTheme.${option}`)}
      </Text>
      {selected ? (
        <Text variant="label" color="primary">
          ✓
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center' },
  identityText: { flex: 1, gap: 2 },
  colorThemeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  colorThemeSwatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1 },
  colorThemeLabel: { flex: 1 },
});
