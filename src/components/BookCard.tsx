import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatAuthors, formatPosition } from '@/lib/format';
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
 * A row in My Library.
 *
 * Shows everything the PRD asks a card to carry — cover, title, author, reading
 * status, shelf location, and an exchange/sale indicator — without a tap.
 */
export function BookCard({ entry, onPress }: { entry: LibraryEntry; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();

  const position = formatPosition(entry, t, { includeBookshelf: true });
  const isListed = entry.availability_type !== 'private';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        {
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          gap: theme.spacing.md,
          backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
        },
      ]}
    >
      <BookCover uri={entry.cover_url} title={entry.title} width={56} />

      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {entry.title}
        </Text>

        {entry.authors.length > 0 ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {formatAuthors(entry.authors)}
          </Text>
        ) : null}

        <View style={styles.meta}>
          <Chip readOnly label={t(`status.${entry.reading_status}`)} tone={STATUS_TONE[entry.reading_status]} />

          {isListed ? (
            <Chip
              readOnly
              tone="warning"
              icon={entry.availability_type === 'exchange' ? 'swap-horizontal' : 'pricetag'}
              label={t(`availability.${entry.availability_type}`)}
            />
          ) : null}
        </View>

        {position ? (
          <View style={styles.location}>
            <Ionicons name="location-outline" size={13} color={theme.colors.textSubtle} />
            <Text variant="caption" color="textSubtle" numberOfLines={1} style={styles.locationText}>
              {position}
            </Text>
          </View>
        ) : null}
      </View>

      {entry.rating ? (
        <View style={styles.rating}>
          <Ionicons name="star" size={13} color={theme.colors.accent} />
          <Text variant="caption" color="textMuted">
            {entry.rating}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  body: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { flex: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingTop: 2 },
});
