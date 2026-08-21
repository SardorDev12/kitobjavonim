import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { AuthorsField, Button, EmptyState, LoadingState, Screen, Text, TextField, Toggle } from '@/components/ui';
import { describeError } from '@/lib/errors';
import { parseAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useHousehold } from '@/lib/queries/household';
import { useDeleteWishlistItem, useUpdateWishlistItem, useWishlist } from '@/lib/queries/wishlist';
import { useTheme } from '@/theme';

/**
 * A wishlist item's own screen — editing the title/author and the household
 * share choice all live here now, rather than as small inline controls on
 * the list row (bookshelves.tsx and the library's own book/[id].tsx use the
 * same "row just opens the thing, actions live on its own screen" shape).
 *
 * Reuses the already-loaded useWishlist() list rather than a dedicated
 * single-item query — the same reasoning as useLibrary(): a personal
 * wishlist is a handful of rows, not worth a second round trip for.
 */
export default function WishlistEditScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: wishlist, isPending } = useWishlist();
  const { data: household } = useHousehold();
  const updateItem = useUpdateWishlistItem();
  const deleteItem = useDeleteWishlistItem();

  const entry = wishlist?.find((item) => item.id === id) ?? null;

  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [shareItem, setShareItem] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fills the form once the entry loads — a plain useState default can't
  // depend on an async query result.
  useEffect(() => {
    if (entry && !initialized) {
      setTitle(entry.title);
      setAuthors(entry.authors.join(', '));
      setShareItem(Boolean(entry.household_id));
      setInitialized(true);
    }
  }, [entry, initialized]);

  if (isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (!entry) {
    return (
      <Screen>
        <EmptyState title={t('error.notFound')} />
      </Screen>
    );
  }

  async function save() {
    if (!title.trim()) {
      setTitleError(t('manual.titleRequired'));
      return;
    }
    setError(null);
    try {
      await updateItem.mutateAsync({
        id: entry!.id,
        title: title.trim(),
        authors: parseAuthors(authors),
        householdId: household && shareItem ? household.household.id : null,
      });
      router.back();
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  function confirmRemove() {
    const message = t('wishlist.removeConfirm', { title: entry!.title });
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) remove();
      return;
    }
    Alert.alert('', message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: remove },
    ]);
  }

  async function remove() {
    setError(null);
    try {
      await deleteItem.mutateAsync(entry!.id);
      router.back();
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  return (
    <Screen
      scroll
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          <Button title={t('common.save')} fullWidth loading={updateItem.isPending} onPress={save} />
          <Button
            title={t('wishlist.remove')}
            variant="danger"
            fullWidth
            loading={deleteItem.isPending}
            onPress={confirmRemove}
          />
        </View>
      }
    >
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <Text variant="display">{t('wishlist.editTitle')}</Text>

        <TextField
          label={t('manual.bookTitle')}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            if (titleError) setTitleError(null);
          }}
          error={titleError}
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
