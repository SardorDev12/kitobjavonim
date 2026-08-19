import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AddShelfSheet } from '@/components/AddShelfSheet';
import { BookCover } from '@/components/BookCover';
import { CategoryPicker } from '@/components/CategoryPicker';
import { AuthorsField, Button, Card, Chip, EmptyState, Screen, Select, Sheet, Text, TextField, Toggle } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { setPendingBook, usePendingBook } from '@/features/add/pendingBook';
import type { BookCandidate } from '@/lib/books/metadata';
import { describeError } from '@/lib/errors';
import { formatAuthors, normalizeIsbn, parseAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { pickAndUploadBookCover, uploadDroppedBookCover } from '@/lib/images';
import { scrollFieldAboveKeyboard } from '@/lib/keyboard';
import { useImageDropZone } from '@/lib/useImageDropZone';
import { usePositionOptions } from '@/lib/queries/bookshelves';
import { useSetBookCategories } from '@/lib/queries/categories';
import { useHousehold } from '@/lib/queries/household';
import { useAddBook, useLibrary } from '@/lib/queries/library';
import { useLayout, useTheme } from '@/theme';
import { BOOK_CONDITIONS, READING_STATUSES, type BookCondition, type ReadingStatus } from '@/types/database';

const LANGUAGE_OPTIONS = [
  { value: 'uz', label: 'Oʻzbekcha' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'kaa', label: 'Qaraqalpaqsha' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'ar', label: 'العربية' },
];

/**
 * The last step of adding a book: reading status, condition, and where it lives.
 *
 * Everything here has a sensible default so the whole screen can be dismissed
 * with a single tap on "Add to library" — which is what keeps the flow inside
 * the ten seconds the PRD asks for.
 */
export default function ConfigureScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const candidate = usePendingBook();
  const positions = usePositionOptions();
  const { data: library } = useLibrary();
  const { data: household } = useHousehold();
  const addBook = useAddBook();
  const setCategories = useSetBookCategories();

  const [positionId, setPositionId] = useState<string | null>(null);
  const [addShelfOpen, setAddShelfOpen] = useState(false);
  const [status, setStatus] = useState<ReadingStatus>('want_to_read');
  const [condition, setCondition] = useState<BookCondition | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  // Sharing is the point of being in a household, so it starts on — see
  // 0015_households.sql's design notes on per-row opt-in sharing.
  const [shareBook, setShareBook] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // A hard refresh on web clears the in-memory selection; send the user back
  // rather than showing an empty form.
  useEffect(() => {
    if (!candidate) router.replace('/(tabs)/add');
  }, [candidate, router]);

  const duplicate = useMemo(() => {
    if (!candidate?.isbn13 || !library) return null;
    return library.find((entry) => entry.isbn13 === candidate.isbn13) ?? null;
  }, [candidate, library]);

  if (!candidate) {
    return (
      <Screen>
        <EmptyState title={t('error.notFound')} />
      </Screen>
    );
  }

  async function save() {
    if (!candidate) return;
    setError(null);

    try {
      const { userBookId, bookId } = await addBook.mutateAsync({
        candidate,
        bookshelfPositionId: positionId,
        readingStatus: status,
        condition,
        householdId: household && shareBook ? household.household.id : null,
      });

      // Categories are secondary to getting the book onto the shelf, so a
      // failure here must not lose the book the user just added.
      if (categoryIds.length > 0) {
        try {
          await setCategories.mutateAsync({ bookId, categoryIds, previous: [] });
        } catch {
          // Recoverable from the book's own screen.
        }
      }

      router.replace(`/book/${userBookId}`);
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  const showDuplicateGate = duplicate !== null && !duplicateAcknowledged;

  return (
    <Screen
      scroll
      footer={
        <Button
          title={showDuplicateGate ? t('add.addAnyway') : t('add.addToLibrary')}
          fullWidth
          loading={addBook.isPending}
          onPress={showDuplicateGate ? () => setDuplicateAcknowledged(true) : save}
        />
      }
    >
      <View style={{ gap: theme.spacing.xl, paddingTop: theme.spacing.md }}>
        <View style={[styles.book, { gap: theme.spacing.lg }]}>
          <BookCover uri={candidate.cover_url} title={candidate.title} width={92} radius={theme.radius.md} />

          <View style={styles.bookText}>
            <Text variant="title">{candidate.title}</Text>
            {candidate.authors.length > 0 ? (
              <Text variant="body" color="textMuted">
                {formatAuthors(candidate.authors)}
              </Text>
            ) : null}
            {candidate.publisher || candidate.publication_year ? (
              <Text variant="caption" color="textSubtle">
                {[candidate.publisher, candidate.publication_year].filter(Boolean).join(' · ')}
              </Text>
            ) : null}

            {/* External metadata (Google Books/OpenLibrary) is often wrong
                for regional or translated editions. Editing here always adds
                (or keeps) this as the user's own entry rather than rewriting
                someone else's shared catalog row, which RLS wouldn't allow
                anyway (0003_rls.sql: books can only be updated by their
                creator). */}
            <Pressable onPress={() => setEditOpen(true)} hitSlop={8} style={{ marginTop: 4 }}>
              <Text variant="label" color="primary">
                {t('add.editDetails')}
              </Text>
            </Pressable>
          </View>
        </View>

        {duplicate ? (
          <Card style={{ backgroundColor: theme.colors.warningSoft, borderColor: 'transparent' }}>
            <Text variant="bodyStrong">{t('add.duplicate')}</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>
              {t('add.duplicateBody', { title: duplicate.title })}
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color="textMuted">
            {t('book.readingStatusLabel')}
          </Text>
          <View style={styles.chips}>
            {READING_STATUSES.map((option) => (
              <Chip
                key={option}
                label={t(`status.${option}`)}
                selected={status === option}
                onPress={() => setStatus(option)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color="textMuted">
            {t('condition.label')}
          </Text>
          <View style={styles.chips}>
            {BOOK_CONDITIONS.map((option) => (
              <Chip
                key={option}
                label={t(`condition.${option}`)}
                selected={condition === option}
                onPress={() => setCondition(condition === option ? null : option)}
              />
            ))}
          </View>
        </View>

        <CategoryPicker label={t('book.categories')} selected={categoryIds} onChange={setCategoryIds} />

        {positions.length > 0 ? (
          <Select
            label={t('book.location')}
            placeholder={t('book.noLocation')}
            value={positionId}
            options={positions}
            onChange={setPositionId}
            clearable
            clearLabel={t('book.noLocation')}
            onAddNew={() => setAddShelfOpen(true)}
            addNewLabel={t('shelves.addShelf')}
          />
        ) : (
          <Card>
            <Text variant="bodyStrong">{t('shelves.empty')}</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: 4, marginBottom: 12 }}>
              {t('shelves.emptyBody')}
            </Text>
            <Button
              title={t('shelves.addShelf')}
              variant="secondary"
              size="sm"
              onPress={() => setAddShelfOpen(true)}
            />
          </Card>
        )}

        <AddShelfSheet
          visible={addShelfOpen}
          onClose={() => setAddShelfOpen(false)}
          onCreated={(newPositionId) => setPositionId(newPositionId)}
        />

        {household ? (
          <Toggle label={t('household.share')} hint={household.household.name} value={shareBook} onChange={setShareBook} />
        ) : null}

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
      </View>

      <CandidateEditSheet
        key={candidate.key}
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        candidate={candidate}
        onSave={(patch) => setPendingBook({ ...candidate, ...patch })}
      />
    </Screen>
  );
}

function CandidateEditSheet({
  visible,
  onClose,
  candidate,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  candidate: BookCandidate;
  onSave: (patch: Partial<BookCandidate>) => void;
}) {
  const theme = useTheme();
  const { isWide } = useLayout();
  const { t } = useI18n();
  const { user } = useAuth();

  const [title, setTitle] = useState(candidate.title);
  const [authors, setAuthors] = useState(candidate.authors.join(', '));
  const [isbn, setIsbn] = useState(candidate.isbn13 ?? candidate.isbn10 ?? '');
  const [publisher, setPublisher] = useState(candidate.publisher ?? '');
  const [year, setYear] = useState(candidate.publication_year?.toString() ?? '');
  const [language, setLanguage] = useState<string | null>(candidate.language);
  const [pages, setPages] = useState(candidate.page_count?.toString() ?? '');
  const [coverUrl, setCoverUrl] = useState(candidate.cover_url);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  async function pickCover() {
    if (!user || coverUploading) return;
    setCoverUploading(true);
    setCoverError(null);
    try {
      const url = await pickAndUploadBookCover(user.id);
      if (url) setCoverUrl(url);
    } catch (cause) {
      setCoverError(describeError(cause, t));
    } finally {
      setCoverUploading(false);
    }
  }

  async function dropCover(file: File) {
    if (!user || coverUploading) return;
    setCoverUploading(true);
    setCoverError(null);
    try {
      const url = await uploadDroppedBookCover(user.id, file);
      if (url) setCoverUrl(url);
      else setCoverError(t('manual.coverNotImage'));
    } catch (cause) {
      setCoverError(describeError(cause, t));
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
      authors: parseAuthors(authors),
      isbn13: normalizedIsbn.length === 13 ? normalizedIsbn : null,
      isbn10: normalizedIsbn.length === 10 ? normalizedIsbn : null,
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
    <Sheet visible={visible} onClose={onClose} title={t('add.editDetails')} scrollRef={scrollRef}>
      <View style={{ gap: theme.spacing.lg }}>
        {/* The drop target is this outer View, not the Pressable inside it —
            react-native-web's Pressable wires its own pointer/hover handling
            onto the same node, and that combination doesn't reliably deliver
            native HTML5 drag events. A plain View ref does. */}
        <View
          ref={coverDropRef}
          style={[
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
        <Pressable
          onPress={pickCover}
          disabled={coverUploading}
          accessibilityRole="button"
          accessibilityLabel={t('manual.cover')}
          style={({ pressed }) => [styles.editCoverRow, { opacity: pressed || coverUploading ? 0.7 : 1 }]}
        >
          <BookCover uri={coverUrl} title={title || candidate.title} width={80} radius={theme.radius.sm} />
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
                  : Platform.OS === 'web' && isWide
                    ? t('manual.addCoverWeb')
                    : t('manual.addCover')}
            </Text>
          </View>
        </Pressable>
        </View>

        {coverError ? (
          <Text variant="caption" color="danger">
            {coverError}
          </Text>
        ) : null}

        <TextField
          label={t('manual.bookTitle')}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            if (titleError) setTitleError(null);
          }}
          error={titleError}
          onFocus={(e) => scrollFieldAboveKeyboard(scrollRef, e)}
        />

        <AuthorsField
          label={t('manual.authors')}
          hint={t('manual.authorsHint')}
          value={authors}
          onChangeText={setAuthors}
          onFocus={(e) => scrollFieldAboveKeyboard(scrollRef, e)}
        />

        <TextField
          label={t('manual.isbn')}
          value={isbn}
          onChangeText={setIsbn}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={(e) => scrollFieldAboveKeyboard(scrollRef, e)}
        />

        <TextField
          label={t('manual.publisher')}
          value={publisher}
          onChangeText={setPublisher}
          onFocus={(e) => scrollFieldAboveKeyboard(scrollRef, e)}
        />

        <View style={[styles.pair, { gap: theme.spacing.md }]}>
          <TextField
            label={t('manual.year')}
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={4}
            containerStyle={styles.pairItem}
            onFocus={(e) => scrollFieldAboveKeyboard(scrollRef, e)}
          />
          <TextField
            label={t('manual.pages')}
            value={pages}
            onChangeText={setPages}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={5}
            containerStyle={styles.pairItem}
            onFocus={(e) => scrollFieldAboveKeyboard(scrollRef, e)}
          />
        </View>

        <Select
          label={t('manual.language')}
          placeholder={t('common.none')}
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={setLanguage}
          clearable
          clearLabel={t('common.none')}
        />

        <Button title={t('common.save')} fullWidth onPress={save} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  book: { flexDirection: 'row', alignItems: 'flex-start' },
  bookText: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editCoverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editCoverAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pair: { flexDirection: 'row' },
  pairItem: { flex: 1 },
});
