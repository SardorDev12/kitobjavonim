import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';
import type { LibraryEntry } from '@/types/database';

import { Chip, Text } from './ui';

/** The one optional field the compact list shows next to author and title. */
export type CompactField = 'pages' | 'location' | 'status' | 'rating' | 'availability';
export const COMPACT_FIELDS: CompactField[] = ['pages', 'location', 'status', 'rating', 'availability'];

const STATUS_TONE = {
  want_to_read: 'neutral',
  reading: 'primary',
  finished: 'success',
} as const;

/**
 * One-line row for Library's compact view: author, title, and a single field
 * the reader picked. Memoized and given the same stable-callback props as
 * BookCard, for the same virtualized-list reason (see its docstring).
 */
export const BookCompactRow = memo(function BookCompactRow({
  entry,
  field,
  onPress,
  onLongPress,
  selectable = false,
  selected = false,
}: {
  entry: LibraryEntry;
  field: CompactField;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
  selectable?: boolean;
  selected?: boolean;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  const handlePress = useCallback(() => onPress(entry.id), [onPress, entry.id]);
  const handleLongPress = useCallback(() => onLongPress?.(entry.id), [onLongPress, entry.id]);

  const authors = entry.authors.length > 0 ? formatAuthors(entry.authors) : null;

  let extra: React.ReactNode = null;
  switch (field) {
    case 'pages':
      if (entry.page_count) {
        extra = (
          <Text variant="caption" color="textMuted">
            {entry.page_count}
          </Text>
        );
      }
      break;
    case 'location':
      if (entry.shelf_note) {
        extra = (
          <View style={styles.inline}>
            <Ionicons name="location-outline" size={13} color={theme.colors.textSubtle} />
            <Text variant="caption" color="textSubtle" numberOfLines={1} style={styles.locationText}>
              {entry.shelf_note}
            </Text>
          </View>
        );
      }
      break;
    case 'status':
      extra = <Chip readOnly label={t(`status.${entry.reading_status}`)} tone={STATUS_TONE[entry.reading_status]} />;
      break;
    case 'rating':
      if (entry.rating) {
        extra = (
          <View style={styles.inline}>
            <Ionicons name="star" size={13} color={theme.colors.accent} />
            <Text variant="caption" color="textMuted">
              {entry.rating}
            </Text>
          </View>
        );
      }
      break;
    case 'availability':
      if (entry.availability_type !== 'private') {
        extra = (
          <Chip
            readOnly
            tone="warning"
            icon={entry.availability_type === 'exchange' ? 'swap-horizontal' : 'pricetag'}
            label={t(`availability.${entry.availability_type}`)}
          />
        );
      }
      break;
  }

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityState={selectable ? { selected } : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          paddingVertical: theme.spacing.sm + 2,
          paddingHorizontal: theme.spacing.lg,
          gap: theme.spacing.md,
          borderBottomColor: theme.colors.border,
          backgroundColor: selected
            ? theme.colors.primarySoft
            : pressed
              ? theme.colors.surfaceSunken
              : 'transparent',
        },
      ]}
    >
      {selectable ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={20}
          color={selected ? theme.colors.primary : theme.colors.textSubtle}
        />
      ) : null}

      <Text numberOfLines={1} style={styles.text}>
        {authors ? (
          <Text variant="caption" color="textMuted">
            {authors} –{' '}
          </Text>
        ) : null}
        <Text variant="bodyStrong">{entry.title}</Text>
      </Text>

      {extra ? <View style={styles.extra}>{extra}</View> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  // Author and title share whatever the optional field leaves free, and
  // cut off with an ellipsis so every row stays one line tall.
  text: { flex: 1 },
  // The field keeps its own width (capped for long shelf notes) so it never
  // gets squeezed out by a long title.
  extra: { maxWidth: '35%', flexShrink: 0, alignItems: 'flex-end' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { flexShrink: 1 },
});
