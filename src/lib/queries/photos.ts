import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  pickAndUploadAvatar,
  pickAndUploadListingPhoto,
  publicUrlFor,
  storagePathFromPublicUrl,
  uploadDroppedAvatar,
  uploadDroppedListingPhoto,
} from '@/lib/images';
import { supabase } from '@/lib/supabase';
import type { UserBookPhoto } from '@/types/database';

import { queryKeys } from './keys';

export type ListingPhoto = UserBookPhoto & { url: string };

/** The owner's view of a listing's photos — includes storage paths for deletion. */
export function useOwnListingPhotos(userBookId: string | undefined) {
  return useQuery({
    queryKey: ['own-photos', userBookId ?? ''],
    enabled: Boolean(userBookId),
    queryFn: async (): Promise<ListingPhoto[]> => {
      const { data, error } = await supabase
        .from('user_book_photos')
        .select('*')
        .eq('user_book_id', userBookId!)
        .order('sort_order');
      if (error) throw error;

      return (data as UserBookPhoto[]).map((row) => ({
        ...row,
        url: publicUrlFor('book-photos', row.storage_path),
      }));
    },
  });
}

export function useAddListingPhoto() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      userBookId,
      sortOrder,
      file,
    }: {
      userBookId: string;
      sortOrder: number;
      /** Set for a file dropped onto the page (web); omitted for the OS picker. */
      file?: File;
    }) => {
      if (!user) throw new Error('Not signed in');

      const path = file
        ? await uploadDroppedListingPhoto(user.id, userBookId, file)
        : await pickAndUploadListingPhoto(user.id, userBookId);
      // Null means the user backed out of the picker, declined the permission
      // prompt, or dropped a non-image file — none of it worth surfacing as
      // an error.
      if (!path) return null;

      const { error } = await supabase.from('user_book_photos').insert({
        user_book_id: userBookId,
        user_id: user.id,
        storage_path: path,
        sort_order: sortOrder,
      });
      if (error) throw error;

      return path;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['own-photos', variables.userBookId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.photos(variables.userBookId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useDeleteListingPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (photo: ListingPhoto) => {
      const { error } = await supabase.from('user_book_photos').delete().eq('id', photo.id);
      if (error) throw error;

      // Remove the object too, or the bucket fills with rows nothing points at
      // and the 1 GB free allowance disappears into orphans.
      await supabase.storage.from('book-photos').remove([photo.storage_path]);
    },
    onSuccess: (_result, photo) => {
      queryClient.invalidateQueries({ queryKey: ['own-photos', photo.user_book_id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.photos(photo.user_book_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useUploadAvatar() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    // The current avatar_url is passed in rather than read from cache, same
    // reasoning as useRemoveAvatar below — it's what lets the old file get
    // cleaned up once the new one is live, instead of orphaning it.
    mutationFn: async ({ file, currentAvatarUrl }: { file?: File; currentAvatarUrl: string | null }) => {
      if (!user) throw new Error('Not signed in');

      const url = file ? await uploadDroppedAvatar(user.id, file) : await pickAndUploadAvatar(user.id);
      if (!url) return null;

      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      if (error) throw error;

      const oldPath = currentAvatarUrl ? storagePathFromPublicUrl('avatars', currentAvatarUrl) : null;
      if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);

      return url;
    },
    onSuccess: async (url) => {
      if (!url) return;
      await refreshProfile();
      // The owner's avatar rides along with every listing they have.
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useRemoveAvatar() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    // The current avatar_url is passed in rather than read from cache — the
    // profile lives in AuthProvider's own state, not React Query, so the
    // caller (which already has it from useAuth()) is the only place with it.
    mutationFn: async (currentAvatarUrl: string | null) => {
      if (!user) throw new Error('Not signed in');

      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
      if (error) throw error;

      // A Google/Apple avatar lives on their CDN, not ours — nothing to clean up
      // there, only for photos this app uploaded itself.
      const path = currentAvatarUrl ? storagePathFromPublicUrl('avatars', currentAvatarUrl) : null;
      if (path) await supabase.storage.from('avatars').remove([path]);
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}
