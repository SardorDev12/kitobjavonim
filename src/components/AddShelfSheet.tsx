import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Sheet, Text, TextField, Toggle } from '@/components/ui';
import { describeError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { useCreateBookshelf, useCreatePosition } from '@/lib/queries/bookshelves';
import { useHousehold } from '@/lib/queries/household';
import { useTheme } from '@/theme';

/**
 * Lets a new shelf (and its first position) be created without leaving
 * whatever flow needed it — the only other way in was navigating to
 * /bookshelves and losing whatever else was being edited. Bundles the
 * two-step shelf-then-position flow bookshelves/index.tsx normally spreads
 * across separate actions into one submit, since the point here is getting
 * back to "this book has a location" as directly as possible.
 */
export function AddShelfSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (positionId: string) => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const { data: household } = useHousehold();
  const createShelf = useCreateBookshelf();
  const createPosition = useCreatePosition();

  const [name, setName] = useState('');
  const [shelfNumber, setShelfNumber] = useState('1');
  const [rowNumber, setRowNumber] = useState('1');
  const [shareShelf, setShareShelf] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const saving = createShelf.isPending || createPosition.isPending;

  async function submit() {
    const trimmedName = name.trim();
    const shelf_number = Number(shelfNumber);
    const row_number = Number(rowNumber);

    if (!trimmedName) {
      setError(t('shelves.shelfName'));
      return;
    }
    if (!Number.isInteger(shelf_number) || shelf_number < 1 || !Number.isInteger(row_number) || row_number < 1) {
      setError(t('error.generic'));
      return;
    }

    setError(null);
    try {
      const bookshelfId = await createShelf.mutateAsync({
        name: trimmedName,
        householdId: household && shareShelf ? household.household.id : null,
      });
      const positionId = await createPosition.mutateAsync({ bookshelfId, shelfNumber: shelf_number, rowNumber: row_number });
      setName('');
      setShelfNumber('1');
      setRowNumber('1');
      onCreated(positionId);
      onClose();
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('shelves.addShelf')}>
      <View style={{ gap: theme.spacing.lg }}>
        <TextField
          label={t('shelves.shelfName')}
          placeholder={t('shelves.shelfNamePlaceholder')}
          value={name}
          onChangeText={setName}
          autoFocus
        />

        <View style={[styles.pair, { gap: theme.spacing.md }]}>
          <TextField
            label={t('shelves.shelfNumber')}
            value={shelfNumber}
            onChangeText={setShelfNumber}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            containerStyle={styles.pairItem}
          />
          <TextField
            label={t('shelves.rowNumber')}
            value={rowNumber}
            onChangeText={setRowNumber}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            containerStyle={styles.pairItem}
          />
        </View>

        {household ? (
          <Toggle label={t('household.share')} hint={household.household.name} value={shareShelf} onChange={setShareShelf} />
        ) : null}

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        <Button title={t('common.add')} fullWidth loading={saving} disabled={!name.trim()} onPress={submit} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row' },
  pairItem: { flex: 1 },
});
