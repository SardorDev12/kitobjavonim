-- =============================================================================
-- 0030_merge_books_into_user_books.sql — every copy owns its own book data
--
-- `books` was a shared catalog record from day one (0001_init.sql: "Two
-- users owning 'Atomic Habits' share one `books` row"). In practice that
-- sharing barely happens: ensureBook() (src/lib/queries/library.ts) only
-- reuses an existing row on an exact ISBN match, and import_library_rows()
-- (0023/0029) never reuses another user's row at all — its dedupe key is
-- scoped to the importing user's own copies. Meanwhile the sharing that DID
-- exist only ever caused friction: a household member reading a copy
-- someone else added couldn't fix a typo in the title or fill in a missing
-- cover (RLS: "creator can correct a book"), worked around once already for
-- page count via user_books.total_pages (0021) because there was no way to
-- override the shared books.page_count otherwise; and books.id's `on delete
-- restrict` meant a copy could never be fully deleted while the catalog
-- entry survived it — the exact bug report that prompted this migration
-- (2000+ imported test books, all deleted from a user's library, still
-- sitting in `books` afterward).
--
-- This folds every books column onto user_books and drops books entirely.
-- Deleting a user_books row now deletes everything about that book — there
-- is nothing left behind to orphan.
--
-- The one genuinely non-trivial part: book_categories hung off books.id,
-- so a single shared row's categories could be "owned" by many users'
-- copies at once. Splitting that back out means fanning one books.id's
-- category rows out to every user_books row that pointed at it — a
-- duplicating copy, not a rename. See step 3.
--
-- book_category_hidden (0022) is dropped outright rather than migrated: it
-- existed solely to let one owner hide a *shared* custom category from
-- their own view without un-tagging it for other owners of the same
-- books.id. Categories are per-copy now, so there's no other owner to
-- protect — removing a category from your own copy is just deleting your
-- own book_categories row, same as a built-in one.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add catalog columns to user_books, nullable/defaulted so this is safe
--    to run before the backfill populates them.
-- -----------------------------------------------------------------------------

alter table user_books
  add column isbn13            text,
  add column isbn10            text,
  add column title             text,
  add column subtitle          text,
  add column authors           text[] not null default '{}',
  add column publisher         text,
  add column publication_year  int check (publication_year between 1400 and 2200),
  add column language          text,
  add column cover_url         text,
  add column page_count        int check (page_count > 0),
  add column description       text,
  add column source            metadata_source not null default 'manual',
  add column source_id         text;

-- Backfill from books. page_count collapses two fields into one: the
-- client has always resolved a copy's page count as
-- `entry.page_count ?? entry.total_pages` (src/app/(tabs)/index.tsx) — the
-- shared books.page_count winning when set, user_books.total_pages (0021's
-- per-copy override, added because a non-creator had no other way to fill
-- in a missing shared page count) only as a fallback. Same precedence here,
-- so no row's displayed page count changes as a result of this migration.
update user_books ub
set isbn13            = b.isbn13,
    isbn10             = b.isbn10,
    title              = b.title,
    subtitle           = b.subtitle,
    authors            = b.authors,
    publisher          = b.publisher,
    publication_year   = b.publication_year,
    language           = b.language,
    cover_url          = b.cover_url,
    page_count         = coalesce(b.page_count, ub.total_pages),
    description        = b.description,
    source             = b.source,
    source_id          = b.source_id
from books b
where b.id = ub.book_id;

-- Same not-null/non-blank rule books.title always had — safe now that
-- every row was just backfilled above.
alter table user_books
  alter column title set not null,
  add constraint user_books_title_not_blank check (length(btrim(title)) > 0);

-- library_entries/listings still reference total_pages/book_id/books at
-- this point — drop both views now so the column drops below don't fail
-- on a dependency, and recreate them in their final shape once every
-- underlying column change is done (step 4).
drop view library_entries;
drop view listings;

-- The override's only reason to exist was that a non-creator couldn't
-- correct the shared books.page_count. Every row is independently owned
-- now, so there's nothing left to override.
alter table user_books drop column total_pages;

alter table user_books
  add column search_vector tsvector generated always as (
    books_search_document(title, subtitle, authors, publisher)
  ) stored;

create index user_books_search_idx        on user_books using gin (search_vector);
create index user_books_title_trgm_idx    on user_books using gin (title gin_trgm_ops);
create index user_books_authors_trgm_idx  on user_books using gin (authors_text(authors) gin_trgm_ops);
create index user_books_isbn13_idx        on user_books (isbn13) where isbn13 is not null;
create index user_books_language_idx      on user_books (language);
-- Deliberately no unique constraint on isbn13 — books' own `unique` was
-- only safe there because the table deduplicated by ISBN globally; here
-- every user can independently own a copy of the same real-world ISBN
-- (0001_init.sql already established the same principle for book_id: "A
-- user may legitimately own two copies of the same book").

-- -----------------------------------------------------------------------------
-- 2. book_categories — fan out from one shared books.id to every user_books
--    row that referenced it, then repoint the table at user_books.
-- -----------------------------------------------------------------------------

create temporary table _book_categories_fanout as
select ub.id as user_book_id, bc.category_id
from book_categories bc
join user_books ub on ub.book_id = bc.book_id;

-- The insert/delete policies below (0006) both check book_id in their
-- USING/WITH CHECK expressions, which blocks dropping the column — same
-- dependency problem as library_entries/listings in step 1.
drop policy "book categories are public" on book_categories;
drop policy "owners can categorise their books" on book_categories;
drop policy "owners can reclassify their books" on book_categories;

truncate table book_categories;

alter table book_categories
  drop constraint book_categories_pkey,
  drop column book_id,
  add column user_book_id uuid references user_books (id) on delete cascade,
  add primary key (user_book_id, category_id);

insert into book_categories (user_book_id, category_id)
select user_book_id, category_id from _book_categories_fanout;

drop table _book_categories_fanout;

-- No longer needed — see the module comment above for why.
drop table book_category_hidden;

create policy "book categories are public"
  on book_categories for select
  to anon, authenticated
  using (true);

-- Same ownership check as before (0006), just repointed at user_book_id —
-- deliberately still owner-only (no household clause), matching the
-- authorization this policy already had.
create policy "owners can categorise their books"
  on book_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from user_books ub
      where ub.id = book_categories.user_book_id
        and ub.user_id = auth.uid()
    )
  );

create policy "owners can reclassify their books"
  on book_categories for delete
  to authenticated
  using (
    exists (
      select 1 from user_books ub
      where ub.id = book_categories.user_book_id
        and ub.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Drop user_books.book_id and the books table itself. Plain DROP TABLE,
--    not CASCADE — anything still pointing at `books` at this point should
--    fail loudly here rather than be silently swept away.
-- -----------------------------------------------------------------------------

alter table user_books drop column book_id;

drop table books;

-- -----------------------------------------------------------------------------
-- 4. Recreate library_entries and listings in their final shape (dropped
--    earlier in step 1, once their old columns started disappearing) — they
--    could no longer CREATE OR REPLACE anyway, since columns are being
--    removed, not just appended. profile_stats is untouched throughout: it
--    never joined `books`.
-- -----------------------------------------------------------------------------

create view library_entries
with (security_invoker = true)
as
select
  ub.id,
  ub.user_id,
  coalesce(rp.reading_status, 'want_to_read') as reading_status,
  ub.condition,
  rp.rating,
  rp.review,
  rp.notes,
  ub.date_added,
  rp.date_finished,
  ub.availability_type,
  ub.listed_at,
  ub.exchange_preferences,
  ub.sale_price,
  ub.sale_currency,
  ub.price_negotiable,
  ub.sale_description,
  ub.bookshelf_position_id,
  ub.updated_at,

  ub.title,
  ub.subtitle,
  ub.authors,
  ub.cover_url,
  ub.isbn13,
  ub.publisher,
  ub.publication_year,
  ub.language,
  ub.page_count,
  ub.description,

  bs.id            as bookshelf_id,
  bs.name          as bookshelf_name,
  bs.sort_order    as bookshelf_sort_order,
  bp.shelf_number,
  bp.row_number,
  bp.label         as position_label,

  ub.household_id,
  pp.display_name  as added_by_name,
  pp.avatar_url    as added_by_avatar_url,

  rp.date_started,
  rp.current_page,
  rp.progress_percent,

  ub.shelf_note
from user_books ub
left join bookshelf_positions bp on bp.id = ub.bookshelf_position_id
left join bookshelves bs         on bs.id = bp.bookshelf_id
left join public_profiles pp     on pp.id = ub.user_id
left join reading_progress rp    on rp.user_book_id = ub.id and rp.user_id = auth.uid();

grant select on library_entries to authenticated;

create view listings
with (security_invoker = false)
as
select
  ub.id,
  ub.user_id,
  ub.availability_type,
  ub.condition,
  ub.sale_price,
  ub.sale_currency,
  ub.price_negotiable,
  ub.sale_description,
  ub.exchange_preferences,
  ub.listed_at,

  ub.title,
  ub.subtitle,
  ub.authors,
  ub.cover_url,
  ub.language,
  ub.isbn13,
  ub.publisher,
  ub.publication_year,
  ub.search_vector,

  pp.display_name as owner_name,
  pp.avatar_url   as owner_avatar_url,
  pp.region_id    as owner_region_id,
  pp.district_id  as owner_district_id,

  (select array_agg(bc.category_id) from book_categories bc where bc.user_book_id = ub.id)
    as category_ids,
  (select count(*) from user_book_photos ph where ph.user_book_id = ub.id)
    as photo_count
from user_books ub
join public_profiles pp on pp.id = ub.user_id
where ub.availability_type <> 'private';

grant select on listings to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Functions — everything that joined books directly.
-- -----------------------------------------------------------------------------

-- search_authors: was security invoker relying on "books are public"
-- (0016) — now queries user_books directly, still invoker (no security
-- definer keyword), so RLS on user_books ("read own copies": own rows plus
-- any household-shared ones) scopes the results automatically. That's the
-- "scoped to current user" behavior asked for, with no explicit auth.uid()
-- filter needed in the body — it falls out of RLS applying to an invoker-
-- mode function the same way it would to a plain client query.
create or replace function search_authors(query text)
returns table (name text)
language sql
stable
set search_path = public
as $$
  select distinct a
  from user_books, unnest(authors) as a
  where length(btrim(coalesce(query, ''))) >= 2
    and a ilike '%' || btrim(query) || '%'
  order by a
  limit 8;
$$;

revoke all on function search_authors(text) from public;
grant execute on function search_authors(text) to authenticated;
-- No anon grant: an anon caller has no readable user_books rows at all
-- under RLS, so it could only ever return empty for them.

create or replace function admin_stats()
returns table (
  total_users      bigint,
  total_books      bigint,
  total_listings   bigint,
  open_reports     bigint,
  resolved_reports bigint,
  new_users_7d     bigint,
  new_listings_7d  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from profiles),
    (select count(*) from user_books),
    (select count(*) from user_books where availability_type <> 'private'),
    (select count(*) from listing_reports where resolved_at is null),
    (select count(*) from listing_reports where resolved_at is not null),
    (select count(*) from profiles where created_at > now() - interval '7 days'),
    (select count(*) from user_books
       where availability_type <> 'private' and listed_at > now() - interval '7 days')
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin);
$$;

create or replace function admin_list_reports()
returns table (
  report_id           uuid,
  user_book_id        uuid,
  reason              text,
  details             text,
  resolved_at         timestamptz,
  created_at          timestamptz,
  reporter_id         uuid,
  reporter_name       text,
  book_title          text,
  owner_id            uuid,
  owner_name          text,
  availability_type   availability_type
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.user_book_id, r.reason, r.details, r.resolved_at, r.created_at,
    r.reporter_id, rp.display_name,
    ub.title,
    ub.user_id, op.display_name,
    ub.availability_type
  from listing_reports r
  join user_books ub on ub.id = r.user_book_id
  join profiles rp   on rp.id = r.reporter_id
  join profiles op   on op.id = ub.user_id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
  order by r.resolved_at nulls first, r.created_at desc;
$$;

-- admin_list_listings: return shape drops book_id (there's only one id
-- now) — create or replace can't change a function's return type, so this
-- is a genuine drop + recreate, not a like-for-like replace.
drop function admin_list_listings(text, int, int);

create function admin_list_listings(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  user_book_id       uuid,
  title              text,
  authors            text[],
  cover_url          text,
  availability_type  availability_type,
  sale_price         numeric,
  owner_id           uuid,
  owner_name         text,
  owner_email        text,
  listed_at          timestamptz,
  open_report_count  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ub.id, ub.title, ub.authors, ub.cover_url, ub.availability_type, ub.sale_price,
    p.id, p.display_name, u.email, ub.listed_at,
    (select count(*) from listing_reports r
       where r.user_book_id = ub.id and r.resolved_at is null)
  from user_books ub
  join profiles p    on p.id = ub.user_id
  join auth.users u  on u.id = p.id
  where ub.availability_type <> 'private'
    and exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
    and (
      p_search is null or btrim(p_search) = ''
      or ub.title ilike '%' || p_search || '%'
      or p.display_name ilike '%' || p_search || '%'
    )
  order by ub.listed_at desc nulls last
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

revoke all on function admin_list_listings(text, int, int) from public;
grant execute on function admin_list_listings(text, int, int) to authenticated;

-- admin_update_book / admin_delete_book: the parameter TYPE list is
-- unchanged (uuid in the same position), but create or replace still
-- refuses to rename an existing parameter (p_book_id -> p_user_book_id) —
-- drop + recreate, same as admin_list_listings above.
drop function admin_update_book(uuid, text, text, text[], text, int, text, text, text);

create function admin_update_book(
  p_user_book_id      uuid,
  p_title             text,
  p_subtitle          text,
  p_authors           text[],
  p_publisher         text,
  p_publication_year  int,
  p_language          text,
  p_cover_url         text,
  p_description       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update user_books set
    title             = p_title,
    subtitle          = p_subtitle,
    authors           = p_authors,
    publisher         = p_publisher,
    publication_year  = p_publication_year,
    language          = p_language,
    cover_url         = p_cover_url,
    description       = p_description
  where id = p_user_book_id;

  perform log_admin_action('update_book', p_user_book_id, jsonb_build_object('title', p_title));
end;
$$;

revoke all on function admin_update_book(uuid, text, text, text[], text, int, text, text, text) from public;
grant execute on function admin_update_book(uuid, text, text, text[], text, int, text, text, text) to authenticated;

-- Genuinely simpler now: deleting a copy WAS blocked by books' `on delete
-- restrict` while any other copy shared the same catalog row — there's no
-- shared row left to restrict against, so the foreign_key_violation catch
-- this used to need is gone. This is now a real, full delete: cascades
-- clean up reading_progress, user_book_photos, contact_requests,
-- listing_reports and book_categories the same way a user's own delete
-- already does.
drop function admin_delete_book(uuid);

create function admin_delete_book(p_user_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from user_books where id = p_user_book_id;
  perform log_admin_action('delete_book', p_user_book_id, null);
end;
$$;

revoke all on function admin_delete_book(uuid) from public;
grant execute on function admin_delete_book(uuid) to authenticated;

-- import_library_rows: the "new" branch now inserts one row instead of
-- two, and the dedupe map only ever needed user_book_id in the first
-- place — book_id was never used for anything past the seed/backfill.
create or replace function import_library_rows(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_row          jsonb;
  v_idx          int := 0;
  v_title        text;
  v_authors      text[];
  v_key          text;
  v_user_book_id uuid;
  v_is_new       boolean;
  v_status       reading_status;
  v_start_date   date;
  v_end_date     date;
  v_rating       int;
  v_review       text;
  v_pages        int;
  v_publisher    text;
  v_collections  text[];
  v_category_id  text;
  v_category_name text;
  v_row_error    text;
  v_category_warning text;
  v_results      jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  create temporary table if not exists _import_keys (
    key           text primary key,
    user_book_id  uuid not null
  ) on commit drop;

  insert into _import_keys (key, user_book_id)
  select lower(ub.title) || '|' || lower(array_to_string(ub.authors, ',')), ub.id
  from user_books ub
  where ub.user_id = v_uid
  on conflict (key) do nothing;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_row_error := null;
    v_category_warning := null;

    begin
      v_title := btrim(coalesce(v_row->>'title', ''));
      if v_title = '' then
        raise exception 'missing title';
      end if;

      select coalesce(array_agg(value), '{}')
      into v_authors
      from jsonb_array_elements_text(coalesce(v_row->'authors', '[]'::jsonb));

      v_key := lower(v_title) || '|' || lower(array_to_string(v_authors, ','));

      select ik.user_book_id into v_user_book_id
      from _import_keys ik where ik.key = v_key;

      v_is_new := v_user_book_id is null;
      v_pages := nullif(v_row->>'pages', '')::int;

      if v_is_new then
        v_publisher := nullif(btrim(coalesce(v_row->>'publisher', '')), '');

        insert into user_books (user_id, title, authors, publisher, page_count)
        values (v_uid, v_title, v_authors, v_publisher, v_pages)
        returning id into v_user_book_id;

        insert into _import_keys (key, user_book_id)
        values (v_key, v_user_book_id)
        on conflict (key) do nothing;
      end if;

      -- Client already normalized this to one of the three enum values
      -- (import.tsx's inferStatus) before it ever reaches here.
      v_status := coalesce(nullif(v_row->>'status', ''), 'want_to_read')::reading_status;
      v_start_date := nullif(v_row->>'startDate', '')::date;
      v_end_date := nullif(v_row->>'endDate', '')::date;
      v_rating := nullif(v_row->>'rating', '')::int;
      v_review := nullif(btrim(coalesce(v_row->>'review', '')), '');

      insert into reading_progress (
        user_book_id, user_id, reading_status, date_started, date_finished, rating, review
      )
      values (
        v_user_book_id, v_uid, v_status, v_start_date,
        case when v_status = 'finished' then v_end_date else null end,
        case when v_status = 'finished' then v_rating else null end,
        case when v_status = 'finished' then v_review else null end
      )
      on conflict (user_book_id, user_id) do update set
        reading_status = excluded.reading_status,
        date_started   = excluded.date_started,
        date_finished  = excluded.date_finished,
        rating         = excluded.rating,
        review         = excluded.review;

      begin
        select coalesce(array_agg(btrim(value)) filter (where btrim(value) <> ''), '{}')
        into v_collections
        from jsonb_array_elements_text(coalesce(v_row->'collections', '[]'::jsonb));

        foreach v_category_name in array v_collections loop
          v_category_id := find_or_create_category(v_category_name);
          insert into book_categories (user_book_id, category_id)
          values (v_user_book_id, v_category_id)
          on conflict (user_book_id, category_id) do nothing;
        end loop;
      exception when others then
        v_category_warning := sqlerrm;
      end;
    exception when others then
      v_row_error := sqlerrm;
    end;

    v_results := v_results || jsonb_build_object(
      'idx', v_idx,
      'error', v_row_error,
      'categoryWarning', v_category_warning,
      'merged', (v_row_error is null) and not v_is_new
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function import_library_rows(jsonb) from public;
grant execute on function import_library_rows(jsonb) to authenticated;
