import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Divider, EmptyState, LoadingState, Screen, Sheet, Text, TextField, Toggle } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { describeError } from '@/lib/errors';
import { formatPosition } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import {
  useBookshelves,
  useCreateBookshelf,
  useCreatePosition,
  useDeleteBookshelf,
  useDeletePosition,
  useSetBookshelfHousehold,
  type BookshelfWithPositions,
} from '@/lib/queries/bookshelves';
import { useHousehold } from '@/lib/queries/household';
import { useLibrary } from '@/lib/queries/library';
import { useTheme } from '@/theme';

/**
 * Bookshelf configuration.
 *
 * Positions are user-defined here and nowhere else — no shelf or row values are
 * baked into the app or the schema, which is what lets one person model "Living
 * room, shelf 3, back row" and another just "Bedroom, shelf 1".
 */
export default function BookshelvesScreen() {
  const theme = useTheme();
  const { t } = useI18n();

  const { data: shelves, isPending } = useBookshelves();
  const { data: library } = useLibrary();
  const { data: household } = useHousehold();
  const createShelf = useCreateBookshelf();

  const [addShelfOpen, setAddShelfOpen] = useState(false);
  const [shelfName, setShelfName] = useState('');
  // Sharing is the point of being in a household, so it starts on — see
  // 0015_households.sql's design notes on per-row opt-in sharing.
  const [shareShelf, setShareShelf] = useState(true);

  // How many books sit at each position, so deleting one can say what it affects.
  const booksPerPosition = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of library ?? []) {
      if (!entry.bookshelf_position_id) continue;
      counts.set(entry.bookshelf_position_id, (counts.get(entry.bookshelf_position_id) ?? 0) + 1);
    }
    return counts;
  }, [library]);

  async function submitShelf() {
    const name = shelfName.trim();
    if (!name) return;
    await createShelf.mutateAsync({
      name,
      householdId: household && shareShelf ? household.household.id : null,
    });
    setShelfName('');
    setAddShelfOpen(false);
  }

  if (isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      footer={<Button title={t('shelves.addShelf')} icon="add" fullWidth onPress={() => setAddShelfOpen(true)} />}
    >
      <View style={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="display">{t('shelves.title')}</Text>
          <Text variant="body" color="textMuted">
            {t('shelves.subtitle')}
          </Text>
        </View>

        {(shelves ?? []).length === 0 ? (
          <EmptyState icon="albums-outline" title={t('shelves.empty')} body={t('shelves.emptyBody')} />
        ) : (
          (shelves ?? []).map((shelf) => (
            <ShelfCard key={shelf.id} shelf={shelf} booksPerPosition={booksPerPosition} />
          ))
        )}
      </View>

      <Sheet visible={addShelfOpen} onClose={() => setAddShelfOpen(false)} title={t('shelves.addShelf')}>
        <View style={{ gap: theme.spacing.lg }}>
          <TextField
            label={t('shelves.shelfName')}
            placeholder={t('shelves.shelfNamePlaceholder')}
            value={shelfName}
            onChangeText={setShelfName}
            autoFocus
            onSubmitEditing={submitShelf}
            returnKeyType="done"
          />
          {household ? (
            <Toggle label={t('household.share')} hint={household.household.name} value={shareShelf} onChange={setShareShelf} />
          ) : null}
          <Button
            title={t('common.add')}
            fullWidth
            loading={createShelf.isPending}
            disabled={!shelfName.trim()}
            onPress={submitShelf}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

function ShelfCard({
  shelf,
  booksPerPosition,
}: {
  shelf: BookshelfWithPositions;
  booksPerPosition: Map<string, number>;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();

  const { data: household } = useHousehold();
  const createPosition = useCreatePosition();
  const deletePosition = useDeletePosition();
  const deleteShelf = useDeleteBookshelf();
  const setShelfHousehold = useSetBookshelfHousehold();

  const isShared = Boolean(shelf.household_id);
  // Un-sharing is restricted to the shelf's creator at the database level
  // (0015's RLS + assert_user_id_immutable) — only offer the toggle where
  // it would actually succeed.
  const canToggleShare = Boolean(household) && shelf.user_id === user?.id;

  const [addOpen, setAddOpen] = useState(false);
  const [shelfNumber, setShelfNumber] = useState('1');
  const [rowNumber, setRowNumber] = useState('1');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  function confirm(message: string, onConfirm: () => void) {
    if (Platform.OS === 'web') {
      if (globalThis.confirm(message)) onConfirm();
      return;
    }
    Alert.alert('', message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: onConfirm },
    ]);
  }

  async function submitPosition() {
    const shelf_number = Number(shelfNumber);
    const row_number = Number(rowNumber);

    if (!Number.isInteger(shelf_number) || shelf_number < 1 || !Number.isInteger(row_number) || row_number < 1) {
      setError(t('error.generic'));
      return;
    }

    try {
      await createPosition.mutateAsync({
        bookshelfId: shelf.id,
        shelfNumber: shelf_number,
        rowNumber: row_number,
        label,
      });
      setLabel('');
      // Offering the next row up is the common case when someone is setting up
      // a shelf, so the form pre-fills it rather than resetting.
      setRowNumber(String(row_number + 1));
      setError(null);
      setAddOpen(false);
    } catch (cause) {
      // 23505 — this shelf/row pair already exists on this bookshelf.
      const code = (cause as { code?: string })?.code;
      setError(code === '23505' ? t('error.generic') : describeError(cause, t));
    }
  }

  return (
    <Card padded={false}>
      <View style={[styles.shelfHeader, { padding: theme.spacing.lg }]}>
        <Text variant="heading" style={styles.flex}>
          {shelf.name}
        </Text>
        {isShared || canToggleShare ? (
          <Pressable
            onPress={
              canToggleShare
                ? () =>
                    setShelfHousehold.mutate({
                      id: shelf.id,
                      householdId: isShared ? null : (household?.household.id ?? null),
                    })
                : undefined
            }
            disabled={!canToggleShare}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('household.share')}
            style={{ marginRight: theme.spacing.sm, opacity: canToggleShare ? 1 : 0.6 }}
          >
            <Ionicons
              name={isShared ? 'people' : 'people-outline'}
              size={18}
              color={isShared ? theme.colors.primary : theme.colors.textSubtle}
            />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() =>
            confirm(t('shelves.deleteShelfConfirm', { name: shelf.name }), () =>
              deleteShelf.mutate(shelf.id)
            )
          }
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('shelves.deleteShelf')}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
        </Pressable>
      </View>

      {shelf.positions.length === 0 ? (
        <>
          <Divider />
          <View style={{ padding: theme.spacing.lg }}>
            <Text variant="caption" color="textSubtle">
              {t('shelves.noPositions')}
            </Text>
          </View>
        </>
      ) : (
        shelf.positions.map((position) => {
          const count = booksPerPosition.get(position.id) ?? 0;

          return (
            <View key={position.id}>
              <Divider />
              <View style={[styles.positionRow, { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }]}>
                <View style={styles.flex}>
                  <Text variant="body">
                    {formatPosition(
                      {
                        shelf_number: position.shelf_number,
                        row_number: position.row_number,
                        position_label: position.label,
                      },
                      t
                    )}
                  </Text>
                  {count > 0 ? (
                    <Text variant="caption" color="textSubtle">
                      {t('shelves.positionInUse', { count })}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  onPress={() =>
                    confirm(t('shelves.deletePositionConfirm'), () => deletePosition.mutate(position.id))
                  }
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                >
                  <Ionicons name="close" size={18} color={theme.colors.textSubtle} />
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      <Divider />
      <View style={{ padding: theme.spacing.md }}>
        <Button title={t('shelves.addPosition')} variant="ghost" size="sm" icon="add" onPress={() => setAddOpen(true)} />
      </View>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title={t('shelves.addPosition')}>
        <View style={{ gap: theme.spacing.lg }}>
          <View style={[styles.pair, { gap: theme.spacing.md }]}>
            <TextField
              label={t('shelves.shelfNumber')}
              value={shelfNumber}
              onChangeText={setShelfNumber}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={2}
              containerStyle={styles.flex}
            />
            <TextField
              label={t('shelves.rowNumber')}
              value={rowNumber}
              onChangeText={setRowNumber}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={2}
              containerStyle={styles.flex}
            />
          </View>

          <TextField
            label={t('shelves.positionLabel')}
            hint={t('shelves.positionLabelHint')}
            value={label}
            onChangeText={setLabel}
          />

          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title={t('common.add')}
            fullWidth
            loading={createPosition.isPending}
            onPress={submitPosition}
          />
        </View>
      </Sheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shelfHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  positionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pair: { flexDirection: 'row' },
});
