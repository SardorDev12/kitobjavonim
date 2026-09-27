import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/BookCover';
import { CategoryPicker } from '@/components/CategoryPicker';
import {
  AuthorsField,
  BackHeader,
  Button,
  Card,
  Chip,
  EmptyState,
  Screen,
  Sheet,
  Text,
  TextField,
  Toggle,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { setPendingBook, usePendingBook } from '@/features/add/pendingBook';
import { goToTab } from '@/features/tabs/activeTab';
import type { BookCandidate } from '@/lib/books/metadata';
import { describeError } from '@/lib/errors';
import { formatAuthors, parseAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { pickAndUploadBookCover, uploadDroppedBookCover } from '@/lib/images';
import { useImageDropZone } from '@/lib/useImageDropZone';
import { useSetBookCategories } from '@/lib/queries/categories';
import { useHousehold } from '@/lib/queries/household';
import { useAddBook, useLibrary } from '@/lib/queries/library';
import { isSameWishlistBook, useAddWishlistItem, useDeleteWishlistItem, useWishlist } from '@/lib/queries/wishlist';
import { useLayout, useTheme } from '@/theme';
import { READING_STATUSES, type ReadingStatus } from '@/types/database';

/**
 * The last step of adding a book: reading status, categories, and where it
 * lives. Condition isn't asked here — it's only ever relevant once a copy
 * is actually listed for exchange/sale (ListingSheet), not on every add.
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
  const { data: library } = useLibrary();
  const { data: household } = useHousehold();
  const { data: wishlist } = useWishlist();
  const addBook = useAddBook();
  const setCategories = useSetBookCategories();
  const deleteWishlistItem = useDeleteWishlistItem();
  const addToWishlist = useAddWishlistItem();

  const [shelfNote, setShelfNote] = useState('');
  const [status, setStatus] = useState<ReadingStatus>('want_to_read');
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
    if (!candidate) {
      router.replace('/(tabs)');
      goToTab('add');
    }
  }, [candidate, router]);

  const duplicate = useMemo(() => {
    if (!candidate?.isbn13 || !library) return null;
    return library.find((entry) => entry.isbn13 === candidate.isbn13) ?? null;
  }, [candidate, library]);

  if (!candidate) {
    return (
      <View style={styles.fill}>
        <BackHeader />
        <Screen>
          <EmptyState title={t('error.notFound')} />
        </Screen>
      </View>
    );
  }

  async function save() {
    if (!candidate) return;
    setError(null);

    try {
      const { userBookId } = await addBook.mutateAsync({
        candidate,
        shelfNote,
        readingStatus: status,
        // Condition is only ever asked at listing time now (ListingSheet) —
        // a book that isn't for exchange/sale has no reason to be rated.
        condition: null,
        householdId: household && shareBook ? household.household.id : null,
      });

      // Categories are secondary to getting the book onto the shelf, so a
      // failure here must not lose the book the user just added.
      if (categoryIds.length > 0) {
        try {
          await setCategories.mutateAsync({ userBookId, categoryIds, previous: [] });
        } catch {
          // Recoverable from the book's own screen.
        }
      }

      // Clears any wishlist entry for this same title+author — the point of
      // adding a book someone had wished for. Runs regardless of how they
      // got here (search, manual entry, or scan) and regardless of whether
      // they acted on the earlier "this is on your wishlist" prompt (see
      // (tabs)/add.tsx and add/manual.tsx) — same tolerance as categories
      // above, a failure here must not undo the book that was just saved.
      const wishlistMatches = (wishlist ?? []).filter((item) => isSameWishlistBook(item, candidate.title, candidate.authors));
      for (const match of wishlistMatches) {
        try {
          await deleteWishlistItem.mutateAsync(match.id);
        } catch {
          // Recoverable from the wishlist screen itself.
        }
      }

      // Switches the tabs layout's own active page to Library before
      // leaving it, so that whenever the user backs out of the book detail
      // page they just landed on, they land on the shelf the book they
      // just added is actually on — not wherever they started the add flow
      // from (search, scan, or manual entry all reach this same save()).
      goToTab('library');

      // Native: goToTab() only flips the already-mounted PagerView's page —
      // it never touches the router/stack, so this screen (configure.tsx)
      // is still the current stack entry and still needs replacing so back
      // doesn't return to it.
      //
      // Web: goToTab() itself just did a router.replace('/(tabs)/library')
      // (its own web fallback, since there's no PagerView there — see
      // activeTab.ts). A second replace() called right after would
      // overwrite that same history entry before it ever became a real,
      // separate "back" target — replace doesn't add a new entry, so two
      // in a row just collapse into one, discarding the first's effect
      // entirely. push() on top of it instead leaves that already-replaced
      // library entry intact one level down, which is exactly what back is
      // supposed to land on.
      if (Platform.OS === 'web') router.push(`/book/${userBookId}`);
      else router.replace(`/book/${userBookId}`);
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  async function addToWishlistInstead() {
    if (!candidate) return;
    setError(null);
    try {
      await addToWishlist.mutateAsync({ title: candidate.title, authors: candidate.authors });
      router.back();
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  const showDuplicateGate = duplicate !== null && !duplicateAcknowledged;

  return (
    <View style={styles.fill}>
      <BackHeader />
      <Screen
        scroll
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <Button
              title={showDuplicateGate ? t('add.addAnyway') : t('add.addToLibrary')}
              fullWidth
              loading={addBook.isPending}
              onPress={showDuplicateGate ? () => setDuplicateAcknowledged(true) : save}
            />
            <Button
              title={t('wishlist.addToWishlist')}
              variant="ghost"
              fullWidth
              loading={addToWishlist.isPending}
              onPress={addToWishlistInstead}
            />
          </View>
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

        <CategoryPicker label={t('book.categories')} selected={categoryIds} onChange={setCategoryIds} />

        <TextField
          label={t('book.location')}
          placeholder={t('book.locationPlaceholder')}
          value={shelfNote}
          onChangeText={setShelfNote}
          maxLength={200}
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
    </View>
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
  const [pages, setPages] = useState(candidate.page_count?.toString() ?? '');
  const [coverUrl, setCoverUrl] = useState(candidate.cover_url);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  async function pickCover() {
    if (!user || coverUploading) return;
    setCoverUploading(true);
    setCoverError(null);
    try {
      const url = await pickAndUploadBookCover(user.id, t);
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

    const parsedPages = Number(pages);

    // isbn13/isbn10/publisher/publication_year/language are deliberately left
    // out — whatever the search result carried for those stays as-is, since
    // there's no field here to change them anymore.
    onSave({
      title: title.trim(),
      authors: parseAuthors(authors),
      page_count: Number.isFinite(parsedPages) && parsedPages > 0 ? parsedPages : null,
      cover_url: coverUrl,
    });

    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('add.editDetails')}>
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
        />

        <AuthorsField
          label={t('manual.authors')}
          hint={t('manual.authorsHint')}
          value={authors}
          onChangeText={setAuthors}
        />

        <TextField
          label={t('manual.pages')}
          value={pages}
          onChangeText={setPages}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={5}
        />

        <Button title={t('common.save')} fullWidth onPress={save} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  book: { flexDirection: 'row', alignItems: 'flex-start' },
  bookText: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editCoverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editCoverAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
