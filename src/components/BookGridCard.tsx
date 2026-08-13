import { Pressable, StyleSheet, View } from 'react-native';

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

/** A cover-first tile for the Library gallery view — same data as BookCard, denser layout. */
export function BookGridCard({ entry, width, onPress }: { entry: LibraryEntry; width: number; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [{ width, gap: theme.spacing.sm, opacity: pressed ? 0.85 : 1 }]}
    >
      <BookCover uri={entry.cover_url} title={entry.title} width={width} radius={theme.radius.md} />

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
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: 3, alignItems: 'flex-start' },
});
