import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BookCandidate } from '@/lib/books/metadata';
import { useAuth } from '@/features/auth/AuthProvider';
import { storagePathFromPublicUrl } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import type { LibraryEntry, ReadingProgress, ReadingStatus, UserBook } from '@/types/database';

import { queryKeys } from './keys';

export type LibraryFilter = 'all' | 'want_to_read' | 'reading' | 'finished' | 'exchange' | 'sale';
export type LibrarySort = 'recent' | 'title' | 'author' | 'finished';

// PostgREST caps a single response at this many rows (Supabase's own
// db-max-rows project setting) regardless of what's asked for — a plain
// unbounded select doesn't error past it, it silently truncates, which is
// how a 2000-book library first surfaced this: profile_stats (a one-row
// aggregate, unaffected) correctly said 2000, while this query's result
// quietly stopped at 1000 with nothing indicating rows were missing.
const LIBRARY_PAGE_SIZE = 1000;

/**
 * The whole library in one query — paginated server-side into
 * LIBRARY_PAGE_SIZE-row pages and stitched back together here, but still one
 * flat array to every caller.
 *
 * Filtering and sorting happen on the client rather than in SQL, deliberately:
 * a personal library is hundreds of rows, not millions, and holding the full set
 * in cache is what lets the list stay usable offline and switch filters without
 * a round trip. If someone ever catalogues far more than that, this becomes a
 * genuinely server-paginated query instead — the component API still would not
 * change.
 */
export function useLibrary() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.library.list(userId ?? 'anonymous'),
    enabled: Boolean(userId),
    queryFn: async (): Promise<LibraryEntry[]> => {
      const entries: LibraryEntry[] = [];

      for (let from = 0; ; from += LIBRARY_PAGE_SIZE) {
        const { data, error } = await supabase
          .from('library_entries')
          .select('*')
          // A secondary, unique tiebreaker matters once this is paginated,
          // not just ordered: date_added alone can tie (a bulk import
          // writes many rows in the same instant), and without something
          // unique to break ties consistently, two separate page requests
          // aren't guaranteed to agree on which side of the boundary a tied
          // row falls on — silently duplicating or dropping it.
          .order('date_added', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + LIBRARY_PAGE_SIZE - 1);
        if (error) throw error;

        const page = (data ?? []) as LibraryEntry[];
        entries.push(...page);
        if (page.length < LIBRARY_PAGE_SIZE) break;
      }

      return entries;
    },
  });
}

export function useLibraryEntry(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.library.entry(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<LibraryEntry | null> => {
      const { data, error } = await supabase.from('library_entries').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return (data as LibraryEntry) ?? null;
    },
  });
}

/**
 * Existing author spellings in the shared catalogue matching a partial name
 * — lets the add-book form nudge someone toward the spelling already in use
 * instead of every contributor re-typing (and re-spelling) the same author
 * independently. See 0016_search_authors.sql for why this is a search
 * function rather than a normalized authors table.
 */
export function useAuthorSuggestions(query: string) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: queryKeys.search.authors(trimmed),
    enabled: trimmed.length >= 2,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('search_authors', { query: trimmed });
      if (error) throw error;
      return (data ?? []).map((row: { name: string }) => row.name);
    },
  });
}

export type AddBookInput = {
  candidate: BookCandidate;
  shelfNote?: string | null;
  readingStatus?: ReadingStatus;
  condition?: UserBook['condition'];
  /** Set to share this copy with the signed-in user's household (0015_households.sql). */
  householdId?: string | null;
};

/**
 * Every book field lives directly on the new copy's own row (0030_merge_
 * books_into_user_books.sql — there's no shared `books` catalog row to find
 * or create anymore, so this is a single insert instead of the old
 * ensureBook()-then-insert-the-copy sequence).
 */
export function useAddBook() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ candidate, shelfNote, readingStatus, condition, householdId }: AddBookInput) => {
      if (!user) throw new Error('Not signed in');

      const { data, error } = await supabase
        .from('user_books')
        .insert({
          user_id: user.id,
          isbn13: candidate.isbn13,
          isbn10: candidate.isbn10,
          title: candidate.title.trim(),
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
          shelf_note: shelfNote?.trim() || null,
          condition: condition ?? null,
          household_id: householdId ?? null,
        })
        .select('id')
        .single();

      if (error) throw error;

      const userBookId = data.id as string;

      // Reading status/progress live on the creator's own reading_progress
      // row now, not on user_books (0020_reading_progress.sql — per-person,
      // not per-copy). Not wrapped in a transaction with the insert above,
      // so a failure here surfaces as a normal add-book error rather than
      // being silently swallowed — but if an orphaned user_books row ever
      // did end up without one, library_entries' own
      // coalesce(reading_status, 'want_to_read') fallback keeps every read
      // path safe regardless.
      const { error: progressError } = await supabase
        .from('reading_progress')
        .insert({ user_book_id: userBookId, user_id: user.id, reading_status: readingStatus ?? 'want_to_read' });
      if (progressError) throw progressError;

      return { userBookId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
      if (user) queryClient.invalidateQueries({ queryKey: queryKeys.profile.stats(user.id) });
    },
  });
}

