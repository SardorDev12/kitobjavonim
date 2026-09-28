import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

import { queryKeys } from './keys';

/**
 * Every day the signed-in user touched their reading progress (0036_
 * reading_stats_extras.sql) — logged by useUpdateReadingProgress()
 * (src/lib/queries/library.ts), read back here for the stats page's streak.
 * A personal history, never more than a few hundred rows even for someone
 * who used the app daily for a year, so one unfiltered select is enough.
 */
export function useReadingActivity() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.readingActivity.mine(user?.id ?? ''),
    enabled: Boolean(user),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('reading_activity').select('activity_date').eq('user_id', user!.id);
      if (error) throw error;
      return (data as { activity_date: string }[]).map((row) => row.activity_date);
    },
  });
}
