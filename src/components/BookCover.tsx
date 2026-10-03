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

// Cloth-binding colours for covers that have no art: deep, slightly muted tones
// that read as real book bindings on both the light and dark backgrounds.
const BINDING_COLORS = [
  '#1F5C4A', // forest green
  '#7A2635', // wine
  '#2B3A67', // indigo
  '#8A4B1F', // sienna
  '#3E3A5E', // plum
  '#2F5D62', // teal
  '#5B4A2E', // umber
  '#4A4F57', // slate
] as const;

const COVER_TEXT = '#FFFDF8';
const COVER_GILT = '#E0C179';

/** Same title, same colour, every time — a small string hash, nothing more. */
function bindingColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return BINDING_COLORS[hash % BINDING_COLORS.length];
}

export function BookCover({
  uri,
  title,
  authors,
  width,
  radius,
}: {
  uri?: string | null;
  title: string;
  /** Only used for the art-less placeholder, and only when it's big enough to read. */
  authors?: string[];
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

  // No cover art: a cloth-bound cover instead of a blank box, in a colour
  // picked from the title, with the title (and author, once there's room for
  // it) set in cream and a thin gilt rule — so a shelf of art-less books still
  // looks like a shelf of different books.
  const author = authors && authors.length > 0 ? authors[0] : null;
  const showAuthor = Boolean(author) && width >= 80;
  const titleSize = Math.max(10, width * 0.13);

  return (
    <View
      style={[
        styles.cover,
        styles.placeholder,
        {
          width,
          height,
          borderRadius,
          backgroundColor: bindingColor(title),
          paddingHorizontal: width * 0.14,
          paddingVertical: width * 0.16,
        },
      ]}
    >
      <View style={styles.spine} />
      <View style={[styles.rule, { backgroundColor: COVER_GILT, marginBottom: width * 0.08 }]} />
      <Text
        numberOfLines={showAuthor ? 4 : 5}
        style={{ color: COVER_TEXT, fontSize: titleSize, lineHeight: titleSize * 1.2, fontWeight: '700' }}
      >
        {title}
      </Text>
      {showAuthor ? (
        <Text
          numberOfLines={1}
          style={{ color: COVER_GILT, fontSize: Math.max(9, width * 0.1), marginTop: width * 0.06, fontWeight: '500' }}
        >
          {author}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden' },
  placeholder: { justifyContent: 'flex-start' },
  // A darker band down the left edge, like the shaded hinge of a hardback.
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: 'rgba(0,0,0,0.22)' },
  rule: { width: 18, height: 2, borderRadius: 1 },
});