export type UpdateUserBookInput = {
  id: string;
  patch: Partial<
    Pick<
      UserBook,
      | 'condition'
      | 'shelf_note'
      | 'availability_type'
      | 'exchange_preferences'
      | 'sale_price'
      | 'price_negotiable'
      | 'sale_description'
      | 'household_id'
      | 'title'
      | 'subtitle'
      | 'authors'
      | 'isbn13'
      | 'publisher'
      | 'publication_year'
      | 'language'
      | 'page_count'
      | 'cover_url'
    >
  >;
  /** The copy's cover_url before this edit — lets a real replacement clean up the file it replaces. */
  previousCoverUrl?: string | null;
};

/**
 * Every editable field on a copy — shelf, listing, condition, household
 * sharing, and (since 0030_merge_books_into_user_books.sql) the book's own
 * title/authors/cover/etc, now that each copy owns its data outright rather
 * than sharing a `books` row a stranger might also depend on.
 */
export function useUpdateUserBook() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, patch, previousCoverUrl }: UpdateUserBookInput) => {
      const { error } = await supabase.from('user_books').update(patch).eq('id', id);
      if (error) throw error;

      // A cover swap orphans the old file otherwise — nothing else in the
      // schema points at it once cover_url has moved on, and it would just
      // sit in the bucket counting against the free tier's 1 GB forever.
      // Best-effort: a failed cleanup here should never undo an otherwise
      // successful save, so it's swallowed rather than thrown.
      if (patch.cover_url !== undefined && previousCoverUrl && previousCoverUrl !== patch.cover_url) {
        const oldPath = storagePathFromPublicUrl('book-photos', previousCoverUrl);
        if (oldPath) {
          try {
            await supabase.storage.from('book-photos').remove([oldPath]);
          } catch {
            // Best-effort — a failed cleanup must not undo the save above.
          }
        }
      }
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.library.entry(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      if (user) {
        queryClient.invalidateQueries({ queryKey: queryKeys.profile.stats(user.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.plan.status(user.id) });
      }
    },
  });
}

export type UpdateReadingProgressInput = {
  userBookId: string;
  patch: Partial<
    Pick<
      ReadingProgress,
      'reading_status' | 'date_started' | 'date_finished' | 'current_page' | 'progress_percent' | 'rating' | 'review' | 'notes'
    >
  >;
};

/**
 * The signed-in user's own reading state on a copy — status, progress,
 * rating/review/notes. Upserts rather than updates: the first time someone
 * (an owner, or a household member on a shared copy) touches their reading
 * state on a given copy, there may be no row yet. See
 * 0020_reading_progress.sql — this is per-person, not per-copy, so it's
 * always keyed to the signed-in user's own id, never an arbitrary one.
 */
export function useUpdateReadingProgress() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ userBookId, patch }: UpdateReadingProgressInput) => {
      if (!user) throw new Error('Not signed in');

      const { error } = await supabase
        .from('reading_progress')
        .upsert({ user_book_id: userBookId, user_id: user.id, ...patch }, { onConflict: 'user_book_id,user_id' });
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.library.entry(variables.userBookId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      if (user) {
        queryClient.invalidateQueries({ queryKey: queryKeys.profile.stats(user.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.plan.status(user.id) });
      }
    },
  });
}

export function useDeleteUserBook() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      // user_book_photos rows cascade-delete with the parent row (0001_init.sql's
      // FK), but a cascade only ever touches the database — the actual files in
      // the book-photos bucket have no FK pointing at them and would otherwise
      // sit there forever. Read their paths (and the copy's own cover, if it's
      // a storage-hosted one rather than an external Google Books/Open Library
      // URL) before the row is gone, then remove them once the delete that
      // matters to the user has actually succeeded. Deleting the copy now
      // deletes the book entirely (0030_merge_books_into_user_books.sql — no
      // shared `books` row survives it), so this is the only chance to clean
      // up its cover.
      const [{ data: photos }, { data: book }] = await Promise.all([
        supabase.from('user_book_photos').select('storage_path').eq('user_book_id', id),
        supabase.from('user_books').select('cover_url').eq('id', id).maybeSingle(),
      ]);

      const { error } = await supabase.from('user_books').delete().eq('id', id);
      if (error) throw error;

      const paths = (photos ?? []).map((p) => p.storage_path);
      const coverPath = book?.cover_url ? storagePathFromPublicUrl('book-photos', book.cover_url) : null;
      if (coverPath) paths.push(coverPath);

      if (paths.length > 0) {
        await supabase.storage.from('book-photos').remove(paths);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      if (user) queryClient.invalidateQueries({ queryKey: queryKeys.profile.stats(user.id) });
    },
  });
}

