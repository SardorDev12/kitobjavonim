import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

/**
 * Image picking and upload.
 *
 * Two constraints shape this. The storage buckets reject anything over 2 MB, and
 * the free tier gives 1 GB in total — so every image is resized and re-encoded
 * before it leaves the device rather than after it arrives. A modern phone
 * camera produces 4-6 MB files; a 1400px JPEG at 70% lands around 200 KB, which
 * is the difference between a few thousand listings and a few hundred.
 *
 * Uploads go as an ArrayBuffer decoded from base64 rather than as a Blob:
 * React Native's Blob implementation does not carry the underlying bytes in a
 * way supabase-js can read, and the result is a silent zero-byte upload.
 */

const MAX_EDGE = 1400;
const AVATAR_EDGE = 512;
const QUALITY = 0.7;

export type PickedImage = {
  base64: string;
  contentType: string;
  extension: string;
};

async function pickAndCompress(maxEdge: number): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: maxEdge === AVATAR_EDGE,
    aspect: maxEdge === AVATAR_EDGE ? [1, 1] : undefined,
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];

  // Only downscale — enlarging a small photo just wastes bytes.
  const longestEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  const actions: ImageManipulator.Action[] =
    longestEdge > maxEdge
      ? [asset.width >= asset.height ? { resize: { width: maxEdge } } : { resize: { height: maxEdge } }]
      : [];

  const manipulated = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!manipulated.base64) return null;

  return { base64: manipulated.base64, contentType: 'image/jpeg', extension: 'jpg' };
}

async function upload(bucket: string, path: string, image: PickedImage): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, decode(image.base64), {
    contentType: image.contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/**
 * Same resize/compress pass as pickAndCompress, starting from a File a user
 * dropped onto the page instead of one ImagePicker handed back — web-only,
 * for drag-and-drop.
 */
async function fileToPickedImage(file: File, maxEdge: number): Promise<PickedImage | null> {
  if (!file.type.startsWith('image/')) return null;

  const objectUrl = URL.createObjectURL(file);
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new globalThis.Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Could not read the dropped file as an image.'));
      img.src = objectUrl;
    });

    const longestEdge = Math.max(width, height);
    const actions: ImageManipulator.Action[] =
      longestEdge > maxEdge
        ? [width >= height ? { resize: { width: maxEdge } } : { resize: { height: maxEdge } }]
        : [];

    const manipulated = await ImageManipulator.manipulateAsync(objectUrl, actions, {
      compress: QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });

    if (!manipulated.base64) return null;
    return { base64: manipulated.base64, contentType: 'image/jpeg', extension: 'jpg' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Picks a listing photo and uploads it.
 *
 * The path starts with the user's id because that is what the storage policies
 * check — `(storage.foldername(name))[1] = auth.uid()` — so the folder layout is
 * load-bearing, not just tidy.
 */
export async function pickAndUploadListingPhoto(
  userId: string,
  userBookId: string
): Promise<string | null> {
  const image = await pickAndCompress(MAX_EDGE);
  if (!image) return null;

  const path = `${userId}/${userBookId}/${Date.now()}.${image.extension}`;
  return upload('book-photos', path, image);
}

/** Same as pickAndUploadListingPhoto, but for a file dropped onto the page (web). */
export async function uploadDroppedListingPhoto(
  userId: string,
  userBookId: string,
  file: File
): Promise<string | null> {
  const image = await fileToPickedImage(file, MAX_EDGE);
  if (!image) return null;

  const path = `${userId}/${userBookId}/${Date.now()}.${image.extension}`;
  return upload('book-photos', path, image);
}

/**
 * Picks a cover photo for a manually-entered book.
 *
 * Reuses the `book-photos` bucket under a `covers/` prefix rather than adding a
 * dedicated bucket — the storage policies already key off the user id being the
 * first path segment, so a new bucket would only duplicate the same policies
 * for no real gain. Uncropped, unlike the avatar picker: covers are not square,
 * and forcing one would distort every photographed cover.
 */
export async function pickAndUploadBookCover(userId: string): Promise<string | null> {
  const image = await pickAndCompress(MAX_EDGE);
  if (!image) return null;

  const path = `${userId}/covers/${Date.now()}.${image.extension}`;
  await upload('book-photos', path, image);

  return publicUrlFor('book-photos', path);
}

export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const image = await pickAndCompress(AVATAR_EDGE);
  if (!image) return null;

  const path = `${userId}/avatar-${Date.now()}.${image.extension}`;
  await upload('avatars', path, image);

  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export function publicUrlFor(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * The inverse of `publicUrlFor` — pulls the storage path back out of a public
 * URL, since `avatar_url` stores the full URL but `.remove()` needs just the
 * path. Returns null for anything that is not actually a URL in this bucket
 * (an avatar sourced from Google/Apple sign-in, say), which callers treat as
 * "nothing of ours to delete."
 */
export function storagePathFromPublicUrl(bucket: string, url: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}
