import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthorsField, Button, Screen, Text, TextField, Toggle } from '@/components/ui';
import { describeError } from '@/lib/errors';
import { parseAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useHousehold } from '@/lib/queries/household';
import { useAddWishlistItem } from '@/lib/queries/wishlist';
import { useTheme } from '@/theme';

/**
 * Just a title and an author — no search, no cover, no ISBN. A wishlist
 * entry only needs to be recognizable, not catalogued; see 0019_wishlist.sql
 * and add/configure.tsx's automatic match-and-clear on save.
 */
export default function WishlistAddScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: household } = useHousehold();
  // Sharing is the point of being in a household, so it starts on — see
  // 0015_households.sql's design notes on per-row opt-in sharing.
  const [shareItem, setShareItem] = useState(true);

  const addItem = useAddWishlistItem();

  async function save() {
    if (!title.trim()) {
      setTitleError(t('manual.titleRequired'));
      return;
    }
    setError(null);
    try {
      await addItem.mutateAsync({
        title: title.trim(),
        authors: parseAuthors(authors),
        householdId: household && shareItem ? household.household.id : null,
      });
      router.back();
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  return (
    <Screen
      scroll
      footer={
        <Button
          title={t('wishlist.add')}
          fullWidth
          loading={addItem.isPending}
          disabled={!title.trim()}
          onPress={save}
        />
      }
    >
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="display">{t('wishlist.add')}</Text>
          <Text variant="body" color="textMuted">
            {t('wishlist.addSubtitle')}
          </Text>
        </View>

        <TextField
          label={t('manual.bookTitle')}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            if (titleError) setTitleError(null);
          }}
          error={titleError}
          autoFocus
        />

        <AuthorsField
          label={t('manual.authors')}
          hint={t('manual.authorsHint')}
          value={authors}
          onChangeText={setAuthors}
        />

        {household ? (
          <Toggle
            label={t('household.share')}
            hint={household.household.name}
            value={shareItem}
            onChange={setShareItem}
          />
        ) : null}

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
