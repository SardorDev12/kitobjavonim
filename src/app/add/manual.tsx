import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Select, Text, TextField } from '@/components/ui';
import { setPendingBook } from '@/features/add/pendingBook';
import { emptyCandidate } from '@/lib/books/metadata';
import { normalizeIsbn } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

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
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ isbn?: string; title?: string }>();

  const [title, setTitle] = useState(params.title ?? '');
  const [authors, setAuthors] = useState('');
  const [isbn, setIsbn] = useState(params.isbn ?? '');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [language, setLanguage] = useState<string | null>(null);
  const [pages, setPages] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);

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
});
