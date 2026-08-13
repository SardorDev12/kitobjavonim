import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCover } from '@/components/BookCover';
import { CategoryPicker } from '@/components/CategoryPicker';
import { PhotoManager } from '@/components/PhotoManager';
import {
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ListRow,
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
import { describeError } from '@/lib/errors';
import { formatAuthors, formatDate, formatPosition, formatPrice, normalizeIsbn, parsePriceInput } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { pickAndUploadBookCover, uploadDroppedBookCover } from '@/lib/images';
import { useImageDropZone } from '@/lib/useImageDropZone';
import { usePositionOptions } from '@/lib/queries/bookshelves';
import { useBookCategories, useSetBookCategories } from '@/lib/queries/categories';
import {
  useDeleteUserBook,
  useLibraryEntry,
  useUpdateBook,
  useUpdateUserBook,
  type UpdateBookInput,
} from '@/lib/queries/library';
import { hasContactMethod } from '@/lib/queries/profile';
import { useTheme } from '@/theme';
import { BOOK_CONDITIONS, READING_STATUSES, type AvailabilityType, type ReadingStatus } from '@/types/database';

export default function BookDetailScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();

  const { data: entry, isPending, isError } = useLibraryEntry(id);
  const positions = usePositionOptions();
  const updateBook = useUpdateUserBook();
  const updateBookDetails = useUpdateBook();
  const deleteBook = useDeleteUserBook();
  const { data: categories } = useBookCategories(entry?.book_id);
  const setCategories = useSetBookCategories();

  const [editBookOpen, setEditBookOpen] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // A page loaded directly (a deep link, or a browser refresh — both routine
  // on web) has no in-app navigation history to pop, so router.back() alone
  // would silently do nothing and leave the back button dead. Falling back to
  // the library root guarantees it always goes somewhere.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  const header = (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
      ]}
    >
      <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
      </Pressable>

      {entry ? (
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.more')}>
          <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  if (isPending) {
    return (
      <View style={styles.fill}>
        {header}
        <Screen>
          <LoadingState />
        </Screen>
      </View>
    );
  }

  if (isError || !entry) {
    return (
      <View style={styles.fill}>
        {header}
        <Screen>
          <EmptyState tone="error" title={t('error.notFound')} />
        </Screen>
      </View>
    );
  }

  const position = formatPosition(entry, t, { includeBookshelf: true });
  const isListed = entry.availability_type !== 'private';

  function patch(changes: Parameters<typeof updateBook.mutate>[0]['patch']) {
    updateBook.mutate({ id: entry!.id, patch: changes });
  }

  function patchAsync(changes: Parameters<typeof updateBook.mutate>[0]['patch']) {
    return updateBook.mutateAsync({ id: entry!.id, patch: changes });
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

  // /book/<id> is the owner's private library entry — sharing that URL would
  // just bounce anyone else to sign-in (or an RLS-blocked page if they did).
  // The menu only offers Share on a listed book (see the menu below), so this
  // always has a real public /listing/<id> link to share.
  async function shareBook() {
    setMenuOpen(false);
    const book = entry!;

    const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
    if (!webOrigin) return;

    const byline = book.authors.length > 0 ? ` — ${formatAuthors(book.authors)}` : '';
    const url = `${webOrigin}/listing/${book.id}`;
    const message = `${book.title}${byline}\n${url}`;

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title: book.title, text: `${book.title}${byline}`, url });
        } catch {
          // AbortError when the user cancels the native share sheet — not a failure.
        }
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        globalThis.alert(t('book.shareCopied'));
      }
      return;
    }

    await Share.share({ message, url });
  }

  return (
    <View style={styles.fill}>
      {header}

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
          <SectionHeader title={t('book.listing')} />

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

              <View style={{ marginTop: theme.spacing.sm }}>
                <PhotoManager userBookId={entry.id} />
              </View>

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

        {/* Categories -------------------------------------------------------
            Saved straight away rather than behind a Save button: these are one
            tap each, and they are what makes this book findable under a category
            filter on the Exchange screen. */}
        <Card>
          <CategoryPicker
            label={t('book.categories')}
            selected={categories ?? []}
            onChange={(next) =>
              setCategories.mutate({
                bookId: entry.book_id,
                categoryIds: next,
                previous: categories ?? [],
              })
            }
          />
        </Card>

        {/* Book metadata ----------------------------------------------------
            Editing (from the three-dot menu) is restricted to whoever added
            this book to the shared catalogue — the RLS policy behind
            useUpdateBook enforces the same rule, this is only what decides
            whether the menu offers the action. */}
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
        onSave={patchAsync}
      />

      <EditBookSheet
        key={`book-${entry.book_id}-${entry.updated_at}`}
        visible={editBookOpen}
        onClose={() => setEditBookOpen(false)}
        entry={entry}
        onSave={(patchValues) =>
          updateBookDetails.mutate({ bookId: entry.book_id, userBookId: entry.id, patch: patchValues })
        }
      />
      </Screen>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        {entry.book_created_by === user?.id ? (
          <>
            <ListRow
              icon="pencil-outline"
              label={t('common.edit')}
              onPress={() => {
                setMenuOpen(false);
                setEditBookOpen(true);
              }}
            />
            <Divider inset={theme.spacing.lg} />
          </>
        ) : null}
        <ListRow
          icon="pricetag-outline"
          label={isListed ? t('book.editListing') : t('book.addListing')}
          onPress={() => {
            setMenuOpen(false);
            setListingOpen(true);
          }}
        />
        <Divider inset={theme.spacing.lg} />
        {isListed ? (
          <>
            <ListRow
              icon="share-outline"
              label={t('common.share')}
              onPress={() => {
                void shareBook();
              }}
            />
            <Divider inset={theme.spacing.lg} />
          </>
        ) : null}
        <ListRow
          icon="trash-outline"
          label={t('book.deleteBook')}
          destructive
          onPress={() => {
            setMenuOpen(false);
            confirmDelete();
          }}
        />
      </Sheet>
    </View>
  );
}

