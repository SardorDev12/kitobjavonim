import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { Household, HouseholdMember, HouseholdRole } from '@/types/database';

import { queryKeys } from './keys';

export type HouseholdMemberWithProfile = HouseholdMember & {
  display_name: string;
  avatar_url: string | null;
};

export type HouseholdInfo = {
  household: Household;
  role: HouseholdRole;
  members: HouseholdMemberWithProfile[];
};

/**
 * The signed-in user's household, or null if they're not in one — the
 * common case, since sharing is opt-in. Member names come from
 * `public_profiles`, not `profiles`: RLS only lets you read your own raw
 * profile row, but every member needs to see every other member's name.
 */
export function useHousehold() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.household.mine(user?.id ?? 'anonymous'),
    enabled: Boolean(user),
    queryFn: async (): Promise<HouseholdInfo | null> => {
      const { data: membership, error: membershipError } = await supabase
        .from('household_members')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return null;

      const householdId = (membership as HouseholdMember).household_id;

      const [householdResult, rosterResult] = await Promise.all([
        supabase.from('households').select('*').eq('id', householdId).single(),
        supabase.from('household_members').select('*').eq('household_id', householdId).order('joined_at'),
      ]);
      if (householdResult.error) throw householdResult.error;
      if (rosterResult.error) throw rosterResult.error;

      const roster = (rosterResult.data ?? []) as HouseholdMember[];

      const { data: profiles, error: profilesError } = await supabase
        .from('public_profiles')
        .select('id, display_name, avatar_url')
        .in(
          'id',
          roster.map((member) => member.user_id)
        );
      if (profilesError) throw profilesError;

      const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));

      return {
        household: householdResult.data as Household,
        role: (membership as HouseholdMember).role,
        members: roster.map((member) => ({
          ...member,
          display_name: (profileById.get(member.user_id)?.display_name as string | undefined) ?? '',
          avatar_url: (profileById.get(member.user_id)?.avatar_url as string | null | undefined) ?? null,
        })),
      };
    },
  });
}

function invalidateHousehold(queryClient: ReturnType<typeof useQueryClient>, userId: string | undefined) {
  queryClient.invalidateQueries({ queryKey: queryKeys.household.mine(userId ?? '') });
}

// Membership changing also changes what's visible on the shelves — a join
// reveals the household's shared library immediately, a leave hides it.
function invalidateSharedLibrary(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.bookshelves.all });
}

export function useCreateHousehold() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.rpc('create_household', { p_name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => invalidateHousehold(queryClient, user?.id),
  });
}

export function useJoinHousehold() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (inviteCode: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.rpc('join_household', { p_invite_code: inviteCode.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateHousehold(queryClient, user?.id);
      invalidateSharedLibrary(queryClient);
    },
  });
}

export function useLeaveHousehold() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('leave_household');
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateHousehold(queryClient, user?.id);
      invalidateSharedLibrary(queryClient);
    },
  });
}

export function useRemoveHouseholdMember() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('remove_household_member', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => invalidateHousehold(queryClient, user?.id),
  });
}

export function useRegenerateInviteCode() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('regenerate_invite_code');
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateHousehold(queryClient, user?.id),
  });
}

export function useRenameHousehold() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('households').update({ name: name.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateHousehold(queryClient, user?.id),
  });
}
