import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { queryKeys } from './keys';

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

/**
 * Resolves a typed name to a category id, creating it if no category (built-in
 * or this user's own earlier custom one) already has that name — case-
 * insensitively. See find_or_create_category() in 0022_custom_categories.sql
 * (rewritten 0026_private_custom_categories.sql); this is the only way a new
 * categories row is ever created from the client.
 */
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      const { data, error } = await supabase.rpc('find_or_create_category', { p_name: name });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      // The new (or reused) category isn't in this client's 24h-cached
      // reference.ts list yet; invalidating forces a refetch despite that
      // staleTime — it only governs implicit refetches, not this one.
      queryClient.invalidateQueries({ queryKey: queryKeys.reference.categories });
    },
  });
}