// -----------------------------------------------------------------------------

const EDIT_LANGUAGE_OPTIONS = [
  { value: 'uz', label: 'Oʻzbekcha' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'kaa', label: 'Qaraqalpaqsha' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'ar', label: 'العربية' },
];

function EditBookSheet({
  visible,
  onClose,
  entry,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  entry: {
    title: string;
    subtitle: string | null;
    authors: string[];
    isbn13: string | null;
    publisher: string | null;
    publication_year: number | null;
    language: string | null;
    page_count: number | null;
    cover_url: string | null;
  };
  onSave: (patch: UpdateBookInput['patch']) => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();

  const [title, setTitle] = useState(entry.title);
  const [subtitle, setSubtitle] = useState(entry.subtitle ?? '');
  const [authors, setAuthors] = useState(entry.authors.join(', '));
  const [isbn, setIsbn] = useState(entry.isbn13 ?? '');
  const [publisher, setPublisher] = useState(entry.publisher ?? '');
  const [year, setYear] = useState(entry.publication_year?.toString() ?? '');
  const [language, setLanguage] = useState<string | null>(entry.language);
  const [pages, setPages] = useState(entry.page_count?.toString() ?? '');
  const [coverUrl, setCoverUrl] = useState(entry.cover_url);
  const [coverUploading, setCoverUploading] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  async function pickCover() {
    if (!user || coverUploading) return;
    setCoverUploading(true);
    try {
      const url = await pickAndUploadBookCover(user.id);
      if (url) setCoverUrl(url);
    } finally {
      setCoverUploading(false);
    }
  }

  async function dropCover(file: File) {
    if (!user || coverUploading) return;
    setCoverUploading(true);
    try {
      const url = await uploadDroppedBookCover(user.id, file);
      if (url) setCoverUrl(url);
    } finally {
      setCoverUploading(false);
    }
  }

  const { ref: coverDropRef, isDragOver: coverDragOver } = useImageDropZone(dropCover, !coverUploading);

  function save() {
    if (!title.trim()) {
      setTitleError(t('manual.titleRequired'));
      return;
    }

    const normalizedIsbn = normalizeIsbn(isbn);
    const parsedYear = Number(year);
    const parsedPages = Number(pages);

    onSave({
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      authors: authors
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean),
      isbn13: normalizedIsbn.length === 13 ? normalizedIsbn : entry.isbn13,
      publisher: publisher.trim() || null,
      publication_year:
        Number.isFinite(parsedYear) && parsedYear >= 1400 && parsedYear <= 2200 ? parsedYear : null,
      language,
      page_count: Number.isFinite(parsedPages) && parsedPages > 0 ? parsedPages : null,
      cover_url: coverUrl,
    });

    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('book.editDetails')}>
      <View style={{ gap: theme.spacing.lg }}>
        <Pressable
          ref={coverDropRef}
          onPress={pickCover}
          disabled={coverUploading}
          accessibilityRole="button"
          accessibilityLabel={t('manual.cover')}
          style={({ pressed }) => [
            styles.editCoverRow,
            { opacity: pressed || coverUploading ? 0.7 : 1 },
            // Always-visible on web, not just on drag-over — a hover-only
            // highlight has nothing to hover over until the user already
            // knows dropping is possible here.
            Platform.OS === 'web' && {
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: coverDragOver ? theme.colors.primary : theme.colors.borderStrong,
              padding: theme.spacing.sm,
            },
          ]}
        >
          <BookCover uri={coverUrl} title={title || entry.title} width={80} radius={theme.radius.sm} />
          <View style={styles.editCoverAction}>
            <Ionicons
              name={coverUploading ? 'cloud-upload-outline' : 'camera-outline'}
              size={16}
              color={theme.colors.primary}
            />
            <Text variant="label" color="primary">
              {coverUploading
                ? t('common.saving')
                : coverUrl
                  ? t('manual.changeCover')
                  : Platform.OS === 'web'
                    ? t('manual.addCoverWeb')
                    : t('manual.addCover')}
            </Text>
          </View>
        </Pressable>

        <TextField
          label={t('manual.bookTitle')}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            if (titleError) setTitleError(null);
          }}
          error={titleError}
        />

        <TextField label={t('book.subtitle')} value={subtitle} onChangeText={setSubtitle} />

        <TextField
          label={t('manual.authors')}
          hint={t('manual.authorsHint')}
          value={authors}
          onChangeText={setAuthors}
        />

        <TextField
          label={t('manual.isbn')}
          value={isbn}
          onChangeText={setIsbn}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextField label={t('manual.publisher')} value={publisher} onChangeText={setPublisher} />

        <View style={[styles.pair, { gap: theme.spacing.md }]}>
          <TextField
            label={t('manual.year')}
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={4}
            containerStyle={styles.pairItem}
          />
          <TextField
            label={t('manual.pages')}
            value={pages}
            onChangeText={setPages}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={5}
            containerStyle={styles.pairItem}
          />
        </View>

        <Select
          label={t('manual.language')}
          placeholder={t('common.none')}
          value={language}
          options={EDIT_LANGUAGE_OPTIONS}
          onChange={setLanguage}
          clearable
          clearLabel={t('common.none')}
        />

        <Button title={t('common.save')} fullWidth onPress={save} />
      </View>
    </Sheet>
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
  onSave: (patch: Parameters<ReturnType<typeof useUpdateUserBook>['mutate']>[0]['patch']) => Promise<unknown>;
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8 },
  heroText: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  metaValue: { flex: 1, textAlign: 'right' },
  editCoverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editCoverAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pair: { flexDirection: 'row' },
  pairItem: { flex: 1 },
});
