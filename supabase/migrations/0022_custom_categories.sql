-- =============================================================================
-- 0022_custom_categories.sql — a smaller, locally-relevant seed list, plus
-- letting any signed-in user add further categories of their own.
--
-- The original 20-category seed (0005_seed_reference.sql) was a generic
-- English-named list. It doesn't fit how this app's actual users think about
-- their shelves — several genuinely common groupings (family reads,
-- children's literature split from adult fiction, Uzbek vs. translated
-- fiction) either don't exist in it or are named in a way nobody here would
-- pick. Replaced with 6 categories in the app's own language. 'science',
-- 'religion' and 'children' keep their existing ids (renamed/retitled in
-- place) since they're being kept, not dropped; everything else is removed,
-- along with any book_categories row that pointed at it — the book itself is
-- untouched, it just loses that one tag.
--
-- On top of that, `categories` has been admin/migration-only since it was
-- created (0003_rls.sql grants select only, no insert policy at all) — six
-- fixed categories was never going to cover everyone's shelves, so
-- find_or_create_category() below opens a narrow, name-based door: any
-- signed-in user can add a new one, and typing an existing name (their own
-- or anyone else's, case-insensitively) reuses it rather than creating a
-- near-duplicate.
--
-- A custom category is otherwise tagged onto a book exactly like a built-in
-- one (book_categories, shared across every owner of that book — see
-- 0006_category_permissions.sql's reasoning, unchanged here). The one thing
-- that's different: removing a *custom* tag from a book only stops it from
-- showing for the person who removed it, not for every other owner of that
-- book. A built-in category was curated centrally, so removing it is a real,
-- shared correction; a custom one was picked by some other user, and nothing
-- gives one owner the standing to un-tag a book for everyone else over a
-- category a stranger made up. book_category_hidden below is that per-user
-- override; the query layer (src/lib/queries/categories.ts) is what actually
-- routes a custom-category removal through it instead of a real delete.
-- =============================================================================

alter table categories
  add column created_by uuid references auth.users (id) on delete set null;

comment on column categories.created_by is
  'null = built-in/seeded category; set = created on the fly by this user via find_or_create_category().';

delete from book_categories
where category_id in (
  'fiction', 'non-fiction', 'business', 'psychology', 'self-help', 'history',
  'technology', 'biography', 'education', 'languages', 'poetry', 'art',
  'health', 'cooking', 'travel', 'law', 'other'
);

delete from categories
where id in (
  'fiction', 'non-fiction', 'business', 'psychology', 'self-help', 'history',
  'technology', 'biography', 'education', 'languages', 'poetry', 'art',
  'health', 'cooking', 'travel', 'law', 'other'
);

insert into categories (id, name_uz, name_ru, name_en, sort_order) values
  ('fiction-uz',    'Badiiy - O''zbek',  'Художественная (узб.)',    'Fiction (Uzbek)',         1),
  ('fiction-world', 'Badiiy - Jahon',    'Художественная (мировая)', 'Fiction (International)', 2),
  ('science',       'Ilmiy',             'Научная',                  'Science',                  3),
  ('religion',      'Diniy',             'Религия',                  'Religion',                 4),
  ('family',        'Oila',              'Семья',                    'Family',                   5),
  ('children',      'Bolalar adabiyoti', 'Детская литература',       'Children''s literature',   6)
on conflict (id) do update set
  name_uz    = excluded.name_uz,
  name_ru    = excluded.name_ru,
  name_en    = excluded.name_en,
  sort_order = excluded.sort_order;

-- Case-insensitive dedup for both built-ins and custom entries — someone
-- typing "diniy" should land on the existing 'religion' row, not create a
-- near-duplicate one letter apart in casing.
create unique index categories_name_uz_lower_idx on categories (lower(name_uz));

-- -----------------------------------------------------------------------------
-- find_or_create_category — the only way a new row is ever added to
-- categories from the client. security definer because authenticated has no
-- insert grant on categories at all (deliberately — see the comment above);
-- this function is the sole, narrow exception, and it only ever inserts a
-- category attributed to the caller themselves.
-- -----------------------------------------------------------------------------

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

  select id into v_id from categories where lower(name_uz) = lower(v_name);
  if v_id is not null then
    return v_id;
  end if;

  insert into categories (id, name_uz, name_ru, name_en, sort_order, created_by)
  values ('custom-' || gen_random_uuid()::text, v_name, v_name, v_name, 100, auth.uid())
  -- Another caller may have inserted the same name between the select above
  -- and this insert; on conflict, hand back the row that won the race
  -- instead of failing the request over a duplicate that isn't really one.
  on conflict (lower(name_uz)) do update set name_uz = categories.name_uz
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function find_or_create_category(text) from public;
grant execute on function find_or_create_category(text) to authenticated;

-- -----------------------------------------------------------------------------
-- book_category_hidden — the per-user "I've removed this from my view" record
-- for a custom category, described above. Deliberately has no household
-- sharing (unlike wishlist_items/user_books): this is one person's personal
-- override of what a shared tag shows them, not a household resource.
-- -----------------------------------------------------------------------------

create table book_category_hidden (
  book_id     uuid not null references books (id) on delete cascade,
  category_id text not null references categories (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (book_id, category_id, user_id)
);

alter table book_category_hidden enable row level security;

create policy "read own hidden categories"
  on book_category_hidden for select
  to authenticated
  using (auth.uid() = user_id);

create policy "hide a category for self"
  on book_category_hidden for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "unhide a category for self"
  on book_category_hidden for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on book_category_hidden to authenticated;
