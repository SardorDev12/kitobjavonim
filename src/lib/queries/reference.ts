import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { localizedName } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { CategoryRow, LocationRow } from '@/types/database';

import { queryKeys } from './keys';

/** Reference data changes about once a year, so it is cached hard. */
const REFERENCE_STALE_TIME = 1000 * 60 * 60 * 24;

export function useLocations() {
  return useQuery({
    queryKey: queryKeys.reference.locations,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<LocationRow[]> => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as LocationRow[];
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.reference.categories,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<CategoryRow[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as CategoryRow[];
    },
  });
}

/**
 * Locations shaped for the UI: regions with their districts, plus a lookup that
 * turns a district id into "Chilonzor, Tashkent City" in the current language.
 */
export function useLocationOptions() {
  const { locale } = useI18n();
  const { data, isPending } = useLocations();

  return useMemo(() => {
    const rows = data ?? [];
    const byId = new Map(rows.map((row) => [row.id, row]));

    const regions = rows
      .filter((row) => row.level === 'region')
      .map((row) => ({ value: row.id, label: localizedName(row, locale) }));

    const districtsByRegion = new Map<string, { value: string; label: string }[]>();
    for (const row of rows) {
      if (row.level !== 'district' || !row.parent_id) continue;
      const list = districtsByRegion.get(row.parent_id) ?? [];
      list.push({ value: row.id, label: localizedName(row, locale) });
      districtsByRegion.set(row.parent_id, list);
    }

    /** "Chilonzor, Tashkent City" — district first, since that is the useful part. */
    function describe(districtId: string | null, regionId: string | null): string {
      const district = districtId ? byId.get(districtId) : null;
      const region = regionId ? byId.get(regionId) : null;

      const parts = [district ? localizedName(district, locale) : null, region ? localizedName(region, locale) : null]
        .filter(Boolean);

      return parts.join(', ');
    }

    /** Just one location's own name, e.g. for prefilling a free-text district field from an existing id. */
    function nameOf(id: string | null): string {
      if (!id) return '';
      const row = byId.get(id);
      return row ? localizedName(row, locale) : '';
    }

    return {
      isPending,
      regions,
      districtsFor: (regionId: string | null) => (regionId ? (districtsByRegion.get(regionId) ?? []) : []),
      describe,
      nameOf,
      byId,
    };
  }, [data, isPending, locale]);
}

/**
 * Resolves a typed district name (scoped to a region) to a locations id,
 * creating it if no district under that region already has that name —
 * case-insensitively. See find_or_create_district() in
 * 0025_free_text_district.sql; this is the only way a new locations row is
 * ever created from the client. Mirrors useCreateCategory()'s shape.
 */
export function useCreateDistrict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, regionId }: { name: string; regionId: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('find_or_create_district', {
        p_name: name,
        p_region_id: regionId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      // The new (or reused) district isn't in this client's 24h-cached
      // reference.ts list yet; invalidating forces a refetch despite that
      // staleTime — it only governs implicit refetches, not this one.
      queryClient.invalidateQueries({ queryKey: queryKeys.reference.locations });
    },
  });
}

export function useCategoryOptions() {
  const { locale } = useI18n();
  const { data } = useCategories();

  return useMemo(
    () => (data ?? []).map((row) => ({ value: row.id, label: localizedName(row, locale) })),
    [data, locale]
  );
}
