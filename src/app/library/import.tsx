import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import * as XLSX from 'xlsx';

import { BackHeader, Button, Card, Divider, LoadingState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
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
  title: ['title', 'book title', 'name', 'kitob'],
  status: ['reading status', 'status'],
  author: ['author', 'authors', 'author(s)', 'muallif'],
  publisher: ['publisher'],
  startDate: ['start date', 'date started'],
  endDate: ['end date', 'date finished', 'finish date'],
  rating: ['rating'],
  review: ['review', 'notes', 'izoh'],
  pages: ['total pages', 'pages', 'page count'],
  collection: ['collection', 'category', 'genre', 'genres', 'janr'],
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

/** Display-only capitalization for the format guide shown above the file
 * picker — matching itself stays lowercase/case-insensitive via COLUMN_ALIASES. */
function titleCaseAlias(alias: string): string {
  return alias.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
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

// Rows are sent to the server CHUNK_SIZE at a time (see confirmImport),
// each chunk becoming one call to import_library_rows()
// (supabase/migrations/0023_bulk_import.sql) instead of one call per row.
// A large import (or many people importing at once — the scenario that
// actually motivated this) used to mean thousands of individual REST round
// trips, each competing for the same small pool of Postgres connections
// Supabase's API layer holds; a chunk is one connection, one round trip,
// for however many rows it carries.
const CHUNK_SIZE = 150;

type NormalizedRow = {
  title: string;
  authors: string[];
  publisher: string | null;
  pages: number | null;
  status: ReadingStatus;
  startDate: string | null;
  endDate: string | null;
  rating: number | null;
  review: string | null;
  collections: string[];
};

type ImportRpcResult = { idx: number; error: string | null; categoryWarning: string | null };

/**
 * Pure — no I/O. All the actual writes (creating/reusing the book and copy,
 * dedupe against the rest of this user's library, reading_progress,
 * categories) happen server-side inside import_library_rows(), which
 * mirrors the field-by-field rules this used to apply on the client one row
 * at a time (rating/review only kept once finished, status inference, etc).
 */
function normalizeRow(row: SheetRow, columns: Partial<Record<FieldKey, string>>): NormalizedRow | null {
  const title = toText(cell(row, columns, 'title'));
  if (!title) return null;

  const startDate = toISODate(cell(row, columns, 'startDate'));
  const endDate = toISODate(cell(row, columns, 'endDate'));
  const status = inferStatus(cell(row, columns, 'status'), startDate, endDate);
  const collectionText = toText(cell(row, columns, 'collection'));

  return {
    title,
    authors: parseAuthors(toText(cell(row, columns, 'author'))),
    publisher: toText(cell(row, columns, 'publisher')) || null,
    pages: toPageCount(cell(row, columns, 'pages')),
    status,
    startDate,
    endDate,
    rating: toRating(cell(row, columns, 'rating')),
    review: toText(cell(row, columns, 'review')) || null,
    collections: collectionText
      ? collectionText
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
      : [],
  };
}

type RowNote = { row: number; reason: string };
type ImportOutcome = {
  imported: number;
  skipped: RowNote[];
  categoryWarnings: RowNote[];
  cancelledEarly: boolean;
};

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

  // Leaving this screen mid-import used to leave the loop running silently
  // in the background — each background write kept firing on its own
  // schedule, and if a second run got started before the first one settled,
  // Library would visibly refetch again each time an old run finally
  // finished. mountedRef guards every setState below the loop from firing
  // after the screen is gone; stopRequestedRef (set by either unmounting or
  // the Cancel button) is checked once per row so a leftover run actually
  // stops within a row instead of grinding through the rest unattended.
  const mountedRef = useRef(true);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopRequestedRef.current = true;
    };
  }, []);

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

  function cancelImport() {
    stopRequestedRef.current = true;
  }

  async function confirmImport() {
    if (!parsed || !user) return;
    stopRequestedRef.current = false;
    setError(null);
    setProgress({ done: 0, total: parsed.rows.length });

    const skipped: RowNote[] = [];
    const categoryWarnings: RowNote[] = [];
    let imported = 0;
    let cancelledEarly = false;

    // sourceRow mirrors the +2 the old per-row loop used (header row +
    // 1-indexing), so a message still points at the actual spreadsheet row
    // even though rows are now batched. Title-less rows are filtered out
    // here rather than sent to the server at all.
    const entries: { sourceRow: number; payload: NormalizedRow }[] = [];
    parsed.rows.forEach((row, i) => {
      const normalized = normalizeRow(row, parsed.columns);
      if (!normalized) {
        skipped.push({ row: i + 2, reason: t('import.rowMissingTitle') });
        return;
      }
      entries.push({ sourceRow: i + 2, payload: normalized });
    });

    // Sent CHUNK_SIZE rows at a time — see CHUNK_SIZE's own comment and
    // 0023_bulk_import.sql for why this replaced one Supabase call per row.
    for (let start = 0; start < entries.length; start += CHUNK_SIZE) {
      if (stopRequestedRef.current) {
        cancelledEarly = true;
        break;
      }

      const chunk = entries.slice(start, start + CHUNK_SIZE);
      if (mountedRef.current) setProgress({ done: start, total: parsed.rows.length });

      try {
        // A dropped connection or an unresponsive request must not hang the
        // rest of the import — skip this whole chunk and move to the next
        // one instead. Timeout scales with chunk size since one call now
        // covers many rows' writes.
        const { data, error: rpcError } = await withTimeout(
          Promise.resolve(
            supabase.rpc('import_library_rows', { p_rows: chunk.map((entry) => entry.payload) })
          ),
          Math.max(30000, chunk.length * 300)
        );
        if (rpcError) throw rpcError;

        for (const result of (data ?? []) as ImportRpcResult[]) {
          const entry = chunk[result.idx - 1];
          if (!entry) continue;
          if (result.error) {
            skipped.push({ row: entry.sourceRow, reason: result.error });
          } else {
            imported += 1;
            if (result.categoryWarning) {
              categoryWarnings.push({ row: entry.sourceRow, reason: result.categoryWarning });
            }
          }
        }
      } catch (cause) {
        const reason = describeError(cause, t);
        for (const entry of chunk) {
          skipped.push({ row: entry.sourceRow, reason });
        }
      }
    }

    // The one invalidation for everything the loop touched, same reasoning
    // as before batching: the PagerView tabs layout keeps Library/Reading
    // mounted in the background, so invalidating per chunk (let alone per
    // row) would mean real, repeated background refetches. Runs regardless
    // of whether the screen is still around to show the result, so whatever
    // was imported before a cancel/unmount shows up without a manual
    // pull-to-refresh.
    queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.reference.categories });
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.stats(user.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.plan.status(user.id) });

    if (mountedRef.current) {
      setProgress(null);
      setOutcome({ imported, skipped, categoryWarnings, cancelledEarly });
      setParsed(null);
    }
  }

  if (parsing) {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader />
        <Screen>
          <LoadingState label={t('common.loading')} />
        </Screen>
      </View>
    );
  }

  if (progress) {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader />
        <Screen>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
            <LoadingState label={t('import.importing', { done: progress.done, total: progress.total })} />
            <Button
              title={t('import.cancel')}
              variant="secondary"
              onPress={cancelImport}
              style={{ alignSelf: 'center' }}
            />
          </View>
        </Screen>
      </View>
    );
  }

  if (outcome) {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader />
        <Screen scroll>
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
          <Text variant="display">{t('import.title')}</Text>
          <Text variant="body" color="textMuted">
            {t('import.summary', { imported: outcome.imported, skipped: outcome.skipped.length })}
          </Text>
          {outcome.cancelledEarly ? (
            <Text variant="caption" color="textSubtle">
              {t('import.cancelledNote')}
            </Text>
          ) : null}

          {outcome.categoryWarnings.length > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="label" color="textMuted">
                {t('import.categoryWarningsHeader', { count: outcome.categoryWarnings.length })}
              </Text>
              <Card padded={false}>
                {outcome.categoryWarnings.map((item, index) => (
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
            </View>
          ) : null}

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
      </View>
    );
  }

  if (parsed) {
    const detectedFields = (Object.keys(parsed.columns) as FieldKey[]).filter((field) => parsed.columns[field]);
    const preview = parsed.rows.slice(0, 5);

    return (
      <View style={{ flex: 1 }}>
        <BackHeader />
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
      </View>
    );
  }

  const guideLines = (Object.keys(COLUMN_ALIASES) as FieldKey[]).map((field) => {
    const label = t(`import.field.${field}`);
    const suffix = field === 'title' ? ` (${t('import.guideRequired')})` : '';
    const aliases = COLUMN_ALIASES[field].map(titleCaseAlias).join(', ');
    return `${label}${suffix}: ${aliases}`;
  });

  return (
    <View style={{ flex: 1 }}>
      <BackHeader />
      <Screen scroll>
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.xl }}>
          <Text variant="display" align="center">
            {t('import.title')}
          </Text>
          <Text variant="body" color="textMuted" align="center">
            {t('import.explainer')}
          </Text>

          <Card>
            <Text variant="label" color="textMuted">
              {t('import.guideTitle')}
            </Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
              {t('import.guideIntro')}
            </Text>
            <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
              {guideLines.join('\n')}
            </Text>
          </Card>

          {error ? (
            <Text variant="caption" color="danger" align="center">
              {error}
            </Text>
          ) : null}
          <Button title={t('import.chooseFile')} onPress={pickFile} style={{ alignSelf: 'center' }} />
        </View>
      </Screen>
    </View>
  );
}
