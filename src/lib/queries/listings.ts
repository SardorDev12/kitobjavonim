import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { BookCondition, ContactChannel, ContactDetails, Listing } from '@/types/database';

import { queryKeys } from './keys';

export type ListingFilters = {
  search: string;
  type: 'all' | 'exchange' | 'sale';
  categoryId: string | null;
  language: string | null;
  condition: BookCondition | null;
  regionId: string | null;
  districtId: string | null;
};

export const emptyListingFilters: ListingFilters = {
  search: '',
  type: 'all',
  categoryId: null,
  language: null,
  condition: null,
  regionId: null,
  districtId: null,
};

const PAGE_SIZE = 40;

/**
 * The discovery feed.
 *
 * Filtering runs server-side here — unlike the personal library — because this
 * table grows with every user on the platform, and shipping all of it to a phone
 * on mobile data is not an option.
 */
export function useListings(filters: ListingFilters) {
  return useQuery({
    queryKey: queryKeys.listings.list(filters),
    queryFn: async (): Promise<Listing[]> => {
      let query = supabase.from('listings').select('*');

      if (filters.type === 'exchange') {
        query = query.in('availability_type', ['exchange', 'exchange_or_sale']);
      } else if (filters.type === 'sale') {
        query = query.in('availability_type', ['sale', 'exchange_or_sale']);
      }

      if (filters.language) query = query.eq('language', filters.language);
      if (filters.condition) query = query.eq('condition', filters.condition);
      if (filters.districtId) query = query.eq('owner_district_id', filters.districtId);
      else if (filters.regionId) query = query.eq('owner_region_id', filters.regionId);
      if (filters.categoryId) query = query.contains('category_ids', [filters.categoryId]);

      const term = filters.search.trim();
      if (term) {
        // websearch_to_tsquery handles quoted phrases and bare words the way a
        // user expects, and tolerates the punctuation people type into a search
        // box without throwing a syntax error the way plainto_tsquery would.
        query = query.textSearch('search_vector', term, { type: 'websearch', config: 'simple' });
      }

      const { data, error } = await query
        .order('listed_at', { ascending: false, nullsFirst: false })
        .limit(PAGE_SIZE);

      if (error) throw error;
      return data as Listing[];
    },
  });
}

export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.listings.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Listing | null> => {
      const { data, error } = await supabase.from('listings').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return (data as Listing) ?? null;
    },
  });
}

export function useListingPhotos(userBookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.listings.photos(userBookId ?? ''),
    enabled: Boolean(userBookId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('user_book_photos')
        .select('storage_path')
        .eq('user_book_id', userBookId!)
        .order('sort_order');
      if (error) throw error;

      return (data as { storage_path: string }[]).map(
        (row) => supabase.storage.from('book-photos').getPublicUrl(row.storage_path).data.publicUrl
      );
    },
  });
}

/**
 * Fetches an owner's contact details.
 *
 * Goes through the request_contact RPC rather than reading a column, because
 * that function is also what records the tap. "Number of owner contacts" is the
 * headline metric in the PRD, and this is the only place it can be counted.
 */
export function useRequestContact() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      userBookId,
      channel,
      message,
    }: {
      userBookId: string;
      channel: ContactChannel;
      message?: string;
    }): Promise<ContactDetails | null> => {
      const { data, error } = await supabase.rpc('request_contact', {
        p_user_book_id: userBookId,
        p_channel: channel,
        p_message: message ?? null,
      });
      if (error) throw error;
      return (data as ContactDetails[])?.[0] ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-requests'] });
      if (user) queryClient.invalidateQueries({ queryKey: queryKeys.plan.status(user.id) });
    },
  });
}

export function useReportListing() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      userBookId,
      reason,
      details,
    }: {
      userBookId: string;
      reason: string;
      details?: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.from('listing_reports').insert({
        user_book_id: userBookId,
        reporter_id: user.id,
        reason,
        details: details ?? null,
      });
      // A duplicate report from the same user is a no-op, not an error worth
      // showing — they have already told us.
      if (error && error.code !== '23505') throw error;
    },
  });
}
