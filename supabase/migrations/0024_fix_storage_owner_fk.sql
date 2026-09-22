-- =============================================================================
-- 0024_fix_storage_owner_fk.sql — stop a storage upload from blocking account
-- deletion
--
-- "Database error deleting user" from Supabase Auth (dashboard, the Auth
-- Admin API, or the admin panel's deleteUser -> supabase/functions/
-- admin-users) even for a user with zero books. Root cause: storage.objects
-- (Supabase's own Storage schema — not a table this repo's migrations
-- create) has a foreign key from its owner column to auth.users(id) with no
-- explicit ON DELETE behavior. Postgres defaults an unspecified FK to
-- RESTRICT, so any user who ever uploaded so much as an avatar during
-- onboarding (the avatars/book-photos buckets from 0004_storage.sql) leaves
-- a storage.objects row referencing them, which then blocks their
-- auth.users row from being deleted at all — independent of whether they
-- ever owned a book.
--
-- Every application table this repo defines already has a correct cascade
-- or set-null on its own auth.users FK (checked directly against every
-- migration); this is the one FK Supabase itself provisions that was never
-- covered.
--
-- Rewrites every such FK to ON DELETE SET NULL (the metadata row survives,
-- just un-owned) rather than hardcoding a specific constraint name —
-- Supabase's Storage schema has shipped more than one shape of this
-- constraint across versions (owner vs owner_id column, varying constraint
-- names), and guessing wrong would just fail this file outright instead of
-- fixing anything.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.conrelid = 'storage.objects'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype <> 'n' -- not already ON DELETE SET NULL
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      r.tbl, r.conname, r.col
    );
    raise notice 'Fixed %.% (constraint %) to ON DELETE SET NULL', r.tbl, r.col, r.conname;
  end loop;
end $$;
