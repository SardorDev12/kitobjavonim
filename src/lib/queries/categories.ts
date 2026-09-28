import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { queryKeys } from './keys';

// PostgREST's .in() filter travels in the request URL — see library.ts's own
// identical chunk() for why a whole library's worth of ids can't go in one
// request. The stats page's category breakdown is the one other place that
// hands book_categories a bulk list of ids, so it needs the same chunking.
const CATEGORY_LOOKUP_CHUNK_SIZE = 150;

/**
 * How many of the given copies carry each category — the stats page's
 * category breakdown. `book_categories` is publicly selectable (see
 * 0030_merge_books_into_user_books.sql), so this queries it directly by id
 * rather than needing a join/RLS path scoped to the signed-in user: the
 * caller already knows these ids are theirs (they came from useLibrary()).
 */
export function useLibraryCategoryCounts(userBookIds: string[]) {
  const sortedIds = [...userBookIds].sort();

  return useQuery({
    queryKey: queryKeys.reference.categoryCounts(sortedIds),
    enabled: sortedIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const counts: Record<string, number> = {};

      for (let i = 0; i < sortedIds.length; i += CATEGORY_LOOKUP_CHUNK_SIZE) {
        const batch = sortedIds.slice(i, i + CATEGORY_LOOKUP_CHUNK_SIZE);
        const { data, error } = await supabase.from('book_categories').select('category_id').in('user_book_id', batch);
        if (error) throw error;
        for (const row of data as { category_id: string }[]) {
          counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
        }
      }

      return counts;
    },
  });
}

/**
 * Categories currently attached to a copy.
 *
 * Used to also filter out a personally-hidden custom category
 * (book_category_hidden, 0022_custom_categories.sql) — that table only
 * ever existed because book_categories hung off a shared `books` row one
 * owner couldn't fully un-tag without affecting every other owner of the
 * same row. Since 0030_merge_books_into_user_books.sql, categories are
 * per-copy like everything else: removing one from your own copy is just
 * deleting your own book_categories row, so there's nothing left to hide.
 */
export function useBookCategories(userBookId: string | undefined) {
  return useQuery({
    queryKey: ['book-categories', userBookId ?? ''],
    enabled: Boolean(userBookId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('book_categories')
        .select('category_id')
        .eq('user_book_id', userBookId!);
      if (error) throw error;
      return (data as { category_id: string }[]).map((row) => row.category_id);
    },
  });
}

/**
 * Replaces a copy's categories with the given set.
 *
 * Written as a diff rather than delete-all-then-insert for the same reason
 * it always was — a save that only adds a category shouldn't momentarily
 * strip the others — though now that each copy owns its own rows outright,
 * that's no longer protecting anyone else's view, just avoiding a moment of
 * showing zero tags on screen mid-save.
 */
export function useSetBookCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userBookId,
      categoryIds,
      previous,
    }: {
      userBookId: string;
      categoryIds: string[];
      previous: string[];
    }) => {
      const added = categoryIds.filter((id) => !previous.includes(id));
      const removed = previous.filter((id) => !categoryIds.includes(id));

      if (removed.length > 0) {
        const { error } = await supabase
          .from('book_categories')
          .delete()
          .eq('user_book_id', userBookId)
          .in('category_id', removed);
        if (error) throw error;
      }

      if (added.length > 0) {
        const { error } = await supabase
          .from('book_categories')
          .insert(added.map((category_id) => ({ user_book_id: userBookId, category_id })));
        // A retried save re-adding something already there is the desired
        // end state anyway.
        if (error && error.code !== '23505') throw error;
      }
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['book-categories', variables.userBookId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}
