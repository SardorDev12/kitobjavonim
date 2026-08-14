-- =============================================================================
-- 0013_admin_panel.sql
--
-- Backend for the standalone admin panel (a separate app, deployed to its own
-- subdomain — see admin/README.md). Everything here follows 0012's pattern:
-- SECURITY DEFINER functions that check is_admin themselves, rather than new
-- bypass RLS policies on profiles/user_books/books that would also apply to
-- every ordinary authenticated request from the consumer app.
--
-- Two operations are deliberately NOT here, because they need Supabase's
-- Auth Admin API (service_role only, not reachable from SQL): creating a new
-- admin account with a password, and banning/deleting an account. Those live
-- in supabase/functions/admin-users/, gated the same way — is_admin checked
-- against the caller's own session before anything privileged happens.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Stats — the numbers behind the panel's dashboard.
-- -----------------------------------------------------------------------------

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
    (select count(*) from books),
    (select count(*) from user_books where availability_type <> 'private'),
    (select count(*) from listing_reports where resolved_at is null),
    (select count(*) from listing_reports where resolved_at is not null),
    (select count(*) from profiles where created_at > now() - interval '7 days'),
    (select count(*) from user_books
       where availability_type <> 'private' and listed_at > now() - interval '7 days')
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin);
$$;

revoke all on function admin_stats() from public;
grant execute on function admin_stats() to authenticated;

-- -----------------------------------------------------------------------------
-- Users — list, search, and promote/demote admin status.
--
-- Reads auth.users directly for email and ban status: this function runs as
-- its owner (the migration-running role), which has that access same as any
-- other SECURITY DEFINER function here reaching past RLS on purpose.
-- -----------------------------------------------------------------------------

create or replace function admin_list_users(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  user_id       uuid,
  email         text,
  display_name  text,
  is_admin      boolean,
  is_banned     boolean,
  region_id     text,
  district_id   text,
  book_count    bigint,
  listing_count bigint,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, u.email, p.display_name, p.is_admin,
    (u.banned_until is not null and u.banned_until > now()),
    p.region_id, p.district_id,
    (select count(*) from user_books ub where ub.user_id = p.id),
    (select count(*) from user_books ub
       where ub.user_id = p.id and ub.availability_type <> 'private'),
    p.created_at
  from profiles p
  join auth.users u on u.id = p.id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
    and (
      p_search is null or btrim(p_search) = ''
      or p.display_name ilike '%' || p_search || '%'
      or u.email ilike '%' || p_search || '%'
    )
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

revoke all on function admin_list_users(text, int, int) from public;
grant execute on function admin_list_users(text, int, int) to authenticated;

-- Promoting/demoting an EXISTING user. Creating a brand new admin account
-- (fresh email + password) goes through the Edge Function instead, since
-- that needs the Auth Admin API to set a password at all.
create or replace function admin_set_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Demoting the last admin would lock every admin out for good, with no
  -- self-service way back in (there is deliberately no sign-up screen).
  if not p_is_admin and p_user_id = auth.uid()
     and (select count(*) from profiles where is_admin) <= 1 then
    raise exception 'cannot remove the last remaining admin' using errcode = '23514';
  end if;

  update profiles set is_admin = p_is_admin where id = p_user_id;
end;
$$;

revoke all on function admin_set_admin(uuid, boolean) from public;
grant execute on function admin_set_admin(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Listings — every public copy, with the owner and open-report count, so
-- moderation doesn't require jumping between this and the reports queue.
-- -----------------------------------------------------------------------------

create or replace function admin_list_listings(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  user_book_id       uuid,
  book_id            uuid,
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
    ub.id, b.id, b.title, b.authors, b.cover_url, ub.availability_type, ub.sale_price,
    p.id, p.display_name, u.email, ub.listed_at,
    (select count(*) from listing_reports r
       where r.user_book_id = ub.id and r.resolved_at is null)
  from user_books ub
  join books b    on b.id = ub.book_id
  join profiles p on p.id = ub.user_id
  join auth.users u on u.id = p.id
  where ub.availability_type <> 'private'
    and exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
    and (
      p_search is null or btrim(p_search) = ''
      or b.title ilike '%' || p_search || '%'
      or p.display_name ilike '%' || p_search || '%'
    )
  order by ub.listed_at desc nulls last
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

revoke all on function admin_list_listings(text, int, int) from public;
grant execute on function admin_list_listings(text, int, int) to authenticated;

-- Pulls a copy off public discovery without touching the owner's library —
-- it's still theirs, it just stops being a listing. Distinct from
-- admin_resolve_report (0012): resolving a report doesn't have to mean the
-- listing was actually taken down, and unlisting doesn't require a report
-- to have existed in the first place.
create or replace function admin_unlist(p_user_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update user_books set availability_type = 'private' where id = p_user_book_id;
end;
$$;

revoke all on function admin_unlist(uuid) from public;
grant execute on function admin_unlist(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Book catalog moderation — books are a shared record (0003_rls.sql limits
-- edits to whoever created the row), so fixing a bad catalog entry someone
-- else added needs its own bypass.
-- -----------------------------------------------------------------------------

create or replace function admin_update_book(
  p_book_id           uuid,
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

  update books set
    title             = p_title,
    subtitle          = p_subtitle,
    authors           = p_authors,
    publisher         = p_publisher,
    publication_year  = p_publication_year,
    language          = p_language,
    cover_url         = p_cover_url,
    description       = p_description
  where id = p_book_id;
end;
$$;

revoke all on function admin_update_book(uuid, text, text, text[], text, int, text, text, text) from public;
grant execute on function admin_update_book(uuid, text, text, text[], text, int, text, text, text) to authenticated;

-- books.id has `on delete restrict` from user_books — a catalog entry still
-- on someone's shelf can't be deleted out from under them, so this surfaces
-- that as a clear error instead of a raw FK violation.
create or replace function admin_delete_book(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from books where id = p_book_id;
exception
  when foreign_key_violation then
    raise exception 'still on at least one user''s shelf — remove it from every library first'
      using errcode = '23503';
end;
$$;

revoke all on function admin_delete_book(uuid) from public;
grant execute on function admin_delete_book(uuid) to authenticated;
