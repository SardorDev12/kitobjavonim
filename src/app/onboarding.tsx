import type { User } from '@supabase/supabase-js';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Screen, Select, Text, TextField, Toggle } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { scrollToEndOnKeyboardShow } from '@/lib/keyboard';
import { useUpdateProfile } from '@/lib/queries/profile';
import { useLocationOptions } from '@/lib/queries/reference';
import { useTheme } from '@/theme';

// Google and Telegram sign-in both populate user_metadata.full_name (see
// supabase/functions/telegram-auth); Telegram's own auth.users.email is a
// synthetic tg_<id>@telegram.local address, so it is the last resort, not
// the first.
function defaultDisplayName(user: User | null, fallback: string): string {
  const fullName = user?.user_metadata?.full_name;
  if (typeof fullName === 'string' && fullName.trim()) return fullName.trim();
  if (user?.email) return user.email.split('@')[0];
  return fallback;
}

/**
 * Collected once, after sign-up.
 *
 * Everything here except the name is optional — the fastest path to a first book
 * is what matters, and a user who never lists anything never needs an area or a
 * Telegram handle. The listing screens ask for what is missing at the point it
 * actually becomes necessary.
 */
export default function OnboardingScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const locations = useLocationOptions();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [regionId, setRegionId] = useState<string | null>(profile?.region_id ?? null);
  const [districtId, setDistrictId] = useState<string | null>(profile?.district_id ?? null);
  const [telegram, setTelegram] = useState(profile?.telegram_username ?? '');
  const [showTelegram, setShowTelegram] = useState(profile?.show_telegram ?? true);
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [showPhone, setShowPhone] = useState(profile?.show_phone ?? false);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const districts = locations.districtsFor(regionId);

  async function skip() {
    setSkipping(true);
    setError(null);

    try {
      await updateProfile.mutateAsync({
        display_name: defaultDisplayName(user, t('onboarding.defaultName')),
        onboarded_at: new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.saveFailed'));
      setSkipping(false);
    }
  }

  async function finish() {
    if (!name.trim()) {
      setError(t('auth.nameRequired'));
      return;
    }

    setError(null);

    try {
      await updateProfile.mutateAsync({
        display_name: name.trim(),
        region_id: regionId,
        district_id: districtId,
        // Stored without the @ so links can be built by concatenation.
        telegram_username: telegram.trim().replace(/^@/, '') || null,
        show_telegram: showTelegram,
        phone: phone.trim() || null,
        show_phone: showPhone,
        onboarded_at: new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.saveFailed'));
    }
  }

  return (
    <Screen scroll scrollRef={scrollRef}>
      {/* See sign-in.tsx's identical structure — no KeyboardAvoidingView
          here; it would be nested inside Screen's ScrollView, so it can't
          affect what the ScrollView considers scrollable. Screen itself
          handles the keyboard. */}
      <View style={styles.flex}>
        <View style={[styles.container, { paddingTop: theme.spacing['3xl'], gap: theme.spacing.lg }]}>
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="display">{t('onboarding.title')}</Text>
            <Text variant="body" color="textMuted">
              {t('onboarding.subtitle')}
            </Text>
          </View>

          <TextField label={t('auth.displayName')} value={name} onChangeText={setName} autoComplete="name" />

          <Select
            label={t('onboarding.region')}
            placeholder={t('onboarding.selectRegion')}
            value={regionId}
            options={locations.regions}
            onChange={(value) => {
              setRegionId(value);
              // The old district belongs to the old region.
              setDistrictId(null);
            }}
            clearable
            clearLabel={t('common.none')}
          />

          <Select
            label={t('onboarding.district')}
            placeholder={t('onboarding.selectDistrict')}
            value={districtId}
            options={districts}
            onChange={setDistrictId}
            disabled={!regionId || districts.length === 0}
            clearable
            clearLabel={t('common.none')}
          />

          <TextField
            label={t('onboarding.telegram')}
            hint={t('onboarding.telegramHint')}
            value={telegram}
            onChangeText={setTelegram}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="username"
            // See sign-in.tsx's identical field — Android's ScrollView
            // doesn't reliably bring a focused field into view on its own.
            onFocus={() => scrollToEndOnKeyboardShow(scrollRef)}
          />

          <Toggle
            label={t('onboarding.showTelegram')}
            hint={t('onboarding.showTelegramHint')}
            value={showTelegram}
            onChange={setShowTelegram}
            disabled={!telegram.trim()}
          />

          <TextField
            label={t('onboarding.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            inputMode="tel"
            placeholder="+998 90 123 45 67"
            onFocus={() => scrollToEndOnKeyboardShow(scrollRef)}
          />

          <Toggle
            label={t('onboarding.showPhone')}
            hint={t('onboarding.showPhoneHint')}
            value={showPhone}
            onChange={setShowPhone}
            disabled={!phone.trim()}
          />

          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title={t('onboarding.finish')}
            fullWidth
            loading={updateProfile.isPending && !skipping}
            disabled={skipping}
            onPress={finish}
          />

          <Button
            title={t('onboarding.skip')}
            variant="ghost"
            fullWidth
            loading={skipping}
            disabled={updateProfile.isPending && !skipping}
            onPress={skip}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, maxWidth: 480, width: '100%', alignSelf: 'center' },
});
