import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { PlanStatus, Profile, ProfileStats } from '@/types/database';

import { queryKeys } from './keys';

export function useProfileStats(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile.stats(userId ?? ''),
    enabled: Boolean(userId),
    queryFn: async (): Promise<ProfileStats | null> => {
      const { data, error } = await supabase
        .from('profile_stats')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ProfileStats) ?? null;
    },
  });
}

/** Free/Pro plan, its expiry, and live usage against the freemium caps. */
export function useMyPlanStatus(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.plan.status(userId ?? ''),
    enabled: Boolean(userId),
    queryFn: async (): Promise<PlanStatus | null> => {
      const { data, error } = await supabase.rpc('my_plan_status');
      if (error) throw error;
      return (data as PlanStatus[])?.[0] ?? null;
    },
  });
}

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'avatar_url'
    | 'bio'
    | 'region_id'
    | 'district_id'
    | 'telegram_username'
    | 'phone'
    | 'show_phone'
    | 'show_telegram'
    | 'preferred_locale'
    | 'onboarded_at'
  >
>;

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { user, refreshProfile } = useAuth();

  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      if (!user) throw new Error('Not signed in');

      const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      // The owner's display name and area travel with every listing they have.
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

/** True once the user can actually be reached — required before listing a book. */
export function hasContactMethod(profile: Profile | null): boolean {
  if (!profile) return false;
  return (
    Boolean(profile.telegram_username && profile.show_telegram) ||
    Boolean(profile.phone && profile.show_phone)
  );
}
