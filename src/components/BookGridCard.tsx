import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { formatAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';
import type { LibraryEntry } from '@/types/database';

import { BookCover } from './BookCover';
import { Chip, Text } from './ui';

const STATUS_TONE = {
  want_to_read: 'neutral',
  reading: 'primary',
  finished: 'success',
} as const;

/**
 * A cover-first tile for the Library gallery view — same data as BookCard,
 * denser layout. See BookCard's comment for why onPress takes an id, this
 * is memoized, and how onLongPress/selected stay render-cheap.
 */
export const BookGridCard = memo(function BookGridCard({
  entry,
  width,
  onPress,
  onLongPress,
  selectable = false,
  selected = false,
}: {
  entry: LibraryEntry;
  width: number;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
  /** True while Library's multiselect mode is active — swaps the tap target and shows the checkbox. */
  selectable?: boolean;
  selected?: boolean;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const addedByOther = entry.user_id !== user?.id ? entry.added_by_name : null;
  const handlePress = useCallback(() => onPress(entry.id), [onPress, entry.id]);
  const handleLongPress = useCallback(() => onLongPress?.(entry.id), [onLongPress, entry.id]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityState={selectable ? { selected } : undefined}
      style={({ pressed }) => [{ width, gap: theme.spacing.sm, opacity: pressed ? 0.85 : 1 }]}
    >
      <View>
        <BookCover uri={entry.cover_url} title={entry.title} width={width} radius={theme.radius.md} />
        {selectable ? (
          <View style={[styles.checkboxBadge, { backgroundColor: theme.colors.background }]}>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={selected ? theme.colors.primary : theme.colors.textSubtle}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text variant="label" numberOfLines={2}>
          {entry.title}
        </Text>

        {entry.authors.length > 0 ? (
          <Text variant="caption" color="textSubtle" numberOfLines={1}>
            {formatAuthors(entry.authors)}
          </Text>
        ) : null}

        <Chip readOnly label={t(`status.${entry.reading_status}`)} tone={STATUS_TONE[entry.reading_status]} />

        {addedByOther ? (
          <Text variant="caption" color="textSubtle" numberOfLines={1}>
            {t('household.addedBy', { name: addedByOther })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  body: { gap: 3, alignItems: 'flex-start' },
  checkboxBadge: { position: 'absolute', top: 6, right: 6, borderRadius: 999 },
});
