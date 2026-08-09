import { useQuery } from '@tanstack/react-query';
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

    return {
      isPending,
      regions,
      districtsFor: (regionId: string | null) => (regionId ? (districtsByRegion.get(regionId) ?? []) : []),
      describe,
      byId,
    };
  }, [data, isPending, locale]);
}

export function useCategoryOptions() {
  const { locale } = useI18n();
  const { data } = useCategories();

  return useMemo(
    () => (data ?? []).map((row) => ({ value: row.id, label: localizedName(row, locale) })),
    [data, locale]
  );
}
