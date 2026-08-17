import { useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Divider, LoadingState, Screen, Text, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import {
  useCreateHousehold,
  useHousehold,
  useJoinHousehold,
  useLeaveHousehold,
  useRegenerateInviteCode,
  useRemoveHouseholdMember,
  type HouseholdMemberWithProfile,
} from '@/lib/queries/household';
import { useTheme } from '@/theme';

/**
 * Sharing is opt-in and per-row (see 0015_households.sql) — being in a
 * household doesn't move anything automatically. This screen only manages
 * membership; toggling an individual shelf or book to shared happens where
 * it's created, same as every other per-item setting in this app.
 */
export default function HouseholdScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();

  const { data: info, isPending } = useHousehold();
  const createHousehold = useCreateHousehold();
  const joinHousehold = useJoinHousehold();
  const leaveHousehold = useLeaveHousehold();
  const removeMember = useRemoveHouseholdMember();
  const regenerateCode = useRegenerateInviteCode();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function confirm(message: string, onConfirm: () => void) {
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) onConfirm();
      return;
    }
    Alert.alert('', message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: onConfirm },
    ]);
  }

  async function submitCreate() {
    if (!name.trim()) return;
    setError(null);
    try {
      await createHousehold.mutateAsync(name.trim());
      setName('');
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  async function submitJoin() {
    if (!code.trim()) return;
    setError(null);
    try {
      await joinHousehold.mutateAsync(code.trim());
      setCode('');
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  async function handleLeave() {
    setError(null);
    try {
      await leaveHousehold.mutateAsync();
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  async function handleRemove(member: HouseholdMemberWithProfile) {
    setError(null);
    try {
      await removeMember.mutateAsync(member.user_id);
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  async function handleRegenerate() {
    setError(null);
    try {
      await regenerateCode.mutateAsync();
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  async function shareCode(inviteCode: string) {
    const message = `${t('household.inviteCode')}: ${inviteCode}`;

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ text: message });
        } catch {
          // AbortError when the user cancels the native share sheet.
        }
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(inviteCode);
        globalThis.alert(t('book.shareCopied'));
      }
      return;
    }

    await Share.share({ message });
  }

  if (isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (!info) {
    return (
      <Screen scroll>
        <View style={[styles.container, { gap: theme.spacing.xl, paddingTop: theme.spacing.md }]}>
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="display">{t('household.title')}</Text>
            <Text variant="body" color="textMuted">
              {t('household.subtitle')}
            </Text>
          </View>

          <Card>
            <Text variant="bodyStrong">{t('household.create')}</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: 4, marginBottom: theme.spacing.sm }}>
              {t('household.createBody')}
            </Text>
            <TextField
              label={t('household.nameLabel')}
              placeholder={t('household.namePlaceholder')}
              value={name}
              onChangeText={setName}
            />
            <Button
              title={t('household.create')}
              variant="secondary"
              loading={createHousehold.isPending}
              disabled={!name.trim()}
              onPress={submitCreate}
              style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}
            />
          </Card>

          <Card>
            <Text variant="bodyStrong">{t('household.join')}</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: 4, marginBottom: theme.spacing.sm }}>
              {t('household.joinBody')}
            </Text>
            <TextField
              label={t('household.codeLabel')}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Button
              title={t('household.join')}
              variant="secondary"
              loading={joinHousehold.isPending}
              disabled={!code.trim()}
              onPress={submitJoin}
              style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}
            />
          </Card>

          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      </Screen>
    );
  }

  const isOwner = info.role === 'owner';

  return (
    <Screen scroll>
      <View style={[styles.container, { gap: theme.spacing.xl, paddingTop: theme.spacing.md }]}>
        <Text variant="display">{info.household.name}</Text>

        <Card>
          <Text variant="label" color="textMuted">
            {t('household.inviteCode')}
          </Text>
          <Text variant="title" style={{ marginTop: 4, letterSpacing: 2 }}>
            {info.household.invite_code}
          </Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>
            {t('household.inviteCodeHint')}
          </Text>
          <View style={[styles.actionsRow, { gap: theme.spacing.md, marginTop: theme.spacing.sm }]}>
            <Button
              title={t('household.share')}
              variant="ghost"
              size="sm"
              icon="share-outline"
              onPress={() => shareCode(info.household.invite_code)}
            />
            {isOwner ? (
              <Button
                title={t('household.regenerateCode')}
                variant="ghost"
                size="sm"
                loading={regenerateCode.isPending}
                onPress={handleRegenerate}
              />
            ) : null}
          </View>
        </Card>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color="textMuted">
            {t('household.members')}
          </Text>
          <Card padded={false}>
            {info.members.map((member, index) => {
              const isSelf = member.user_id === user?.id;
              return (
                <View key={member.user_id}>
                  {index > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                  <View
                    style={[
                      styles.memberRow,
                      { gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
                    ]}
                  >
                    <Avatar uri={member.avatar_url} name={member.display_name} size={40} />
                    <View style={styles.memberText}>
                      <Text variant="body" numberOfLines={1}>
                        {member.display_name || t('household.unnamedMember')}
                        {isSelf ? ` (${t('household.you')})` : ''}
                      </Text>
                      <Text variant="caption" color="textMuted">
                        {t(member.role === 'owner' ? 'household.roleOwner' : 'household.roleMember')}
                      </Text>
                    </View>
                    {isOwner && !isSelf ? (
                      <Pressable
                        onPress={() =>
                          confirm(t('household.removeConfirm', { name: member.display_name || t('household.unnamedMember') }), () =>
                            handleRemove(member)
                          )
                        }
                        hitSlop={8}
                      >
                        <Text variant="label" color="danger">
                          {t('household.remove')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Card>
        </View>

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        <Button
          title={t('household.leave')}
          variant="secondary"
          loading={leaveHousehold.isPending}
          onPress={() => confirm(t('household.leaveConfirm'), handleLeave)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  actionsRow: { flexDirection: 'row' },
  memberRow: { flexDirection: 'row', alignItems: 'center' },
  memberText: { flex: 1, gap: 2 },
});
