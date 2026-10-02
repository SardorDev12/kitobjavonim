import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';
import type { LibraryEntry } from '@/types/database';

import { Text } from './ui';

/** The one optional field the compact list shows next to author and title. */
export type CompactField = 'pages' | 'location' | 'status' | 'rating' | 'availability';
export const COMPACT_FIELDS: CompactField[] = ['pages', 'location', 'status', 'rating', 'availability'];

/**
 * Row for Library's compact view: three columns — author, title, and a single
 * field the reader picked — each wrapping to at most two lines. Memoized and given the same stable-callback props as
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
            <Text variant="caption" color="textSubtle" numberOfLines={2} style={styles.inlineText}>
              {entry.shelf_note}
            </Text>
          </View>
        );
      }
      break;
    case 'status':
      extra = (
        <Text variant="caption" color={STATUS_COLOR[entry.reading_status]} numberOfLines={2}>
          {t(`status.${entry.reading_status}`)}
        </Text>
      );
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
          <Text variant="caption" color="warning" numberOfLines={2}>
            {t(`availability.${entry.availability_type}`)}
          </Text>
        );
      }
      break;
  }

  const divider = <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityState={selectable ? { selected } : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.spacing.lg,
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
        <View style={[styles.checkbox, { paddingRight: theme.spacing.sm }]}>
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={20}
            color={selected ? theme.colors.primary : theme.colors.textSubtle}
          />
        </View>
      ) : null}

      <View style={[styles.cell, styles.authorCell, { paddingVertical: theme.spacing.sm + 2, paddingRight: theme.spacing.sm }]}>
        <Text variant="caption" color="textMuted" numberOfLines={2}>
          {authors ?? ''}
        </Text>
      </View>
      {divider}
      <View style={[styles.cell, styles.titleCell, { paddingVertical: theme.spacing.sm + 2, paddingHorizontal: theme.spacing.sm }]}>
        <Text variant="label" numberOfLines={2} style={styles.title}>
          {entry.title}
        </Text>
      </View>
      {divider}
      <View style={[styles.cell, styles.fieldCell, { paddingVertical: theme.spacing.sm + 2, paddingLeft: theme.spacing.sm }]}>
        {extra}
      </View>
    </Pressable>
  );
});

const STATUS_COLOR = {
  want_to_read: 'textMuted',
  reading: 'primary',
  finished: 'success',
} as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth },
  checkbox: { justifyContent: 'center' },
  // Three fixed-proportion columns (flexBasis 0, so the share doesn't depend
  // on content): author gets the most room, title a bit less, the one extra
  // field the least. Each wraps to at most two lines; the dividers stretch the
  // full row height so the columns line up from row to row.
  cell: { flexBasis: 0, justifyContent: 'center', minWidth: 0 },
  authorCell: { flexGrow: 4 },
  titleCell: { flexGrow: 3 },
  fieldCell: { flexGrow: 2 },
  title: { fontWeight: '700' },
  divider: { width: StyleSheet.hairlineWidth },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inlineText: { flexShrink: 1 },
});
