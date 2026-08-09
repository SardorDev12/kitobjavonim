import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Select, Text, TextField, Toggle } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { hasContactMethod, useUpdateProfile } from '@/lib/queries/profile';
import { useLocationOptions } from '@/lib/queries/reference';
import { useTheme } from '@/theme';

export default function EditProfileScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const { profile } = useAuth();
  const locations = useLocationOptions();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [regionId, setRegionId] = useState<string | null>(profile?.region_id ?? null);
  const [districtId, setDistrictId] = useState<string | null>(profile?.district_id ?? null);
  const [telegram, setTelegram] = useState(profile?.telegram_username ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [showPhone, setShowPhone] = useState(profile?.show_phone ?? false);
  const [error, setError] = useState<string | null>(null);

  const districts = locations.districtsFor(regionId);

  const draftHasContact = hasContactMethod({
    ...(profile ?? ({} as never)),
    telegram_username: telegram.trim().replace(/^@/, '') || null,
    phone: phone.trim() || null,
    show_phone: showPhone,
  });

  async function save() {
    if (!name.trim()) {
      setError(t('auth.nameRequired'));
      return;
    }

    setError(null);

    try {
      await updateProfile.mutateAsync({
        display_name: name.trim(),
        bio: bio.trim() || null,
        region_id: regionId,
        district_id: districtId,
        telegram_username: telegram.trim().replace(/^@/, '') || null,
        phone: phone.trim() || null,
        show_phone: showPhone,
      });
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.saveFailed'));
    }
  }

  return (
    <Screen
      scroll
      footer={
        <Button title={t('common.save')} fullWidth loading={updateProfile.isPending} onPress={save} />
      }
    >
      <View style={[styles.container, { gap: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
        <Text variant="display">{t('profile.edit')}</Text>

        <TextField label={t('auth.displayName')} value={name} onChangeText={setName} autoComplete="name" />

        <TextField label={t('profile.title')} value={bio} onChangeText={setBio} multiline />

        <Select
          label={t('onboarding.region')}
          placeholder={t('onboarding.selectRegion')}
          value={regionId}
          options={locations.regions}
          onChange={(value) => {
            setRegionId(value);
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

        <View style={{ gap: theme.spacing.md }}>
          <Text variant="heading">{t('profile.contactDetails')}</Text>

          <TextField
            label={t('onboarding.telegram')}
            hint={t('onboarding.telegramHint')}
            value={telegram}
            onChangeText={setTelegram}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="username"
          />

          <TextField
            label={t('onboarding.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            inputMode="tel"
            placeholder="+998 90 123 45 67"
          />

          <Toggle
            label={t('onboarding.showPhone')}
            hint={t('onboarding.showPhoneHint')}
            value={showPhone}
            onChange={setShowPhone}
            disabled={!phone.trim()}
          />

          {!draftHasContact ? (
            <Card style={{ backgroundColor: theme.colors.warningSoft, borderColor: 'transparent' }}>
              <Text variant="caption">{t('onboarding.contactWarning')}</Text>
            </Card>
          ) : null}
        </View>

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 560, width: '100%', alignSelf: 'center' },
});
