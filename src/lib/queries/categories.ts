import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { queryKeys } from './keys';

/** Categories currently attached to a canonical book. */
export function useBookCategories(bookId: string | undefined) {
  return useQuery({
    queryKey: ['book-categories', bookId ?? ''],
    enabled: Boolean(bookId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('book_categories')
        .select('category_id')
        .eq('book_id', bookId!);
      if (error) throw error;
      return (data as { category_id: string }[]).map((row) => row.category_id);
    },
  });
}

/**
 * Replaces a book's categories with the given set.
 *
 * Written as a diff rather than delete-all-then-insert so that a save which only
 * adds a category does not momentarily strip the book of every classification
 * for other users reading it at the same time.
 */
export function useSetBookCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      bookId,
      categoryIds,
      previous,
    }: {
      bookId: string;
      categoryIds: string[];
      previous: string[];
    }) => {
      const added = categoryIds.filter((id) => !previous.includes(id));
      const removed = previous.filter((id) => !categoryIds.includes(id));

      if (removed.length > 0) {
        const { error } = await supabase
          .from('book_categories')
          .delete()
          .eq('book_id', bookId)
          .in('category_id', removed);
        if (error) throw error;
      }

      if (added.length > 0) {
        const { error } = await supabase
          .from('book_categories')
          .insert(added.map((category_id) => ({ book_id: bookId, category_id })));
        // Another owner of the same book may have added the same category
        // between our read and our write; that is the desired end state anyway.
        if (error && error.code !== '23505') throw error;
      }
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['book-categories', variables.bookId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}