// PostgREST's .in() filter travels in the request URL as a query-string
// value (`id=in.(uuid1,uuid2,...)`), for DELETE and UPDATE alike, not in a
// request body. "Select all" in library.tsx can hand these mutations a
// whole library's worth of ids — hundreds of UUIDs joined into one filter
// is tens of KB, past what most reverse proxies/CDNs in front of Supabase
// allow in a URL at all, and slow well before that hard failure. Chunking
// is the same fix library/import.tsx's own CHUNK_SIZE already applies to
// its bulk writes, just needed here too once a selection got large enough
// to actually hit it — a handful of manually-tapped rows never did.
const BULK_ACTION_CHUNK_SIZE = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Deletes several copies from Library's multiselect, one chunk of ids at a
 * time (see BULK_ACTION_CHUNK_SIZE). Mirrors useDeleteUserBook()'s own
 * photo-cleanup: cascade only ever removes the database rows, never the
 * actual files in storage.
 */
export function useBulkDeleteUserBooks() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const batch of chunk(ids, BULK_ACTION_CHUNK_SIZE)) {
        // Same reasoning as useDeleteUserBook's own cover cleanup — deleting
        // a copy now deletes the book entirely, so its cover (if it's a
        // storage-hosted one) needs cleaning up alongside its photos.
        const [{ data: photos }, { data: books }] = await Promise.all([
          supabase.from('user_book_photos').select('storage_path').in('user_book_id', batch),
          supabase.from('user_books').select('cover_url').in('id', batch),
        ]);

        const { error } = await supabase.from('user_books').delete().in('id', batch);
        if (error) throw error;

        const paths = (photos ?? []).map((p) => p.storage_path);
        for (const book of books ?? []) {
          const coverPath = book.cover_url ? storagePathFromPublicUrl('book-photos', book.cover_url) : null;
          if (coverPath) paths.push(coverPath);
        }

        if (paths.length > 0) {
          await supabase.storage.from('book-photos').remove(paths);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      if (user) queryClient.invalidateQueries({ queryKey: queryKeys.profile.stats(user.id) });
    },
  });
}

/**
 * Shares several copies with the signed-in user's household at once, from
 * Library's multiselect, one chunk of ids at a time (see
 * BULK_ACTION_CHUNK_SIZE). Only ever called with ids the caller already
 * filtered to their own (see library.tsx) — RLS would reject anyone else's
 * anyway (0015_households.sql: only a copy's own creator may set its
 * household_id at all), this just avoids sending requests known to fail.
 */
export function useBulkShareWithHousehold() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ ids, householdId }: { ids: string[]; householdId: string }) => {
      for (const batch of chunk(ids, BULK_ACTION_CHUNK_SIZE)) {
        const { error } = await supabase.from('user_books').update({ household_id: householdId }).in('id', batch);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      if (user) queryClient.invalidateQueries({ queryKey: queryKeys.profile.stats(user.id) });
    },
  });
}

/**
 * Applies the current filter and sort to a loaded library.
 *
 * Kept as a plain function rather than a hook so the same rules can be reused by
 * the profile screen's "my listings" list.
 */
export function selectLibrary(
  entries: LibraryEntry[],
  { filter, sort, search }: { filter: LibraryFilter; sort: LibrarySort; search: string }
): LibraryEntry[] {
  const term = search.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    switch (filter) {
      case 'want_to_read':
      case 'reading':
      case 'finished':
        if (entry.reading_status !== filter) return false;
        break;
      case 'exchange':
        if (entry.availability_type !== 'exchange' && entry.availability_type !== 'exchange_or_sale')
          return false;
        break;
      case 'sale':
        if (entry.availability_type !== 'sale' && entry.availability_type !== 'exchange_or_sale')
          return false;
        break;
      case 'all':
        break;
    }

    if (!term) return true;

    return (
      entry.title.toLowerCase().includes(term) ||
      entry.authors.some((author) => author.toLowerCase().includes(term)) ||
      (entry.publisher?.toLowerCase().includes(term) ?? false)
    );
  });

  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  return filtered.sort((a, b) => {
    switch (sort) {
      case 'title':
        return collator.compare(a.title, b.title);
      case 'author':
        return collator.compare(a.authors[0] ?? '', b.authors[0] ?? '');
      case 'finished':
        // Unfinished books sink to the bottom rather than sorting as epoch zero.
        if (!a.date_finished && !b.date_finished) return 0;
        if (!a.date_finished) return 1;
        if (!b.date_finished) return -1;
        return b.date_finished.localeCompare(a.date_finished);
      case 'recent':
      default:
        return b.date_added.localeCompare(a.date_added);
    }
  });
}
