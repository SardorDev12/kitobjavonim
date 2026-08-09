-- =============================================================================
-- 0004_storage.sql — buckets for avatars and listing photos
--
-- Both buckets are public-read: covers and condition photos appear on the
-- discovery screen, which anonymous visitors can browse. Writes are confined to
-- a per-user folder, so the first path segment must equal the caller's user id:
--
--   avatars/<user_id>/<file>
--   book-photos/<user_id>/<user_book_id>/<file>
--
-- The 2 MB cap is not arbitrary. Supabase's free tier gives 1 GB of storage
-- total, so unbounded uploads are the fastest way to run out of the free plan.
-- The client downscales images before upload; this is the backstop.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',     'avatars',     true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('book-photos', 'book-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Avatars
-- -----------------------------------------------------------------------------

create policy "avatars are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

create policy "users write their own avatar folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update their own avatar folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own avatar folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- Listing photos
-- -----------------------------------------------------------------------------

create policy "listing photos are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'book-photos');

create policy "users write their own listing photo folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'book-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update their own listing photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'book-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own listing photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'book-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
