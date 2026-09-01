import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

import { queryKeys } from './keys';

/**
 * Categories currently attached to a canonical book, minus any the
 * signed-in user has personally hidden (0022_custom_categories.sql — only
 * ever applies to a category someone else created; a built-in category has
 * no hidden rows, so this is a no-op filter for those).
 */
export function useBookCategories(bookId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['book-categories', bookId ?? '', user?.id ?? ''],
    enabled: Boolean(bookId),
    queryFn: async (): Promise<string[]> => {
      const [{ data, error }, hiddenResult] = await Promise.all([
        supabase.from('book_categories').select('category_id').eq('book_id', bookId!),
        user
          ? supabase.from('book_category_hidden').select('category_id').eq('book_id', bookId!).eq('user_id', user.id)
          : Promise.resolve({ data: [] as { category_id: string }[], error: null }),
      ]);
      if (error) throw error;
      if (hiddenResult.error) throw hiddenResult.error;

      const hidden = new Set((hiddenResult.data as { category_id: string }[]).map((row) => row.category_id));
      return (data as { category_id: string }[])
        .map((row) => row.category_id)
        .filter((id) => !hidden.has(id));
    },
  });
}

/**
 * Replaces a book's categories with the given set.
 *
 * Written as a diff rather than delete-all-then-insert so that a save which only
 * adds a category does not momentarily strip the book of every classification
 * for other users reading it at the same time.
 *
 * A removal is only a real, shared delete for a built-in category — see the
 * comment atop 0022_custom_categories.sql. A custom (user-created) category
 * instead records a personal book_category_hidden row: the shared tag stays
 * in place for every other owner, and useBookCategories filters it out of
 * this caller's own view only.
 */
export function useSetBookCategories() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

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
      if (!user) throw new Error('Not signed in');

      const added = categoryIds.filter((id) => !previous.includes(id));
      const removed = previous.filter((id) => !categoryIds.includes(id));

      if (removed.length > 0) {
        const { data: removedCategories, error: lookupError } = await supabase
          .from('categories')
          .select('id, created_by')
          .in('id', removed);
        if (lookupError) throw lookupError;

        const builtIn = (removedCategories as { id: string; created_by: string | null }[])
          .filter((c) => c.created_by === null)
          .map((c) => c.id);
        const custom = (removedCategories as { id: string; created_by: string | null }[])
          .filter((c) => c.created_by !== null)
          .map((c) => c.id);

        if (builtIn.length > 0) {
          const { error } = await supabase
            .from('book_categories')
            .delete()
            .eq('book_id', bookId)
            .in('category_id', builtIn);
          if (error) throw error;
        }

        if (custom.length > 0) {
          const { error } = await supabase
            .from('book_category_hidden')
            .insert(custom.map((category_id) => ({ book_id: bookId, category_id, user_id: user.id })));
          // Already hidden by this user (an earlier removal that never got
          // un-hidden by a later re-add) is the desired end state anyway.
          if (error && error.code !== '23505') throw error;
        }
      }

      if (added.length > 0) {
        // Re-selecting something this user had personally hidden un-hides it,
        // rather than trying to insert a second, redundant shared tag.
        const { error: unhideError } = await supabase
          .from('book_category_hidden')
          .delete()
          .eq('book_id', bookId)
          .eq('user_id', user.id)
          .in('category_id', added);
        if (unhideError) throw unhideError;

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

/**
 * Resolves a typed name to a category id, creating it if no category (built-in
 * or someone else's custom one) already has that name — case-insensitively.
 * See find_or_create_category() in 0022_custom_categories.sql; this is the
 * only way a new categories row is ever created from the client.
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
