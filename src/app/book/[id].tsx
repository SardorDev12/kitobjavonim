import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/BookCover';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  LoadingState,
  Rating,
  Screen,
  Select,
  SectionHeader,
  Sheet,
  Text,
  TextField,
  Toggle,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatAuthors, formatDate, formatPosition, formatPrice, parsePriceInput } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { usePositionOptions } from '@/lib/queries/bookshelves';
import { useDeleteUserBook, useLibraryEntry, useUpdateUserBook } from '@/lib/queries/library';
import { hasContactMethod } from '@/lib/queries/profile';
import { useTheme } from '@/theme';
import { BOOK_CONDITIONS, READING_STATUSES, type AvailabilityType, type ReadingStatus } from '@/types/database';

export default function BookDetailScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();

  const { data: entry, isPending, isError } = useLibraryEntry(id);
  const positions = usePositionOptions();
  const updateBook = useUpdateUserBook();
  const deleteBook = useDeleteUserBook();

  const [reviewOpen, setReviewOpen] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);

  if (isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (isError || !entry) {
    return (
      <Screen>
        <EmptyState tone="error" title={t('error.notFound')} />
      </Screen>
    );
  }

  const position = formatPosition(entry, t, { includeBookshelf: true });
  const isListed = entry.availability_type !== 'private';

  function patch(changes: Parameters<typeof updateBook.mutate>[0]['patch']) {
    updateBook.mutate({ id: entry!.id, patch: changes });
  }

  function changeStatus(status: ReadingStatus) {
    // Leaving "finished" would strand a rating and review on a book the user is
    // no longer marking as read, and the DB constraint rejects that pairing, so
    // the review is cleared alongside the status.
    if (status !== 'finished' && entry!.reading_status === 'finished') {
      patch({ reading_status: status, rating: null, review: null, date_finished: null });
      return;
    }

    if (status === 'finished' && !entry!.date_finished) {
      patch({ reading_status: status, date_finished: new Date().toISOString().slice(0, 10) });
      return;
    }

    patch({ reading_status: status });
  }

  function confirmDelete() {
    const title = t('book.deleteBook');
    const message = t('book.deleteConfirm', { title: entry!.title });

    const remove = async () => {
      await deleteBook.mutateAsync(entry!.id);
      router.replace('/(tabs)');
    };

    // React Native's Alert is a no-op on web, so the browser's own confirm is
    // the only thing that will actually stop a destructive action there.
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`${message}\n\n${t('common.confirmDelete')}`)) void remove();
      return;
    }

    Alert.alert(title, `${message}\n\n${t('common.confirmDelete')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void remove() },
    ]);
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.xl }}>
        {/* ---------------------------------------------------------------- */}
        <View style={[styles.hero, { gap: theme.spacing.lg }]}>
          <BookCover uri={entry.cover_url} title={entry.title} width={110} radius={theme.radius.md} />

          <View style={styles.heroText}>
            <Text variant="title">{entry.title}</Text>
            {entry.subtitle ? (
              <Text variant="body" color="textMuted">
                {entry.subtitle}
              </Text>
            ) : null}
            {entry.authors.length > 0 ? (
              <Text variant="body" color="textMuted">
                {formatAuthors(entry.authors)}
              </Text>
            ) : null}

            <Text variant="caption" color="textSubtle" style={{ marginTop: 4 }}>
              {t('book.addedOn', { date: formatDate(entry.date_added, locale) })}
            </Text>
          </View>
        </View>

        {/* Reading status --------------------------------------------------- */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color="textMuted">
            {t('book.readingStatusLabel')}
          </Text>
          <View style={styles.chips}>
            {READING_STATUSES.map((option) => (
              <Chip
                key={option}
                label={t(`status.${option}`)}
                selected={entry.reading_status === option}
                onPress={() => changeStatus(option)}
              />
            ))}
          </View>
          {entry.date_finished ? (
            <Text variant="caption" color="textSubtle">
              {t('book.finishedOn', { date: formatDate(entry.date_finished, locale) })}
            </Text>
          ) : null}
        </View>

        {/* Review ----------------------------------------------------------- */}
        <Card>
          <SectionHeader
            title={t('book.review')}
            action={
              entry.reading_status === 'finished' ? (
                <Pressable onPress={() => setReviewOpen(true)} hitSlop={8}>
                  <Text variant="label" color="primary">
                    {entry.review || entry.rating ? t('common.edit') : t('common.add')}
                  </Text>
                </Pressable>
              ) : null
            }
          />

          {entry.reading_status !== 'finished' ? (
            <Text variant="caption" color="textSubtle">
              {t('book.markFinished')}
            </Text>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {entry.rating ? <Rating value={entry.rating} readOnly size={18} /> : null}
              {entry.review ? (
                <Text variant="body">{entry.review}</Text>
              ) : (
                <Text variant="caption" color="textSubtle">
                  {t('book.reviewPlaceholder')}
                </Text>
              )}
              <Text variant="caption" color="textSubtle">
                {t('book.reviewPrivate')}
              </Text>
            </View>
          )}
        </Card>

        {/* Location --------------------------------------------------------- */}
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color="textMuted">
            {t('book.location')}
          </Text>

          {positions.length > 0 ? (
            <Select
              placeholder={t('book.noLocation')}
              value={entry.bookshelf_position_id}
              options={positions}
              onChange={(value) => patch({ bookshelf_position_id: value })}
              clearable
              clearLabel={t('book.noLocation')}
            />
          ) : (
            <Card>
              <Text variant="body" color="textMuted">
                {t('shelves.emptyBody')}
              </Text>
              <Button
                title={t('shelves.addShelf')}
                variant="secondary"
                size="sm"
                style={{ marginTop: theme.spacing.md }}
                onPress={() => router.push('/bookshelves')}
              />
            </Card>
          )}

          {position ? (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={theme.colors.primary} />
              <Text variant="caption" color="textMuted">
                {position}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Listing ---------------------------------------------------------- */}
        <Card>
          <SectionHeader
            title={t('book.listing')}
            action={
              <Pressable onPress={() => setListingOpen(true)} hitSlop={8}>
                <Text variant="label" color="primary">
                  {isListed ? t('common.edit') : t('common.add')}
                </Text>
              </Pressable>
            }
          />

          {isListed ? (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={styles.chips}>
                <Chip readOnly tone="warning" label={t(`availability.${entry.availability_type}`)} />
                {entry.condition ? <Chip readOnly label={t(`condition.${entry.condition}`)} /> : null}
              </View>

              {entry.sale_price !== null ? (
                <Text variant="bodyStrong" color="primary">
                  {formatPrice(entry.sale_price, locale, entry.sale_currency)}
                  {entry.price_negotiable ? ` · ${t('book.negotiable')}` : ''}
                </Text>
              ) : null}

              {entry.exchange_preferences ? (
                <Text variant="body" color="textMuted">
                  {t('discover.wants')}: {entry.exchange_preferences}
                </Text>
              ) : null}

              <Button
                title={t('book.removeListing')}
                variant="ghost"
                size="sm"
                onPress={() => patch({ availability_type: 'private' })}
              />
            </View>
          ) : (
            <Text variant="caption" color="textSubtle">
              {t('book.notListed')}
            </Text>
          )}
        </Card>

        {/* Book metadata ---------------------------------------------------- */}
        <Card padded={false}>
          <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
            <Text variant="heading">{t('book.about')}</Text>
          </View>

          <MetaRow label={t('book.isbn')} value={entry.isbn13} />
          <MetaRow label={t('book.publisher')} value={entry.publisher} />
          <MetaRow label={t('book.year')} value={entry.publication_year?.toString()} />
          <MetaRow label={t('book.pages')} value={entry.page_count?.toString()} />
          <MetaRow label={t('condition.label')} value={entry.condition ? t(`condition.${entry.condition}`) : null} />
        </Card>

        <Button title={t('book.deleteBook')} variant="danger" fullWidth onPress={confirmDelete} />
      </View>

      {/* Both sheets seed their form state from the entry on mount, so they are
          keyed to it — otherwise reopening one after a save would show the
          values from before the edit. */}
      <ReviewSheet
        key={`review-${entry.updated_at}`}
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
        initialRating={entry.rating}
        initialReview={entry.review}
        onSave={(rating, review) =>
          patch({
            rating,
            review,
            reading_status: 'finished',
            date_finished: entry.date_finished ?? new Date().toISOString().slice(0, 10),
          })
        }
      />

      <ListingSheet
        key={`listing-${entry.updated_at}`}
        visible={listingOpen}
        onClose={() => setListingOpen(false)}
        entry={entry}
        canList={hasContactMethod(profile)}
        onOpenProfile={() => {
          setListingOpen(false);
          router.push('/settings/profile');
        }}
        onSave={patch}
      />
    </Screen>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  const theme = useTheme();
  if (!value) return null;

  return (
    <>
      <Divider />
      <View style={[styles.metaRow, { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }]}>
        <Text variant="body" color="textMuted">
          {label}
        </Text>
        <Text variant="body" style={styles.metaValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </>
  );
}

// -----------------------------------------------------------------------------

function ReviewSheet({
  visible,
  onClose,
  initialRating,
  initialReview,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  initialRating: number | null;
  initialReview: string | null;
  onSave: (rating: number | null, review: string | null) => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  const [rating, setRating] = useState(initialRating);
  const [review, setReview] = useState(initialReview ?? '');

  return (
    <Sheet visible={visible} onClose={onClose} title={t('book.review')}>
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color="textMuted">
            {t('book.rating')}
          </Text>
          <Rating value={rating} onChange={setRating} />
        </View>

        <TextField
          label={t('book.review')}
          hint={t('book.reviewPrivate')}
          value={review}
          onChangeText={setReview}
          placeholder={t('book.reviewPlaceholder')}
          multiline
        />

        <Button
          title={t('common.save')}
          fullWidth
          onPress={() => {
            onSave(rating, review.trim() || null);
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}

// -----------------------------------------------------------------------------

function ListingSheet({
  visible,
  onClose,
  entry,
  canList,
  onOpenProfile,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  entry: { availability_type: AvailabilityType; sale_price: number | null; price_negotiable: boolean; exchange_preferences: string | null; sale_description: string | null; condition: string | null };
  canList: boolean;
  onOpenProfile: () => void;
  onSave: (patch: Parameters<ReturnType<typeof useUpdateUserBook>['mutate']>[0]['patch']) => void;
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

  function save() {
    const parsedPrice = parsePriceInput(price);

    if (forSale && parsedPrice === null) {
      setError(t('book.priceRequired'));
      return;
    }

    // Exchange and sale are two flags over one enum, which is what lets a book be
    // offered both ways without a second listing record.
    const availability: AvailabilityType =
      forExchange && forSale
        ? 'exchange_or_sale'
        : forSale
          ? 'sale'
          : forExchange
            ? 'exchange'
            : 'private';

    onSave({
      availability_type: availability,
      sale_price: forSale ? parsedPrice : null,
      price_negotiable: forSale ? negotiable : false,
      exchange_preferences: forExchange ? preferences.trim() || null : null,
      sale_description: forSale ? description.trim() || null : null,
    });

    onClose();
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

        <Button title={t('common.save')} fullWidth onPress={save} disabled={!canList} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8 },
  heroText: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  metaValue: { flex: 1, textAlign: 'right' },
});
