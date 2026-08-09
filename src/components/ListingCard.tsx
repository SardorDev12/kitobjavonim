import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatAuthors, formatPrice } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';
import type { Listing } from '@/types/database';

import { BookCover } from './BookCover';
import { Chip, Text } from './ui';

/** A tile in the Exchange grid. */
export function ListingCard({
  listing,
  width,
  locationLabel,
  onPress,
}: {
  listing: Listing;
  width: number;
  locationLabel?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t, locale } = useI18n();

  const isSale = listing.availability_type === 'sale' || listing.availability_type === 'exchange_or_sale';
  const isExchange =
    listing.availability_type === 'exchange' || listing.availability_type === 'exchange_or_sale';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [{ width, gap: theme.spacing.sm, opacity: pressed ? 0.85 : 1 }]}
    >
      <BookCover uri={listing.cover_url} title={listing.title} width={width} radius={theme.radius.md} />

      <View style={styles.body}>
        <Text variant="label" numberOfLines={2}>
          {listing.title}
        </Text>

        {listing.authors.length > 0 ? (
          <Text variant="caption" color="textSubtle" numberOfLines={1}>
            {formatAuthors(listing.authors)}
          </Text>
        ) : null}

        {/* Price is the headline when there is one; a pure exchange gets a chip
            so the two listing types stay visually distinguishable in one grid. */}
        {isSale && listing.sale_price !== null ? (
          <Text variant="bodyStrong" color="primary" numberOfLines={1}>
            {formatPrice(listing.sale_price, locale, listing.sale_currency)}
            {listing.price_negotiable ? ' ~' : ''}
          </Text>
        ) : null}

        <View style={styles.chips}>
          {isExchange && !isSale ? (
            <Chip readOnly tone="primary" icon="swap-horizontal" label={t('discover.type.exchange')} />
          ) : null}
          {listing.condition ? <Chip readOnly label={t(`condition.${listing.condition}`)} /> : null}
        </View>

        {locationLabel ? (
          <View style={styles.location}>
            <Ionicons name="location-outline" size={12} color={theme.colors.textSubtle} />
            <Text variant="caption" color="textSubtle" numberOfLines={1} style={styles.locationText}>
              {locationLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  locationText: { flex: 1 },
});
