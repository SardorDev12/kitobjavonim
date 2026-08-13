import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Screen, Select, Text, TextField, Toggle } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/lib/i18n';
import { useRemoveAvatar, useUploadAvatar } from '@/lib/queries/photos';
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
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [regionId, setRegionId] = useState<string | null>(profile?.region_id ?? null);
  const [districtId, setDistrictId] = useState<string | null>(profile?.district_id ?? null);
  const [telegram, setTelegram] = useState(profile?.telegram_username ?? '');
  const [showTelegram, setShowTelegram] = useState(profile?.show_telegram ?? true);
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [showPhone, setShowPhone] = useState(profile?.show_phone ?? false);
  const [error, setError] = useState<string | null>(null);

  const districts = locations.districtsFor(regionId);

  const draftHasContact = hasContactMethod({
    ...(profile ?? ({} as never)),
    telegram_username: telegram.trim().replace(/^@/, '') || null,
    show_telegram: showTelegram,
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
        show_telegram: showTelegram,
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

        {/* Uploaded and saved immediately rather than on Save — the picker is
            already a deliberate, multi-step confirmation of intent. Removal
            asks first, since unlike a replace it has no undo. */}
        <View style={[styles.avatarRow, { gap: theme.spacing.lg }]}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={72} />
          <View style={{ gap: theme.spacing.sm }}>
            <Button
              title={t('profile.changePhoto')}
              variant="secondary"
              size="sm"
              icon="image-outline"
              loading={uploadAvatar.isPending}
              onPress={() => uploadAvatar.mutate()}
            />
            {profile?.avatar_url ? (
              <Button
                title={t('profile.removePhoto')}
                variant="ghost"
                size="sm"
                icon="trash-outline"
                loading={removeAvatar.isPending}
                onPress={() => {
                  const currentUrl = profile.avatar_url;
                  const doRemove = () => removeAvatar.mutate(currentUrl);

                  if (Platform.OS === 'web') {
                    if (globalThis.confirm(t('profile.removePhotoConfirm'))) doRemove();
                    return;
                  }

                  Alert.alert('', t('profile.removePhotoConfirm'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.remove'), style: 'destructive', onPress: doRemove },
                  ]);
                }}
              />
            ) : null}
          </View>
        </View>

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
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
});
