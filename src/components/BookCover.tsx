import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './ui';

/** Physical books are close to 2:3, and keeping every cover on that ratio is what
 *  makes a shelf of mixed-source thumbnails read as a tidy grid. */
export const COVER_ASPECT = 2 / 3;

/**
 * Fixed tile width for gallery/grid views (Library, Discover) — deliberately
 * a constant rather than dividing the container by a breakpoint-based column
 * count. A fixed size keeps every tile the same small size on every screen;
 * a wider screen just fits more columns of it, rather than the same column
 * count rendering visibly larger tiles.
 */
export const GALLERY_TILE_WIDTH = 100;

export function BookCover({
  uri,
  title,
  width,
  radius,
}: {
  uri?: string | null;
  title: string;
  width: number;
  radius?: number;
}) {
  const theme = useTheme();
  const height = width / COVER_ASPECT;
  const borderRadius = radius ?? theme.radius.sm;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.cover, { width, height, borderRadius, backgroundColor: theme.colors.skeleton }]}
        contentFit="cover"
        transition={200}
        recyclingKey={uri}
      />
    );
  }

  // No cover art: draw a cloth-bound spine instead of a grey box, so a manually
  // added local book still looks like a book on the shelf.
  return (
    <View
      style={[
        styles.cover,
        styles.placeholder,
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.colors.surfaceSunken,
          borderColor: theme.colors.border,
          padding: width * 0.1,
        },
      ]}
    >
      <View style={[styles.spine, { backgroundColor: theme.colors.primarySoft }]} />
      <Text
        variant="caption"
        color="textMuted"
        numberOfLines={4}
        style={{ fontSize: Math.max(10, width * 0.11), lineHeight: Math.max(13, width * 0.15) }}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden' },
  placeholder: { borderWidth: 1, justifyContent: 'flex-end' },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
});
