import { useState } from 'react';
import { View } from 'react-native';

import { describeError } from '@/lib/errors';
import { parsePriceInput } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { UpdateUserBookInput } from '@/lib/queries/library';
import { useTheme } from '@/theme';
import type { AvailabilityType } from '@/types/database';

import { PhotoManager } from './PhotoManager';
import { Button, Card, Divider, Sheet, Text, TextField, Toggle } from './ui';

/**
 * The listing editor — shared by book/[id].tsx (the owner's private view)
 * and listing/[id].tsx (the public view, when the viewer is the owner
 * looking at their own listing). Exchange and sale are two flags over one
 * `availability_type` enum, which is what lets a book be offered both ways
 * without a second listing record.
 *
 * Condition photos live here too, not in a separate always-visible section —
 * this is the one place a listing gets edited, so it is the one place that
 * should need opening. It also means photos can be attached before a book
 * is listed for the first time, instead of only after saving once.
 */
export function ListingSheet({
  visible,
  onClose,
  entry,
  canList,
  onOpenProfile,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  entry: {
    id: string;
    availability_type: AvailabilityType;
    sale_price: number | null;
    price_negotiable: boolean;
    exchange_preferences: string | null;
    sale_description: string | null;
    condition: string | null;
  };
  canList: boolean;
  onOpenProfile: () => void;
  onSave: (patch: UpdateUserBookInput['patch']) => Promise<unknown>;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  const [forExchange, setForExchange] = useState(
    entry.availability_type === 'exchange' || entry.availability_type === 'exchange_or_sale'
  );
  const [forSale, setForSale] = useState(
    entry.availability_type === 'sale' || entry.availability_type === 'exchange_or_sale'
  );
  const [price, setPrice] = useState(entry.sale_price ? String(entry.sale_price) : '');
  const [negotiable, setNegotiable] = useState(entry.price_negotiable);
  const [preferences, setPreferences] = useState(entry.exchange_preferences ?? '');
  const [description, setDescription] = useState(entry.sale_description ?? '');
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  async function save() {
    const parsedPrice = parsePriceInput(price);

    if (forSale && parsedPrice === null) {
      setError(t('book.priceRequired'));
      return;
    }

    const availability: AvailabilityType =
      forExchange && forSale
        ? 'exchange_or_sale'
        : forSale
          ? 'sale'
          : forExchange
            ? 'exchange'
            : 'private';

    setError(null);
    setSaving(true);

    try {
      await onSave({
        availability_type: availability,
        sale_price: forSale ? parsedPrice : null,
        price_negotiable: forSale ? negotiable : false,
        exchange_preferences: forExchange ? preferences.trim() || null : null,
        sale_description: forSale ? description.trim() || null : null,
      });
      onClose();
    } catch (cause) {
      setError(describeError(cause, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('book.listing')}>
      <View style={{ gap: theme.spacing.lg }}>
        {!canList ? (
          <Card style={{ backgroundColor: theme.colors.warningSoft, borderColor: 'transparent' }}>
            <Text variant="body">{t('book.contactRequired')}</Text>
            <Button
              title={t('profile.contactDetails')}
              variant="secondary"
              size="sm"
              style={{ marginTop: theme.spacing.md }}
              onPress={onOpenProfile}
            />
          </Card>
        ) : null}

        <Toggle
          label={t('availability.exchange')}
          value={forExchange}
          onChange={setForExchange}
          disabled={!canList}
        />

        {forExchange ? (
          <TextField
            label={t('book.exchangePreferences')}
            placeholder={t('book.exchangePreferencesPlaceholder')}
            value={preferences}
            onChangeText={setPreferences}
            multiline
          />
        ) : null}

        <Divider />

        <Toggle label={t('availability.sale')} value={forSale} onChange={setForSale} disabled={!canList} />

        {forSale ? (
          <>
            <TextField
              label={t('book.price')}
              placeholder={t('book.pricePlaceholder')}
              value={price}
              onChangeText={(value) => {
                setPrice(value);
                if (error) setError(null);
              }}
              keyboardType="number-pad"
              inputMode="numeric"
              error={error}
            />
            <Toggle label={t('book.negotiable')} value={negotiable} onChange={setNegotiable} />
            <TextField
              label={t('book.saleDescription')}
              placeholder={t('book.saleDescriptionPlaceholder')}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </>
        ) : null}

        <Divider />

        <PhotoManager userBookId={entry.id} />

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        <Button title={t('common.save')} fullWidth onPress={save} disabled={!canList} loading={saving} />
      </View>
    </Sheet>
  );
}
