import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { formatPosition } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Bookshelf, BookshelfPosition } from '@/types/database';

import { queryKeys } from './keys';

export type BookshelfWithPositions = Bookshelf & { positions: BookshelfPosition[] };

export function useBookshelves() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.bookshelves.list(user?.id ?? 'anonymous'),
    enabled: Boolean(user),
    queryFn: async (): Promise<BookshelfWithPositions[]> => {
      const [shelves, positions] = await Promise.all([
        supabase.from('bookshelves').select('*').order('sort_order').order('created_at'),
        supabase.from('bookshelf_positions').select('*').order('shelf_number').order('row_number'),
      ]);

      if (shelves.error) throw shelves.error;
      if (positions.error) throw positions.error;

      const byShelf = new Map<string, BookshelfPosition[]>();
      for (const position of positions.data as BookshelfPosition[]) {
        const list = byShelf.get(position.bookshelf_id) ?? [];
        list.push(position);
        byShelf.set(position.bookshelf_id, list);
      }

      return (shelves.data as Bookshelf[]).map((shelf) => ({
        ...shelf,
        positions: byShelf.get(shelf.id) ?? [],
      }));
    },
  });
}

/**
 * Every position flattened into Select options.
 *
 * The PRD is explicit that positions must come from the user's own configuration
 * rather than hard-coded values, so this is the only source the pickers use.
 */
export function usePositionOptions() {
  const { t } = useI18n();
  const { data } = useBookshelves();

  return useMemo(() => {
    const options: { value: string; label: string; detail?: string }[] = [];

    for (const shelf of data ?? []) {
      for (const position of shelf.positions) {
        options.push({
          value: position.id,
          label: formatPosition(
            {
              bookshelf_name: shelf.name,
              shelf_number: position.shelf_number,
              row_number: position.row_number,
              position_label: position.label,
            },
            t,
            { includeBookshelf: true }
          ),
        });
      }
    }

    return options;
  }, [data, t]);
}

export function useCreateBookshelf() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ name, householdId }: { name: string; householdId?: string | null }) => {
      if (!user) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('bookshelves')
        .insert({ user_id: user.id, name: name.trim(), household_id: householdId ?? null })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookshelves.all }),
  });
}

export function useRenameBookshelf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('bookshelves').update({ name: name.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookshelves.all }),
  });
}

export function useDeleteBookshelf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bookshelves').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookshelves.all });
      // Books that sat on the deleted shelf are now unplaced.
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
    },
  });
}

export function useCreatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      bookshelfId,
      shelfNumber,
      rowNumber,
      label,
    }: {
      bookshelfId: string;
      shelfNumber: number;
      rowNumber: number;
      label?: string | null;
    }) => {
      // user_id is filled in by a trigger from the parent shelf, so it is
      // deliberately absent here.
      const { error } = await supabase.from('bookshelf_positions').insert({
        bookshelf_id: bookshelfId,
        shelf_number: shelfNumber,
        row_number: rowNumber,
        label: label?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bookshelves.all }),
  });
}

export function useDeletePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bookshelf_positions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookshelves.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
    },
  });
}
