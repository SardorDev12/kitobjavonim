import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { queryKeys } from './keys';

/**
 * The Android version the "update available" prompt compares the installed
 * binary against — a single row in app_config, updated by hand from the SQL
 * editor whenever a new production build ships. Cached hard: this changes
 * only when a person deliberately edits it, and re-checking on every app
 * open (rather than every render) is already frequent enough to catch it
 * promptly.
 */
export function useLatestAndroidVersion() {
  return useQuery({
    queryKey: queryKeys.appConfig.latestAndroidVersion,
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'latest_android_version')
        .maybeSingle();
      if (error) throw error;
      return data?.value ?? null;
    },
  });
}
