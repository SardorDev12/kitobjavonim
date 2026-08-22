import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BookCandidate } from '@/lib/books/metadata';
import { useAuth } from '@/features/auth/AuthProvider';
import { storagePathFromPublicUrl } from '@/lib/images';
import { supabase } from '@/lib/supabase';
import type { Book, LibraryEntry, ReadingProgress, ReadingStatus, UserBook } from '@/types/database';

import { queryKeys } from './keys';

export type LibraryFilter = 'all' | 'want_to_read' | 'reading' | 'finished' | 'exchange' | 'sale';
export type LibrarySort = 'recent' | 'title' | 'author' | 'finished' | 'shelf';

/**
 * The whole library in one query.
 *
 * Filtering and sorting happen on the client rather than in SQL, deliberately:
 * a personal library is hundreds of rows, not millions, and holding the full set
 * in cache is what lets the list stay usable offline and switch filters without
 * a round trip. If someone ever catalogues 10,000 books this becomes a paginated
 * server query — the component API would not change.
 */
export function useLibrary() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.library.list(userId ?? 'anonymous'),
    enabled: Boolean(userId),
    queryFn: async (): Promise<LibraryEntry[]> => {
      const { data, error } = await supabase
        .from('library_entries')
        .select('*')
        .order('date_added', { ascending: false });
      if (error) throw error;
      return data as LibraryEntry[];
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

/**
 * Finds the canonical book row for a candidate, creating it if this is the first
 * time anyone has catalogued it.
 *
 * The ISBN is the identity. Two users adding the same book seconds apart will
 * both miss the lookup and both try to insert, so a unique-violation is treated
 * as "someone else won the race" and the existing row is fetched instead.
 */
async function ensureBook(candidate: BookCandidate, userId: string): Promise<string> {
  if (candidate.isbn13) {
    const { data: existing } = await supabase
      .from('books')
      .select('id')
      .eq('isbn13', candidate.isbn13)
      .maybeSingle();
    if (existing) return existing.id as string;
  }

  const payload = {
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
    created_by: userId,
  };

  const { data, error } = await supabase.from('books').insert(payload).select('id').single();

  if (error) {
    // 23505 = unique_violation on isbn13.
    if (error.code === '23505' && candidate.isbn13) {
      const { data: raced } = await supabase
        .from('books')
        .select('id')
        .eq('isbn13', candidate.isbn13)
        .maybeSingle();
      if (raced) return raced.id as string;
    }
    throw error;
  }

  return data.id as string;
}

export type AddBookInput = {
  candidate: BookCandidate;
  /**
   * Set when the user picked a suggested existing catalogue title (see
   * useSimilarBooks) instead of the searched candidate — skips ensureBook
   * entirely so no second `books` row is created for the same title.
   */
  existingBookId?: string;
  bookshelfPositionId?: string | null;
  readingStatus?: ReadingStatus;
  condition?: UserBook['condition'];
  /** Set to share this copy with the signed-in user's household (0015_households.sql). */
  householdId?: string | null;
};

export function useAddBook() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      candidate,
      existingBookId,
      bookshelfPositionId,
      readingStatus,
      condition,
      householdId,
    }: AddBookInput) => {
      if (!user) throw new Error('Not signed in');

      const bookId = existingBookId ?? (await ensureBook(candidate, user.id));

      const { data, error } = await supabase
        .from('user_books')
        .insert({
          user_id: user.id,
          book_id: bookId,
          bookshelf_position_id: bookshelfPositionId ?? null,
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

      // Both ids matter to the caller: the copy id to navigate to, and the
      // canonical book id so categories can be attached to the shared record.
      return { userBookId, bookId };
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
      | 'bookshelf_position_id'
      | 'availability_type'
      | 'exchange_preferences'
      | 'sale_price'
      | 'price_negotiable'
      | 'sale_description'
      | 'household_id'
    >
  >;
};

/** Physical-copy fields only — shelf, listing, condition, household sharing. */
export function useUpdateUserBook() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, patch }: UpdateUserBookInput) => {
      const { error } = await supabase.from('user_books').update(patch).eq('id', id);
      if (error) throw error;
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

export type UpdateBookInput = {
  bookId: string;
  userBookId: string;
  patch: Partial<
    Pick<Book, 'title' | 'subtitle' | 'authors' | 'isbn13' | 'publisher' | 'publication_year' | 'language' | 'page_count' | 'cover_url'>
  >;
  /** The book's cover_url before this edit — lets a real replacement clean up the file it replaces. */
  previousCoverUrl?: string | null;
};

/**
 * Edits the shared `books` row, not the user's copy of it.
 *
 * RLS ("creator can correct a book") only permits this when the caller is the
 * row's own creator — every other user_books.book_id foreign key pointing at it
 * would otherwise let a stranger silently rewrite what a hundred other
 * libraries display. The UI only offers this action when book_created_by
 * matches the signed-in user for the same reason; this mutation is the
 * enforcement, that is only the affordance.
 */
export function useUpdateBook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookId, patch, previousCoverUrl }: UpdateBookInput) => {
      const { error } = await supabase.from('books').update(patch).eq('id', bookId);
      if (error) throw error;

      // A cover swap orphans the old file otherwise — nothing else in the
      // schema points at it once cover_url has moved on, and it would just
      // sit in the bucket counting against the free tier's 1 GB forever.
      // Best-effort: a failed cleanup here should never undo an otherwise
      // successful save, so it's swallowed rather than thrown.
      if (
        patch.cover_url !== undefined &&
        previousCoverUrl &&
        previousCoverUrl !== patch.cover_url
      ) {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.library.entry(variables.userBookId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
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
      // sit there forever. Read their paths before the row (and the cascade)
      // is gone, then remove them once the delete that matters to the user has
      // actually succeeded.
      const { data: photos } = await supabase
        .from('user_book_photos')
        .select('storage_path')
        .eq('user_book_id', id);

      const { error } = await supabase.from('user_books').delete().eq('id', id);
      if (error) throw error;

      if (photos && photos.length > 0) {
        await supabase.storage.from('book-photos').remove(photos.map((p) => p.storage_path));
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
      case 'shelf':
        return compareShelfPosition(a, b, collator);
      case 'recent':
      default:
        return b.date_added.localeCompare(a.date_added);
    }
  });
}

/** Walks the shelf → row hierarchy, with unplaced books last. */
function compareShelfPosition(a: LibraryEntry, b: LibraryEntry, collator: Intl.Collator): number {
  if (a.bookshelf_id === null && b.bookshelf_id === null) return 0;
  if (a.bookshelf_id === null) return 1;
  if (b.bookshelf_id === null) return -1;

  const byShelf =
    (a.bookshelf_sort_order ?? 0) - (b.bookshelf_sort_order ?? 0) ||
    collator.compare(a.bookshelf_name ?? '', b.bookshelf_name ?? '');
  if (byShelf !== 0) return byShelf;

  return (a.shelf_number ?? 0) - (b.shelf_number ?? 0) || (a.row_number ?? 0) - (b.row_number ?? 0);
}
