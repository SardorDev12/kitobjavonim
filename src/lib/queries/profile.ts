import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { Profile, ProfileStats } from '@/types/database';

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
  return Boolean(profile.telegram_username) || Boolean(profile.phone && profile.show_phone);
}
