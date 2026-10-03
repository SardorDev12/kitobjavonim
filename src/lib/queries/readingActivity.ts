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

export type PagesLogEntry = { date: string; pages: number };

/**
 * Pages read per day (0039_reading_pages_log.sql), for the stats page's
 * day/week/month/year pages tile. Empty — never an error — until that
 * migration has been run, so the rest of the stats page doesn't depend on it.
 */
export function useReadingPagesLog() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.readingActivity.pages(user?.id ?? ''),
    enabled: Boolean(user),
    queryFn: async (): Promise<PagesLogEntry[]> => {
      const { data, error } = await supabase
        .from('reading_activity')
        .select('activity_date, pages_read')
        .eq('user_id', user!.id)
        .gt('pages_read', 0);
      if (error) return [];
      return (data as { activity_date: string; pages_read: number }[]).map((row) => ({
        date: row.activity_date,
        pages: row.pages_read,
      }));
    },
  });
}
