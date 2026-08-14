import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { AdminReport } from '@/types/database';

import { queryKeys } from './keys';

/**
 * Both RPCs (supabase/migrations/0012_report_moderation.sql) check
 * profiles.is_admin server-side and simply return nothing / raise for
 * anyone else — there is no client-side gate to keep these hooks safe to
 * call, only one to keep the screen that calls them from ever rendering
 * for a non-admin (see app/admin/reports.tsx).
 */
export function useAdminReports() {
  return useQuery({
    queryKey: queryKeys.admin.reports,
    queryFn: async (): Promise<AdminReport[]> => {
      const { data, error } = await supabase.rpc('admin_list_reports');
      if (error) throw error;
      return (data as AdminReport[]) ?? [];
    },
  });
}

export function useResolveReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.rpc('admin_resolve_report', { p_report_id: reportId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.reports });
    },
  });
}
