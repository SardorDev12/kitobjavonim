import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import * as XLSX from 'xlsx';

import { Button, Card, Divider, LoadingState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { emptyCandidate, type BookCandidate } from '@/lib/books/metadata';
import { describeError } from '@/lib/errors';
import { parseAuthors } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/queries/keys';
import { supabase } from '@/lib/supabase';
import type { ReadingStatus } from '@/types/database';
import { useTheme } from '@/theme';

type SheetRow = Record<string, unknown>;
type FieldKey =
  | 'title'
  | 'status'
  | 'author'
  | 'publisher'
  | 'startDate'
  | 'endDate'
  | 'rating'
  | 'review'
  | 'pages'
  | 'collection';

/**
 * Case-insensitive header names this screen recognizes, gathered from the
 * export formats of a couple of reading-tracker apps (ReadMore among them —
 * see the "Reading Status"/"Total Pages"/"Collection" names below). Title is
 * the only one that's required; everything else is best-effort.
 */
const COLUMN_ALIASES: Record<FieldKey, string[]> = {
  title: ['title', 'book title', 'name'],
  status: ['reading status', 'status'],
  author: ['author', 'authors', 'author(s)'],
  publisher: ['publisher'],
  startDate: ['start date', 'date started'],
  endDate: ['end date', 'date finished', 'finish date'],
  rating: ['rating'],
  review: ['review', 'notes'],
  pages: ['total pages', 'pages', 'page count'],
  collection: ['collection', 'category', 'genre', 'genres'],
};

/**
 * Matched by alias priority, not header order: a source file can carry more
 * than one plausible column for the same field (this app's own sample export
 * has both an empty "Genres" and a populated "Collection"), and the first
 * alias in the list is the one actually meant to win in that case.
 */
function detectColumns(headers: string[]): Partial<Record<FieldKey, string>> {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const detected: Partial<Record<FieldKey, string>> = {};
  for (const field of Object.keys(COLUMN_ALIASES) as FieldKey[]) {
    for (const alias of COLUMN_ALIASES[field]) {
      const idx = lower.indexOf(alias);
      if (idx !== -1) {
        detected[field] = headers[idx];
        break;
      }
    }
  }
  return detected;
}

function cell(row: SheetRow, columns: Partial<Record<FieldKey, string>>, field: FieldKey): unknown {
  const column = columns[field];
  return column ? row[column] : undefined;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Handles a real Date (from XLSX.read's cellDates:true) or a plain date-like string. */
function toISODate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = toText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toRating(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(toText(value));
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 5 ? rounded : null;
}

function toPageCount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(toText(value));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function inferStatus(rawStatus: unknown, startDate: string | null, endDate: string | null): ReadingStatus {
  const normalized = toText(rawStatus).toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'finished' || normalized === 'reading' || normalized === 'want_to_read') return normalized;
  if (endDate) return 'finished';
  if (startDate) return 'reading';
  return 'want_to_read';
}

type ParsedFile = { headers: string[]; rows: SheetRow[]; columns: Partial<Record<FieldKey, string>> };

async function parseWorkbook(data: ArrayBuffer | string, type: 'array' | 'base64'): Promise<ParsedFile> {
  const workbook = XLSX.read(data, { type, cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: '' });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows, columns: detectColumns(headers) };
}

/** A stalled request (dropped connection, no response) must not hang the whole import forever. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      }
    );
  });
}

type ExistingEntry = { userBookId: string; bookId: string };

/**
 * Creates or reuses a book/copy, then writes progress/pages/categories for
 * one row — talking to Supabase directly rather than through the app's
 * shared add-book/reading-progress mutation hooks. Each of those invalidates
 * the library list on every call, and since the PagerView tabs layout keeps
 * the Library/Reading screens mounted in the background, that invalidation
 * is a real refetch, not a no-op. Run through those hooks, 182 rows meant
 * hundreds of extra background list refetches compounding as the library
 * grew — the import got steadily slower and eventually stalled. This does
 * one invalidation for the whole import instead, after the loop.
 */
async function importRow(
  row: SheetRow,
  title: string,
  columns: Partial<Record<FieldKey, string>>,
  userId: string,
  existingByKey: Map<string, ExistingEntry>,
  categoryIdByName: Map<string, string>
): Promise<void> {
  const authors = parseAuthors(toText(cell(row, columns, 'author')));
  const startDate = toISODate(cell(row, columns, 'startDate'));
  const endDate = toISODate(cell(row, columns, 'endDate'));
  const status = inferStatus(cell(row, columns, 'status'), startDate, endDate);
  const pages = toPageCount(cell(row, columns, 'pages'));

  const key = `${title.toLowerCase()}|${authors.join(',').toLowerCase()}`;
  const existing = existingByKey.get(key);

  let userBookId: string;
  let bookId: string;

  if (existing) {
    userBookId = existing.userBookId;
    bookId = existing.bookId;
  } else {
    const candidate: BookCandidate = {
      ...emptyCandidate(),
      title,
      authors,
      publisher: toText(cell(row, columns, 'publisher')) || null,
      page_count: pages,
    };

    // Mirrors ensureBook (src/lib/queries/library.ts) — no ISBN dedupe check
    // here since an imported row never carries one.
    const { data: book, error: bookError } = await supabase
      .from('books')
      .insert({
        isbn13: candidate.isbn13,
        isbn10: candidate.isbn10,
        title: candidate.title,
        subtitle: candidate.subtitle,
        authors: candidate.authors,
        publisher: candidate.publisher,
        publication_year: candidate.publication_year,
        language: candidate.language,
        cover_url: candidate.cover_url,
        page_count: candidate.page_count,
        description: candidate.description,
        source: candidate.source,
        source_id: candidate.source_id,
        created_by: userId,
      })
      .select('id')
      .single();
    if (bookError) throw bookError;
    bookId = book.id as string;

    const { data: userBook, error: userBookError } = await supabase
      .from('user_books')
      .insert({ user_id: userId, book_id: bookId })
      .select('id')
      .single();
    if (userBookError) throw userBookError;
    userBookId = userBook.id as string;

    existingByKey.set(key, { userBookId, bookId });
  }

  // rating/review/date_finished are only valid once the book is actually
  // finished (review_requires_finished, 0020_reading_progress.sql). Upsert
  // covers both a brand-new copy (no row yet) and a reused one (already has
  // one) uniformly.
  const isFinished = status === 'finished';
  const { error: progressError } = await supabase.from('reading_progress').upsert(
    {
      user_book_id: userBookId,
      user_id: userId,
      reading_status: status,
      date_started: startDate,
      date_finished: isFinished ? endDate : null,
      rating: isFinished ? toRating(cell(row, columns, 'rating')) : null,
      review: isFinished ? toText(cell(row, columns, 'review')) || null : null,
    },
    { onConflict: 'user_book_id,user_id' }
  );
  if (progressError) throw progressError;

  if (pages && !existing) {
    const { error: pagesError } = await supabase
      .from('user_books')
      .update({ total_pages: pages })
      .eq('id', userBookId);
    if (pagesError) throw pagesError;
  }

  const collectionText = toText(cell(row, columns, 'collection'));
  if (collectionText) {
    const names = collectionText
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const categoryIds: string[] = [];
    for (const name of names) {
      const cacheKey = name.toLowerCase();
      let id = categoryIdByName.get(cacheKey);
      if (!id) {
        const { data, error: categoryError } = await supabase.rpc('find_or_create_category', { p_name: name });
        if (categoryError) throw categoryError;
        id = data as string;
        categoryIdByName.set(cacheKey, id);
      }
      categoryIds.push(id);
    }
    if (categoryIds.length > 0) {
      const { error: attachError } = await supabase
        .from('book_categories')
        .insert(categoryIds.map((category_id) => ({ book_id: bookId, category_id })));
      // Another owner of the same book (or an earlier row in this same
      // import) may already have attached it — that is the desired end
      // state anyway, same reasoning as useSetBookCategories's "added" branch.
      if (attachError && attachError.code !== '23505') throw attachError;
    }
  }
}

type ImportOutcome = { imported: number; skipped: { row: number; reason: string }[] };

export default function LibraryImportScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();

  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  async function pickFile() {
    setError(null);
    setOutcome(null);
    setParsed(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'application/csv',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];

      setParsing(true);

      // On web, expo-file-system has no implementation at all — the picker
      // itself hands back base64 there instead (its default on web).
      const file =
        Platform.OS === 'web'
          ? await (async () => {
              if (!asset.base64) throw new Error('missing base64 data from the web file picker');
              return parseWorkbook(asset.base64, 'base64');
            })()
          : await parseWorkbook(await new File(asset.uri).arrayBuffer(), 'array');

      if (!file.columns.title) {
        setError(t('import.missingTitleColumn'));
        return;
      }
      setParsed(file);
    } catch (cause) {
      setError(describeError(cause, t));
    } finally {
      setParsing(false);
    }
  }

  async function confirmImport() {
    if (!parsed || !user) return;
    setError(null);
    setProgress({ done: 0, total: parsed.rows.length });

    // One upfront read of the user's own library, rather than a query per
    // row — re-running this import (or overlapping it with books already
    // catalogued by hand) shouldn't create duplicate copies.
    const { data: existingRows, error: existingError } = await supabase
      .from('library_entries')
      .select('id, book_id, title, authors')
      .eq('user_id', user.id);
    if (existingError) {
      setError(describeError(existingError, t));
      setProgress(null);
      return;
    }

    const existingByKey = new Map<string, { userBookId: string; bookId: string }>();
    for (const row of existingRows as { id: string; book_id: string; title: string; authors: string[] }[]) {
      const key = `${row.title.trim().toLowerCase()}|${row.authors.join(',').toLowerCase()}`;
      existingByKey.set(key, { userBookId: row.id, bookId: row.book_id });
    }

    const categoryIdByName = new Map<string, string>();
    const skipped: { row: number; reason: string }[] = [];
    let imported = 0;

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      setProgress({ done: i, total: parsed.rows.length });

      const title = toText(cell(row, parsed.columns, 'title'));
      if (!title) {
        skipped.push({ row: i + 2, reason: t('import.rowMissingTitle') });
        continue;
      }

      try {
        // A dropped connection or an unresponsive request must not hang the
        // rest of the import — skip the row and move on instead.
        await withTimeout(importRow(row, title, parsed.columns, user.id, existingByKey, categoryIdByName), 20000);
        imported += 1;
      } catch (cause) {
        skipped.push({ row: i + 2, reason: describeError(cause, t) });
      }
    }

    setProgress(null);
    setOutcome({ imported, skipped });
    setParsed(null);

    // The one invalidation for everything the loop touched — see importRow's
    // own comment for why this isn't done per row.
    queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.reference.categories });
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.stats(user.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.plan.status(user.id) });
  }

  if (parsing) {
    return (
      <Screen>
        <LoadingState label={t('common.loading')} />
      </Screen>
    );
  }

  if (progress) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
          <LoadingState label={t('import.importing', { done: progress.done, total: progress.total })} />
        </View>
      </Screen>
    );
  }

  if (outcome) {
    return (
      <Screen scroll>
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
          <Text variant="display">{t('import.title')}</Text>
          <Text variant="body" color="textMuted">
            {t('import.summary', { imported: outcome.imported, skipped: outcome.skipped.length })}
          </Text>

          {outcome.skipped.length > 0 ? (
            <Card padded={false}>
              {outcome.skipped.map((item, index) => (
                <View key={`${item.row}-${index}`}>
                  {index > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                  <View style={{ padding: theme.spacing.lg }}>
                    <Text variant="body">{t('import.rowLabel', { row: item.row })}</Text>
                    <Text variant="caption" color="textMuted">
                      {item.reason}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          <Button title={t('common.done')} fullWidth onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (parsed) {
    const detectedFields = (Object.keys(parsed.columns) as FieldKey[]).filter((field) => parsed.columns[field]);
    const preview = parsed.rows.slice(0, 5);

    return (
      <Screen scroll>
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
          <Text variant="display">{t('import.previewTitle')}</Text>
          <Text variant="body" color="textMuted">
            {t('import.rowCount', { count: parsed.rows.length })}
          </Text>

          <Card>
            <Text variant="label" color="textMuted">
              {t('import.detectedColumns')}
            </Text>
            <Text variant="body" style={{ marginTop: theme.spacing.xs }}>
              {detectedFields.map((field) => `${t(`import.field.${field}`)} → "${parsed.columns[field]}"`).join('\n')}
            </Text>
          </Card>

          <Card padded={false}>
            {preview.map((row, index) => (
              <View key={index}>
                {index > 0 ? <Divider inset={theme.spacing.lg} /> : null}
                <View style={{ padding: theme.spacing.lg }}>
                  <Text variant="body">{toText(cell(row, parsed.columns, 'title')) || t('import.untitled')}</Text>
                  <Text variant="caption" color="textMuted">
                    {toText(cell(row, parsed.columns, 'author'))}
                  </Text>
                </View>
              </View>
            ))}
          </Card>

          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}

          <View style={{ gap: theme.spacing.sm }}>
            <Button title={t('import.confirm')} fullWidth onPress={confirmImport} />
            <Button title={t('common.cancel')} variant="secondary" fullWidth onPress={() => setParsed(null)} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg, padding: theme.spacing.xl }}>
        <Text variant="display" align="center">
          {t('import.title')}
        </Text>
        <Text variant="body" color="textMuted" align="center">
          {t('import.explainer')}
        </Text>
        {error ? (
          <Text variant="caption" color="danger" align="center">
            {error}
          </Text>
        ) : null}
        <Button title={t('import.chooseFile')} onPress={pickFile} />
      </View>
    </Screen>
  );
}
