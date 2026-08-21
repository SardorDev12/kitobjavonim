import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { WishlistEntry } from '@/types/database';

import { queryKeys } from './keys';

/**
 * Books the signed-in user wants but doesn't own yet — just a title and
 * author, deliberately separate from the library, which is copies actually
 * owned. See 0019_wishlist.sql for why the row supports far more columns
 * than the app currently fills in (title/authors only, for now).
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
    mutationFn: async ({ title, authors }: { title: string; authors: string[] }) => {
      if (!user) throw new Error('Not signed in');

      const { data, error } = await supabase
        .from('wishlist_items')
        .insert({ user_id: user.id, title: title.trim(), authors })
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

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function authorsKey(authors: string[]): string {
  return authors
    .map(normalize)
    .filter(Boolean)
    .sort()
    .join('|');
}

/** Title and authors both match, case-insensitively — the bar for "this is the same book". */
export function isSameWishlistBook(item: WishlistEntry, title: string, authors: string[]): boolean {
  return normalize(item.title) === normalize(title) && authorsKey(item.authors) === authorsKey(authors);
}

/**
 * The wishlist entry a newly-picked book matches, if any — used to suggest
 * clearing it (add.tsx, add/manual.tsx) and, unconditionally, to actually
 * clear it once the book is saved (add/configure.tsx), regardless of
 * whether the suggestion was acted on.
 */
export function findWishlistMatch(
  wishlist: WishlistEntry[] | undefined,
  title: string,
  authors: string[]
): WishlistEntry | null {
  return wishlist?.find((item) => isSameWishlistBook(item, title, authors)) ?? null;
}
