-- =============================================================================
-- 0026_private_custom_categories.sql — a user's own custom genre stops
-- showing up for everyone else.
--
-- 0022_custom_categories.sql made find_or_create_category() open to any
-- signed-in user, but every category it creates is visible to (and reusable
-- by) every other user — a tester flagged this as unwanted: typing one genre
-- for their own shelf shouldn't hand it to strangers as a pickable option.
-- The 6 built-in categories (still seeded centrally, created_by null) stay
-- exactly as shared as before; only user-created ones become private to
-- their creator.
--
-- book_categories (which book has which tag) is untouched — it still hangs
-- off the canonical book record per 0006_category_permissions.sql, shared
-- across every owner of that book. A private category id can end up on a
-- book someone else also owns; that other owner simply won't see a chip for
-- it (CategoryPicker only ever renders ids present in useCategoryOptions()),
-- and any edit they make to their own book's categories leaves that
-- invisible id untouched. That's an accepted, narrow edge case of tagging
-- living on the shared book row at all — not something this migration tries
-- to fix.
-- =============================================================================

drop policy "categories are public" on categories;

create policy "built-ins are public, custom categories are private to creator"
  on categories for select
  to anon, authenticated
  using (created_by is null or created_by = auth.uid());

-- The old dedup index was global (one name across every user, built-in or
-- not) — that's exactly the sharing this migration removes. Replaced with
-- two scopes: built-ins stay unique among themselves (still the first thing
-- find_or_create_category() below checks, so typing an existing genre name
-- always reuses the shared one rather than shadowing it), and each user's
-- own custom categories are unique only within that user's own set — two
-- different users typing "Cozy fantasy" now get two separate, private rows.
drop index categories_name_uz_lower_idx;

create unique index categories_builtin_name_lower_idx
  on categories (lower(name_uz))
  where created_by is null;

create unique index categories_custom_name_lower_idx
  on categories (created_by, lower(name_uz))
  where created_by is not null;

create or replace function find_or_create_category(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   text;
  v_name text := btrim(p_name);
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if length(v_name) = 0 then
    raise exception 'name is required';
  end if;

  -- A built-in category always wins the match first, so typing an existing
  -- genre name reuses the shared one instead of creating a private shadow
  -- of it.
  select id into v_id from categories where created_by is null and lower(name_uz) = lower(v_name);
  if v_id is not null then
    return v_id;
  end if;

  -- Then this caller's own previously-created private categories, so typing
  -- the same custom name twice reuses it rather than creating a duplicate.
  -- Deliberately never matches another user's private category — they
  -- can't see it (the select policy above), so handing its id back here
  -- would tag this caller's book with a category whose name they can't read.
  select id into v_id from categories where created_by = auth.uid() and lower(name_uz) = lower(v_name);
  if v_id is not null then
    return v_id;
  end if;

  insert into categories (id, name_uz, name_ru, name_en, sort_order, created_by)
  values ('custom-' || gen_random_uuid()::text, v_name, v_name, v_name, 100, auth.uid())
  -- Another request from the same caller may have inserted the same name
  -- between the selects above and this insert; on conflict, hand back the
  -- row that won the race instead of failing over a duplicate that isn't
  -- really one.
  on conflict (created_by, lower(name_uz)) where created_by is not null
  do update set name_uz = categories.name_uz
  returning id into v_id;

  return v_id;
end;
$$;
