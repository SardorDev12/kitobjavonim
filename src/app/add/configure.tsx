import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/BookCover';
import { CategoryPicker } from '@/components/CategoryPicker';
import { Button, Card, Chip, EmptyState, Screen, Select, Text } from '@/components/ui';
import { usePendingBook } from '@/features/add/pendingBook';
import { formatAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { usePositionOptions } from '@/lib/queries/bookshelves';
import { useSetBookCategories } from '@/lib/queries/categories';
import { useAddBook, useLibrary } from '@/lib/queries/library';
import { useTheme } from '@/theme';
import { BOOK_CONDITIONS, READING_STATUSES, type BookCondition, type ReadingStatus } from '@/types/database';

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
  const addBook = useAddBook();
  const setCategories = useSetBookCategories();

  const [positionId, setPositionId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReadingStatus>('want_to_read');
  const [condition, setCondition] = useState<BookCondition | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

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
      setError(cause instanceof Error ? cause.message : t('error.saveFailed'));
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
              onPress={() => router.push('/bookshelves')}
            />
          </Card>
        )}

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  book: { flexDirection: 'row', alignItems: 'flex-start' },
  bookText: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
