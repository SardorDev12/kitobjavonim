import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

import { queryKeys } from './keys';

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
    | 'reading_goal_books'
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
