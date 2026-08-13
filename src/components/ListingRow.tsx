import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatAuthors, formatPrice } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';
import type { Listing } from '@/types/database';

import { BookCover } from './BookCover';
import { Chip, Text } from './ui';

/**
 * A row in the Discover list view — same data as ListingCard, denser layout.
 * See ListingCard's comment for why onPress takes an id and this is memoized.
 */
export const ListingRow = memo(function ListingRow({
  listing,
  locationLabel,
  onPress,
}: {
  listing: Listing;
  locationLabel?: string;
  onPress: (id: string) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useI18n();

  const isSale = listing.availability_type === 'sale' || listing.availability_type === 'exchange_or_sale';
  const isExchange =
    listing.availability_type === 'exchange' || listing.availability_type === 'exchange_or_sale';

  const handlePress = useCallback(() => onPress(listing.id), [onPress, listing.id]);

  return (
    <Pressable
      onPress={handlePress}
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
      <BookCover uri={listing.cover_url} title={listing.title} width={56} />

      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {listing.title}
        </Text>

        {listing.authors.length > 0 ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {formatAuthors(listing.authors)}
          </Text>
        ) : null}

        <View style={styles.meta}>
          {isSale && listing.sale_price !== null ? (
            <Text variant="label" color="primary">
              {formatPrice(listing.sale_price, locale, listing.sale_currency)}
              {listing.price_negotiable ? ' ~' : ''}
            </Text>
          ) : null}
          {isExchange ? (
            <Chip readOnly tone="primary" icon="swap-horizontal" label={t('discover.type.exchange')} />
          ) : null}
          {listing.condition ? <Chip readOnly label={t(`condition.${listing.condition}`)} /> : null}
        </View>

        {locationLabel ? (
          <View style={styles.location}>
            <Ionicons name="location-outline" size={13} color={theme.colors.textSubtle} />
            <Text variant="caption" color="textSubtle" numberOfLines={1} style={styles.locationText}>
              {locationLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  body: { flex: 1, maxWidth: 480, gap: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { flex: 1 },
});
