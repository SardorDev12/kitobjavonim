import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/BookCover';
import { Button, Screen, Select, Text, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { setPendingBook } from '@/features/add/pendingBook';
import { emptyCandidate } from '@/lib/books/metadata';
import { normalizeIsbn } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { pickAndUploadBookCover, uploadDroppedBookCover } from '@/lib/images';
import { scanCoverText } from '@/lib/ocr';
import { useImageDropZone } from '@/lib/useImageDropZone';
import { useLayout, useTheme } from '@/theme';

/**
 * Manual entry.
 *
 * Not a fallback screen — for books published in Uzbekistan, and for many
 * Uzbek- and Russian-language editions, the online catalogues simply have no
 * record, so this is a routine path. It is kept as short as it can be: only the
 * title is required, and everything else can be filled in later from the book's
 * own detail screen.
 */
const LANGUAGE_OPTIONS = [
  { value: 'uz', label: 'Oʻzbekcha' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'kaa', label: 'Qaraqalpaqsha' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'ar', label: 'العربية' },
];

export default function ManualEntryScreen() {
  const theme = useTheme();
  const { isWide } = useLayout();
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ isbn?: string; title?: string }>();
  const { user } = useAuth();

  const [title, setTitle] = useState(params.title ?? '');
  const [authors, setAuthors] = useState('');
  const [isbn, setIsbn] = useState(params.isbn ?? '');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [language, setLanguage] = useState<string | null>(null);
  const [pages, setPages] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  async function pickCover() {
    if (!user || coverUploading) return;

    setCoverUploading(true);
    setCoverError(null);
    setScanMessage(null);
    try {
      const url = await pickAndUploadBookCover(user.id);
      if (url) setCoverUrl(url);
    } catch (cause) {
      setCoverError(cause instanceof Error ? cause.message : t('error.saveFailed'));
    } finally {
      setCoverUploading(false);
    }
  }

  async function dropCover(file: File) {
    if (!user || coverUploading) return;

    setCoverUploading(true);
    setCoverError(null);
    setScanMessage(null);
    try {
      const url = await uploadDroppedBookCover(user.id, file);
      if (url) setCoverUrl(url);
      else setCoverError(t('manual.coverNotImage'));
    } catch (cause) {
      setCoverError(cause instanceof Error ? cause.message : t('error.saveFailed'));
    } finally {
      setCoverUploading(false);
    }
  }

  const { ref: coverDropRef, isDragOver: coverDragOver } = useImageDropZone(
    dropCover,
    !coverUploading,
    'add-manual-cover'
  );

  // Pre-fills only — free OCR on a photographed cover is a good guess, not a
  // fact, so this never overwrites text the user already typed and every
  // field it fills stays exactly as editable as if they had typed it in.
  async function scanCover() {
    if (!coverUrl || scanning) return;

    setScanning(true);
    setScanMessage(null);
    try {
      const result = await scanCoverText(coverUrl);
      const hasResult = !!result?.title || (result?.authors.length ?? 0) > 0;
      const filledTitle = !title.trim() && !!result?.title;
      const filledAuthors = !authors.trim() && (result?.authors.length ?? 0) > 0;

      if (filledTitle) setTitle(result!.title!);
      if (filledAuthors) setAuthors(result!.authors.join(', '));

      // A successful scan whose fields were already typed in isn't the same
      // failure as the model genuinely finding nothing on the cover — saying
      // "no clear text found" in that case is just wrong.
      setScanMessage(
        filledTitle || filledAuthors
          ? t('manual.scanFilled')
          : hasResult
            ? t('manual.scanAlreadyFilled')
            : t('manual.scanEmpty')
      );
    } catch {
      setScanMessage(t('manual.scanFailed'));
    } finally {
      setScanning(false);
    }
  }

  function next() {
    if (!title.trim()) {
      setTitleError(t('manual.titleRequired'));
      return;
    }

    const normalizedIsbn = normalizeIsbn(isbn);
    const parsedYear = Number(year);
    const parsedPages = Number(pages);

    setPendingBook({
      ...emptyCandidate(),
      title: title.trim(),
      authors: authors
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean),
      isbn13: normalizedIsbn.length === 13 ? normalizedIsbn : null,
      isbn10: normalizedIsbn.length === 10 ? normalizedIsbn : null,
      publisher: publisher.trim() || null,
      publication_year:
        Number.isFinite(parsedYear) && parsedYear >= 1400 && parsedYear <= 2200 ? parsedYear : null,
      language,
      page_count: Number.isFinite(parsedPages) && parsedPages > 0 ? parsedPages : null,
      cover_url: coverUrl,
    });

    router.push('/add/configure');
  }

  return (
    <Screen
      scroll
      footer={<Button title={t('common.next')} fullWidth onPress={next} disabled={!title.trim()} />}
    >
      <View style={[styles.container, { gap: theme.spacing.lg, paddingTop: theme.spacing.md }]}>
        <Text variant="display">{t('manual.title')}</Text>

        {/* The drop target is this outer View, not the Pressable inside it —
            react-native-web's Pressable wires its own pointer/hover handling
            onto the same node, and that combination doesn't reliably deliver
            native HTML5 drag events. A plain View ref does. */}
        <View
          ref={coverDropRef}
          style={[
            // A dashed border that's always visible on web (not just while
            // actively dragging) is what makes this read as a drop target in
            // the first place — a hover-only highlight has nothing to hover
            // over until the user already knows dropping is possible here.
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
          style={({ pressed }) => [styles.coverRow, { opacity: pressed || coverUploading ? 0.7 : 1 }]}
        >
          <BookCover uri={coverUrl} title={title || t('manual.bookTitle')} width={80} radius={theme.radius.sm} />
          <View style={styles.coverAction}>
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

        {coverUrl ? (
          <View style={{ gap: 4 }}>
            <Button
              title={scanning ? t('manual.scanning') : t('manual.scanCover')}
              variant="secondary"
              size="sm"
              icon="text-outline"
              loading={scanning}
              onPress={scanCover}
            />
            {scanMessage ? (
              <Text variant="caption" color="textSubtle">
                {scanMessage}
              </Text>
            ) : null}
          </View>
        ) : null}

        <TextField
          label={t('manual.bookTitle')}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            if (titleError) setTitleError(null);
          }}
          error={titleError}
          autoFocus={!params.title}
        />

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
          options={LANGUAGE_OPTIONS}
          onChange={setLanguage}
          clearable
          clearLabel={t('common.none')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  pair: { flexDirection: 'row' },
  pairItem: { flex: 1 },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coverAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
