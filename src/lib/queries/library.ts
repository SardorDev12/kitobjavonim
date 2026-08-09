import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BookCandidate } from '@/lib/books/metadata';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { LibraryEntry, UserBook } from '@/types/database';

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
  bookshelfPositionId?: string | null;
  readingStatus?: UserBook['reading_status'];
  condition?: UserBook['condition'];
};

export function useAddBook() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ candidate, bookshelfPositionId, readingStatus, condition }: AddBookInput) => {
      if (!user) throw new Error('Not signed in');

      const bookId = await ensureBook(candidate, user.id);

      const { data, error } = await supabase
        .from('user_books')
        .insert({
          user_id: user.id,
          book_id: bookId,
          bookshelf_position_id: bookshelfPositionId ?? null,
          reading_status: readingStatus ?? 'want_to_read',
          condition: condition ?? null,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id as string;
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
      | 'reading_status'
      | 'condition'
      | 'rating'
      | 'review'
      | 'notes'
      | 'date_finished'
      | 'bookshelf_position_id'
      | 'availability_type'
      | 'exchange_preferences'
      | 'sale_price'
      | 'price_negotiable'
      | 'sale_description'
    >
  >;
};

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
      if (user) queryClient.invalidateQueries({ queryKey: queryKeys.profile.stats(user.id) });
    },
  });
}

export function useDeleteUserBook() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_books').delete().eq('id', id);
      if (error) throw error;
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
