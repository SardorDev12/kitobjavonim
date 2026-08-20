import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BookCandidate } from '@/lib/books/metadata';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { WishlistEntry } from '@/types/database';

import { queryKeys } from './keys';

/**
 * Books the signed-in user (and their household, if any) wants to acquire
 * but doesn't own yet — deliberately separate from the library, which is
 * copies actually owned. See 0019_wishlist.sql for why wishlist rows carry
 * their own book fields rather than pointing at the shared `books` catalog.
 */
export function useWishlist() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.wishlist.list(user?.id ?? 'anonymous'),
    enabled: Boolean(user),
    queryFn: async (): Promise<WishlistEntry[]> => {
      const { data, error } = await supabase
        .from('wishlist_entries')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WishlistEntry[];
    },
  });
}

export function useAddWishlistItem() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      candidate,
      householdId,
    }: {
      candidate: BookCandidate;
      householdId?: string | null;
    }) => {
      if (!user) throw new Error('Not signed in');

      const { data, error } = await supabase
        .from('wishlist_items')
        .insert({
          user_id: user.id,
          household_id: householdId ?? null,
          title: candidate.title.trim(),
          subtitle: candidate.subtitle,
          authors: candidate.authors,
          isbn13: candidate.isbn13,
          isbn10: candidate.isbn10,
          publisher: candidate.publisher,
          publication_year: candidate.publication_year,
          language: candidate.language,
          cover_url: candidate.cover_url,
          page_count: candidate.page_count,
          description: candidate.description,
          source: candidate.source,
          source_id: candidate.source_id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.wishlist.all }),
  });
}

/** Mirrors useSetBookshelfHousehold (bookshelves.ts) — flips an existing item between personal and shared. */
export function useSetWishlistItemHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, householdId }: { id: string; householdId: string | null }) => {
      const { error } = await supabase.from('wishlist_items').update({ household_id: householdId }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.wishlist.all }),
  });
}

export function useDeleteWishlistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wishlist_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.wishlist.all }),
  });
}
